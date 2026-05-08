import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { WorkspaceTreeItem } from '../models/treeItems';
import { WorkspaceTreeDataProvider, WorkspaceStatusProvider } from './workspaceTreeProvider';
import {
	AgentLocation,
	findAgentLocationForPath,
	getAgentLocations,
} from '../services/agentLocations';
import { messages } from '../i18n';

type AgentEntry = {
	name: string;
	fullPath: string;
	isFile: boolean;
	location?: AgentLocation;
};

type AgentEntryReader = (agentsDir: string) => AgentEntry[];
type AgentLocationReader = () => AgentLocation[];

export class AgentExplorerProvider extends WorkspaceTreeDataProvider<WorkspaceTreeItem> {
	private readonly readEntries: AgentEntryReader;
	private readonly readLocations: AgentLocationReader;

	constructor(
		_context: vscode.ExtensionContext,
		statusProvider?: WorkspaceStatusProvider,
		readEntries: AgentEntryReader = listAgentEntries,
		readLocations: AgentLocationReader = getAgentLocations,
	) {
		super(statusProvider);
		this.readEntries = readEntries;
		this.readLocations = readLocations;
	}

	protected getAvailableChildren(element?: WorkspaceTreeItem): vscode.ProviderResult<WorkspaceTreeItem[]> {
		if (element) {
			return [];
		}
		const entries = this.readLocations().flatMap((location) =>
			this.readEntries(location.rootPath)
				.filter((entry) => this.isDisplayableAgentEntry(entry, location))
				.map((entry) => ({ ...entry, location })),
		);
		if (entries.length === 0) {
			return [this.toEmptyItem()];
		}
		return entries
			.sort((left, right) =>
				(left.location?.priority ?? 99) - (right.location?.priority ?? 99) ||
				left.name.localeCompare(right.name, undefined, {
					numeric: true,
					sensitivity: 'base',
				}) ||
				left.fullPath.localeCompare(right.fullPath, undefined, {
					numeric: true,
					sensitivity: 'base',
				}),
			)
			.map((entry) => this.toTreeItem(entry, entry.location!));
	}

	private isDisplayableAgentEntry(entry: AgentEntry, location: AgentLocation): boolean {
		if (!entry.isFile) {
			return false;
		}
		const lowerName = entry.name.toLowerCase();
		if (lowerName.endsWith('.agent.md')) {
			return true;
		}
		return location.kind === 'plugin' && lowerName.endsWith('.md');
	}

	getLocationForPath(targetPath: string): AgentLocation | undefined {
		return findAgentLocationForPath(targetPath, this.readLocations());
	}

	getRootOptions(): AgentLocation[] {
		return this.readLocations();
	}

	private toTreeItem(entry: AgentEntry, location: AgentLocation): WorkspaceTreeItem {
		const item = new WorkspaceTreeItem(
			'file',
			'agents',
			entry.name,
			vscode.TreeItemCollapsibleState.None,
			entry.fullPath,
		);
		item.id = entry.fullPath;
		item.contextValue = location.kind === 'plugin' ? 'copilot-agent-readonly' : 'copilot-agent-file';
		item.description = location.label;
		item.tooltip = `${location.label}: ${entry.fullPath}`;
		item.command = {
			command: 'copilot-workspace-manager.openFile',
			title: 'Open agent file',
			arguments: [item],
		};
		item.iconPath = new vscode.ThemeIcon('hubot');
		return item;
	}

	private toEmptyItem(): WorkspaceTreeItem {
		const item = new WorkspaceTreeItem(
			'file',
			'agents',
			messages.agentExplorerEmpty,
			vscode.TreeItemCollapsibleState.None,
		);
		item.contextValue = 'copilot-agent-empty';
		item.iconPath = new vscode.ThemeIcon('info');
		return item;
	}
}

function listAgentEntries(agentsDir: string): AgentEntry[] {
	if (!fs.existsSync(agentsDir)) {
		return [];
	}
	return fs.readdirSync(agentsDir, { withFileTypes: true }).map((entry) => ({
		name: entry.name,
		fullPath: path.join(agentsDir, entry.name),
		isFile: entry.isFile(),
	}));
}

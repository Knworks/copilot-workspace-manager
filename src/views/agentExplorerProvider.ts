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

type AgentEntry = {
	name: string;
	fullPath: string;
	isFile: boolean;
};

type AgentEntryReader = (agentsDir: string) => AgentEntry[];
type AgentLocationReader = () => AgentLocation[];

/**
 * Provides the Agents tree view by listing Copilot CLI `.agent.md` files.
 */
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
		if (!element) {
			return this.readLocations().map((location) => this.toRootItem(location));
		}
		if (element.nodeType !== 'root' || !element.fsPath) {
			return [];
		}
		const location = this.getLocationForPath(element.fsPath);
		if (!location) {
			return [];
		}
		return this.readEntries(location.rootPath)
			.filter((entry) => entry.isFile && entry.name.toLowerCase().endsWith('.agent.md'))
			.sort((left, right) =>
				left.name.localeCompare(right.name, undefined, {
					numeric: true,
					sensitivity: 'base',
				}),
			)
			.map((entry) => this.toTreeItem(entry, location));
	}

	getLocationForPath(targetPath: string): AgentLocation | undefined {
		return findAgentLocationForPath(targetPath, this.readLocations());
	}

	getRootOptions(): AgentLocation[] {
		return this.readLocations();
	}

	private toTreeItem(
		entry: AgentEntry,
		location: AgentLocation,
	): WorkspaceTreeItem {
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
				item.iconPath = this.getIcon(location.kind === 'plugin');
				return item;
	}

	private toRootItem(location: AgentLocation): WorkspaceTreeItem {
		const item = new WorkspaceTreeItem(
			'root',
			'agents',
			location.label,
			vscode.TreeItemCollapsibleState.Collapsed,
			location.rootPath,
		);
		item.id = `agents:${location.rootPath}`;
		item.contextValue = location.kind === 'plugin' ? 'copilot-agent-readonly' : 'workspace-root';
		item.description = location.rootPath;
		item.tooltip = location.rootPath;
		item.iconPath = location.kind === 'plugin'
			? new vscode.ThemeIcon('lock', new vscode.ThemeColor('disabledForeground'))
			: new vscode.ThemeIcon('folder-library');
		return item;
	}

	private getIcon(isReadonly: boolean): vscode.ThemeIcon {
		return isReadonly
			? new vscode.ThemeIcon('lock', new vscode.ThemeColor('disabledForeground'))
			: new vscode.ThemeIcon('hubot');
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


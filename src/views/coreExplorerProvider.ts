import * as vscode from 'vscode';
import fs from 'fs';
import path from 'path';
import { WorkspaceTreeDataProvider, WorkspaceStatusProvider } from './workspaceTreeProvider';
import { WorkspaceTreeItem } from '../models/treeItems';
import {
	getCoreWorkspaceStatus,
	getCopilotConfigStatus,
	resolveCopilotPaths,
} from '../services/workspaceStatus';
import { AgentsChainNode, buildAgentsLoadingChain } from '../services/coreDiagnosticsService';
import { messages } from '../i18n';

type CoreEntry = {
	label: string;
	fsPath: string;
	icon?: string | { light: string; dark: string };
	description?: string;
	warnOnInvalidConfig?: boolean;
};

export class CoreExplorerProvider extends WorkspaceTreeDataProvider<WorkspaceTreeItem> {
	private readonly context: vscode.ExtensionContext;
	private readonly configStatusProvider: WorkspaceStatusProvider;

	constructor(
		context: vscode.ExtensionContext,
		statusProvider: WorkspaceStatusProvider = getCoreWorkspaceStatus,
		configStatusProvider: WorkspaceStatusProvider = getCopilotConfigStatus,
	) {
		super(statusProvider);
		this.context = context;
		this.configStatusProvider = configStatusProvider;
	}

	protected getAvailableChildren(): vscode.ProviderResult<WorkspaceTreeItem[]> {
		const paths = resolveCopilotPaths();
		const configStatus = this.configStatusProvider();
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const entries: CoreEntry[] = [
			{
				label: 'config.json',
				fsPath: paths.configPath,
				icon: 'settings-gear',
				description: 'Internal Config',
				warnOnInvalidConfig: true,
			},
			{
				label: 'settings.json',
				fsPath: path.join(paths.copilotDir, 'settings.json'),
				icon: 'settings-gear',
				description: 'User Settings',
			},
			...(workspaceRoot
				? [
					{
						label: 'settings.json',
						fsPath: path.join(workspaceRoot, '.github', 'copilot', 'settings.json'),
						icon: 'settings-gear',
						description: 'Workspace Settings',
					},
					{
						label: 'settings.local.json',
						fsPath: path.join(workspaceRoot, '.github', 'copilot', 'settings.local.json'),
						icon: 'settingsfile32.png',
						description: 'Workspace Local Settings',
					},
				]
				: []),
			{
				label: 'mcp-config.json',
				fsPath: paths.mcpConfigPath,
				icon: 'mcp',
			},
			...(workspaceRoot
				? this.collectInstructionEntries(workspaceRoot)
				: []),
		];

		const items = entries
			.filter((entry) => fs.existsSync(entry.fsPath))
			.map((entry) => this.toTreeItem(entry, configStatus));
		return items.length > 0 ? items : [this.toEmptyItem()];
	}

	private collectInstructionEntries(workspaceRoot: string): CoreEntry[] {
		return buildAgentsLoadingChain(workspaceRoot).map((entry) => this.toInstructionEntry(entry));
	}

	private toInstructionEntry(entry: AgentsChainNode): CoreEntry {
		return {
			label: entry.fileName,
			fsPath: entry.absolutePath,
			icon: entry.kind === 'agent' || entry.kind === 'customAgent'
				? { light: 'agents_light.png', dark: 'agents_dark.png' }
				: 'copilot',
			description: this.toInstructionDescription(entry),
		};
	}

	private toInstructionDescription(entry: AgentsChainNode): string {
		switch (entry.kind) {
			case 'user':
				return 'User Instructions';
			case 'workspace':
				return 'Workspace Instructions';
			case 'path':
				return 'Path Instructions';
			case 'agent':
				return 'Agent Instructions';
			case 'customAgent':
				return 'Custom Agent Instructions';
		}
	}

	private toTreeItem(
		entry: CoreEntry,
		configStatus: { isAvailable: boolean; reason?: string },
	): WorkspaceTreeItem {
		const item = new WorkspaceTreeItem(
			'file',
			'core',
			entry.label,
			vscode.TreeItemCollapsibleState.None,
			entry.fsPath,
		);
		item.description = entry.description;
		item.tooltip = entry.fsPath;
		item.command = {
			command: 'copilot-workspace-manager.openFile',
			title: `Open ${entry.label}`,
			arguments: [item],
		};
		if (entry.warnOnInvalidConfig && !configStatus.isAvailable && configStatus.reason) {
			item.tooltip = configStatus.reason;
			item.iconPath = new vscode.ThemeIcon('warning');
			return item;
		}
		item.iconPath = this.getIcon(entry.icon);
		return item;
	}

	private toEmptyItem(): WorkspaceTreeItem {
		const item = new WorkspaceTreeItem(
			'file',
			'core',
			messages.coreExplorerEmpty,
			vscode.TreeItemCollapsibleState.None,
		);
		item.contextValue = 'copilot-core-empty';
		item.iconPath = new vscode.ThemeIcon('info');
		return item;
	}

	private getIcon(
		icon: string | { light: string; dark: string } | undefined,
	): vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } {
		if (!icon) {
			return new vscode.ThemeIcon('file');
		}
		if (typeof icon === 'string' && !icon.endsWith('.png')) {
			return new vscode.ThemeIcon(icon);
		}
		const lightFileName = typeof icon === 'string' ? icon : icon.light;
		const darkFileName = typeof icon === 'string' ? icon : icon.dark;
		const lightPath = this.context.asAbsolutePath(path.join('images', lightFileName));
		const darkPath = this.context.asAbsolutePath(path.join('images', darkFileName));
		return {
			light: vscode.Uri.file(lightPath),
			dark: vscode.Uri.file(darkPath),
		};
	}
}

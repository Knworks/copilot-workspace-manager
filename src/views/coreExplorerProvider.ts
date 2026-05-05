import * as vscode from 'vscode';
import path from 'path';
import { WorkspaceTreeDataProvider, WorkspaceStatusProvider } from './workspaceTreeProvider';
import { WorkspaceTreeItem } from '../models/treeItems';
import {
	getCoreWorkspaceStatus,
	getWorkspaceStatus,
	resolveCopilotPaths,
} from '../services/workspaceStatus';

export class CoreExplorerProvider extends WorkspaceTreeDataProvider<WorkspaceTreeItem> {
	private readonly context: vscode.ExtensionContext;
	private readonly configStatusProvider: WorkspaceStatusProvider;

	constructor(
		context: vscode.ExtensionContext,
		statusProvider: WorkspaceStatusProvider = getCoreWorkspaceStatus,
		configStatusProvider: WorkspaceStatusProvider = getWorkspaceStatus,
	) {
		super(statusProvider);
		this.context = context;
		this.configStatusProvider = configStatusProvider;
	}

	protected getAvailableChildren(): vscode.ProviderResult<WorkspaceTreeItem[]> {
		const paths = resolveCopilotPaths();
		const configStatus = this.configStatusProvider();
		const configItem = new WorkspaceTreeItem(
			'file',
			'core',
			'config.json',
			vscode.TreeItemCollapsibleState.None,
			paths.configPath,
		);
		configItem.command = {
			command: 'copilot-workspace-manager.openFile',
			title: 'Open config.json',
			arguments: [configItem],
		};
		if (!configStatus.isAvailable && configStatus.reason) {
			configItem.tooltip = configStatus.reason;
			configItem.iconPath = new vscode.ThemeIcon('warning');
		} else {
			configItem.iconPath = this.getIcon('settingsfile32.png');
		}

		const mcpItem = new WorkspaceTreeItem(
			'file',
			'core',
			'mcp-config.json',
			vscode.TreeItemCollapsibleState.None,
			path.join(paths.copilotDir, 'mcp-config.json'),
		);
		mcpItem.command = {
			command: 'copilot-workspace-manager.openFile',
			title: 'Open mcp-config.json',
			arguments: [mcpItem],
		};
		mcpItem.iconPath = this.getIcon('settingsfile32.png');

		const permissionsItem = new WorkspaceTreeItem(
			'file',
			'core',
			'permissions-config.json',
			vscode.TreeItemCollapsibleState.None,
			path.join(paths.copilotDir, 'permissions-config.json'),
		);
		permissionsItem.command = {
			command: 'copilot-workspace-manager.openFile',
			title: 'Open permissions-config.json',
			arguments: [permissionsItem],
		};
		permissionsItem.iconPath = this.getIcon('settingsfile32.png');

		const userInstructionsItem = new WorkspaceTreeItem(
			'file',
			'core',
			'copilot-instructions.md',
			vscode.TreeItemCollapsibleState.None,
			path.join(paths.copilotDir, 'copilot-instructions.md'),
		);
		userInstructionsItem.command = {
			command: 'copilot-workspace-manager.openFile',
			title: 'Open copilot-instructions.md',
			arguments: [userInstructionsItem],
		};
		userInstructionsItem.iconPath = this.getIcon('markdown32.png');

		const folderItems = ['agents', 'skills', 'hooks', 'logs', 'session-state', 'installed-plugins'].map(
			(folderName) => {
				const folderItem = new WorkspaceTreeItem(
					'folder',
					'core',
					folderName,
					vscode.TreeItemCollapsibleState.None,
					path.join(paths.copilotDir, folderName),
				);
				folderItem.command = {
					command: 'copilot-workspace-manager.openFile',
					title: `Open ${folderName}`,
					arguments: [folderItem],
				};
				folderItem.iconPath = this.getIcon('folder32.png');
				return folderItem;
			},
		);

		const items = [
			configItem,
			mcpItem,
			permissionsItem,
			userInstructionsItem,
			...folderItems,
		];
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (workspaceRoot) {
			const repositoryInstructionsPath = path.join(
				workspaceRoot,
				'.github',
				'copilot-instructions.md',
			);
			const repositoryInstructionsItem = new WorkspaceTreeItem(
				'file',
				'core',
				'Repository copilot-instructions.md',
				vscode.TreeItemCollapsibleState.None,
				repositoryInstructionsPath,
			);
			repositoryInstructionsItem.command = {
				command: 'copilot-workspace-manager.openFile',
				title: 'Open repository copilot-instructions.md',
				arguments: [repositoryInstructionsItem],
			};
			repositoryInstructionsItem.iconPath = this.getIcon('markdown32.png');
			items.push(repositoryInstructionsItem);
		}

		return items;
	}

	private getIcon(
		lightFileName: string,
		darkFileName?: string,
	): { light: vscode.Uri; dark: vscode.Uri } {
		const lightPath = this.context.asAbsolutePath(
			path.join('images', lightFileName),
		);
		const darkPath = this.context.asAbsolutePath(
			path.join('images', darkFileName ?? lightFileName),
		);
		return {
			light: vscode.Uri.file(lightPath),
			dark: vscode.Uri.file(darkPath),
		};
	}
}

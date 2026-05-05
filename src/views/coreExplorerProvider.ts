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
		const items: WorkspaceTreeItem[] = [];

		if (fs.existsSync(paths.configPath)) {
			const configItem = this.toFileItem('config.json', paths.configPath, 'settingsfile32.png');
			if (!configStatus.isAvailable && configStatus.reason) {
				configItem.tooltip = configStatus.reason;
				configItem.iconPath = new vscode.ThemeIcon('warning');
			}
			items.push(configItem);
		}

		if (fs.existsSync(paths.mcpConfigPath)) {
			items.push(this.toFileItem('mcp-config.json', paths.mcpConfigPath, 'settingsfile32.png'));
		}

		const userInstructionsPath = path.join(paths.copilotDir, 'copilot-instructions.md');
		if (fs.existsSync(userInstructionsPath)) {
			const item = this.toFileItem(
				'copilot-instructions.md',
				userInstructionsPath,
				'markdown32.png',
			);
			item.description = 'User Instructions';
			items.push(item);
		}

		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (workspaceRoot) {
			const workspaceInstructionsPath = path.join(
				workspaceRoot,
				'.github',
				'copilot-instructions.md',
			);
			if (fs.existsSync(workspaceInstructionsPath)) {
				const item = this.toFileItem(
					'copilot-instructions.md',
					workspaceInstructionsPath,
					'markdown32.png',
				);
				item.description = 'Workspace Instructions';
				items.push(item);
			}
		}

		return items;
	}

	private toFileItem(
		label: string,
		fsPath: string,
		iconFileName: string,
	): WorkspaceTreeItem {
		const item = new WorkspaceTreeItem(
			'file',
			'core',
			label,
			vscode.TreeItemCollapsibleState.None,
			fsPath,
		);
		item.command = {
			command: 'copilot-workspace-manager.openFile',
			title: `Open ${label}`,
			arguments: [item],
		};
		item.iconPath = this.getIcon(iconFileName);
		return item;
	}

	private getIcon(
		lightFileName: string,
		darkFileName?: string,
	): { light: vscode.Uri; dark: vscode.Uri } {
		const lightPath = this.context.asAbsolutePath(path.join('images', lightFileName));
		const darkPath = this.context.asAbsolutePath(
			path.join('images', darkFileName ?? lightFileName),
		);
		return {
			light: vscode.Uri.file(lightPath),
			dark: vscode.Uri.file(darkPath),
		};
	}
}

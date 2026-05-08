import * as vscode from 'vscode';
import { WorkspaceTreeDataProvider } from './workspaceTreeProvider';
import { WorkspaceTreeItem } from '../models/treeItems';
import { readMcpServers } from '../services/mcpService';
import { getCoreWorkspaceStatus, resolveCopilotPaths } from '../services/workspaceStatus';
import { messages } from '../i18n';

export class McpExplorerProvider extends WorkspaceTreeDataProvider<WorkspaceTreeItem> {
	constructor(_context: vscode.ExtensionContext) {
		super(getCoreWorkspaceStatus);
	}

	protected getAvailableChildren(): vscode.ProviderResult<WorkspaceTreeItem[]> {
		const paths = resolveCopilotPaths();
		const servers = readMcpServers(paths.mcpConfigPath, paths.mcpDisabledConfigPath);
		const items = servers.map((server) => {
			const item = new WorkspaceTreeItem(
				'mcpServer',
				'mcp',
				server.id,
				vscode.TreeItemCollapsibleState.None,
			);
			item.contextValue = 'copilot-mcp-server';
			item.description = server.sourceLabel ?? (server.enabled ? undefined : messages.mcpDisabled);
			item.iconPath = server.enabled
				? new vscode.ThemeIcon('mcp')
				: new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
			return item;
		});
		return items.length > 0 ? items : [this.toEmptyItem()];
	}

	private toEmptyItem(): WorkspaceTreeItem {
		const item = new WorkspaceTreeItem(
			'file',
			'mcp',
			messages.mcpExplorerEmpty,
			vscode.TreeItemCollapsibleState.None,
		);
		item.contextValue = 'copilot-mcp-empty';
		item.iconPath = new vscode.ThemeIcon('info');
		return item;
	}
}

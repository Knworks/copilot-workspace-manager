import * as vscode from 'vscode';
import { WorkspaceTreeDataProvider } from './workspaceTreeProvider';
import { WorkspaceTreeItem } from '../models/treeItems';
import { getMcpConfigPath, readMcpServers } from '../services/mcpService';
import { getCoreWorkspaceStatus, resolveCopilotPaths } from '../services/workspaceStatus';

export class McpExplorerProvider extends WorkspaceTreeDataProvider<WorkspaceTreeItem> {
	constructor(_context: vscode.ExtensionContext) {
		super(getCoreWorkspaceStatus);
	}

	protected getAvailableChildren(): vscode.ProviderResult<WorkspaceTreeItem[]> {
		const configPath = getMcpConfigPath(resolveCopilotPaths().copilotDir);
		const servers = readMcpServers(configPath);
		return servers.map((server) => {
			const item = new WorkspaceTreeItem(
				'mcpServer',
				'mcp',
				server.id,
				vscode.TreeItemCollapsibleState.None,
			);
			item.contextValue = 'copilot-mcp-server';
			item.iconPath = new vscode.ThemeIcon('mcp');
			return item;
		});
	}
}

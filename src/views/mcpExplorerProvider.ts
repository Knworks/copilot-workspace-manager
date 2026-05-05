import * as vscode from 'vscode';
import { WorkspaceTreeDataProvider } from './workspaceTreeProvider';
import { WorkspaceTreeItem } from '../models/treeItems';
import { getMcpConfigPath, readMcpServers } from '../services/mcpService';
import { getCoreWorkspaceStatus, resolveCopilotPaths } from '../services/workspaceStatus';
import path from 'path';

export class McpExplorerProvider extends WorkspaceTreeDataProvider<WorkspaceTreeItem> {
	constructor(_context: vscode.ExtensionContext) {
		super(getCoreWorkspaceStatus);
	}

	protected getAvailableChildren(): vscode.ProviderResult<WorkspaceTreeItem[]> {
		const configPath = getMcpConfigPath(resolveCopilotPaths().copilotDir);
		const servers = readMcpServers(configPath);
		const configItems = this.getConfigItems(configPath);
		const serverItems = servers.map((server) => {
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
		return [...configItems, ...serverItems];
	}

	private getConfigItems(userConfigPath: string): WorkspaceTreeItem[] {
		const items: WorkspaceTreeItem[] = [];
		items.push(this.toConfigItem('User MCP config', userConfigPath));
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (workspaceRoot) {
			items.push(this.toConfigItem('Workspace MCP config', path.join(workspaceRoot, '.github', 'mcp.json')));
		}
		return items;
	}

	private toConfigItem(label: string, filePath: string): WorkspaceTreeItem {
		const item = new WorkspaceTreeItem(
			'file',
			'mcp',
			label,
			vscode.TreeItemCollapsibleState.None,
			filePath,
		);
		item.contextValue = 'workspace-file';
		item.description = filePath;
		item.tooltip = filePath;
		item.command = {
			command: 'copilot-workspace-manager.openFile',
			title: 'Open MCP config',
			arguments: [item],
		};
		item.iconPath = new vscode.ThemeIcon('json');
		return item;
	}
}

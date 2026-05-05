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

type CoreEntry = {
	label: string;
	fsPath: string;
	iconFileName: string;
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
				iconFileName: 'settingsfile32.png',
				description: 'Internal Config',
				warnOnInvalidConfig: true,
			},
			{
				label: 'settings.json',
				fsPath: path.join(paths.copilotDir, 'settings.json'),
				iconFileName: 'settingsfile32.png',
				description: 'User Settings',
			},
			...(workspaceRoot
				? [
					{
						label: 'settings.json',
						fsPath: path.join(workspaceRoot, '.github', 'copilot', 'settings.json'),
						iconFileName: 'settingsfile32.png',
						description: 'Workspace Settings',
					},
					{
						label: 'settings.local.json',
						fsPath: path.join(workspaceRoot, '.github', 'copilot', 'settings.local.json'),
						iconFileName: 'settingsfile32.png',
						description: 'Workspace Local Settings',
					},
				]
				: []),
			{
				label: 'mcp-config.json',
				fsPath: paths.mcpConfigPath,
				iconFileName: 'settingsfile32.png',
			},
			{
				label: 'copilot-instructions.md',
				fsPath: path.join(paths.copilotDir, 'copilot-instructions.md'),
				iconFileName: 'markdown32.png',
				description: 'User Instructions',
			},
			...(workspaceRoot
				? [
					{
						label: 'copilot-instructions.md',
						fsPath: path.join(workspaceRoot, '.github', 'copilot-instructions.md'),
						iconFileName: 'markdown32.png',
						description: 'Workspace Instructions',
					},
				]
				: []),
			...(workspaceRoot
				? this.collectAgentsEntries(workspaceRoot)
				: []),
		];

		return entries
			.filter((entry) => fs.existsSync(entry.fsPath))
			.map((entry) => this.toTreeItem(entry, configStatus));
	}

	private collectAgentsEntries(workspaceRoot: string): CoreEntry[] {
		const primaryAgentsPath = path.join(workspaceRoot, 'AGENTS.md');
		const additionalAgentsPaths = this.findAdditionalAgentsPaths(workspaceRoot).sort((left, right) =>
			left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }),
		);
		return [
			{
				label: 'AGENTS.md',
				fsPath: primaryAgentsPath,
				iconFileName: 'markdown32.png',
				description: 'Primary Instructions',
			},
			...additionalAgentsPaths.map((agentsPath) => ({
				label: 'AGENTS.md',
				fsPath: agentsPath,
				iconFileName: 'markdown32.png',
				description: 'Additional Instructions',
			})),
		];
	}

	private findAdditionalAgentsPaths(workspaceRoot: string): string[] {
		const results: string[] = [];
		const skipDirNames = new Set(['.git', 'node_modules', '.vscode-test', 'dist', 'out']);
		const visit = (currentDir: string): void => {
			for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
				if (entry.isDirectory()) {
					if (skipDirNames.has(entry.name)) {
						continue;
					}
					visit(path.join(currentDir, entry.name));
					continue;
				}
				if (!entry.isFile() || entry.name !== 'AGENTS.md') {
					continue;
				}
				const fullPath = path.join(currentDir, entry.name);
				if (path.resolve(fullPath) === path.resolve(path.join(workspaceRoot, 'AGENTS.md'))) {
					continue;
				}
				results.push(fullPath);
			}
		};
		visit(workspaceRoot);
		return results;
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
		item.iconPath = this.getIcon(entry.iconFileName);
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

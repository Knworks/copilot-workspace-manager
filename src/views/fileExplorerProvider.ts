import fs from 'fs';
import * as vscode from 'vscode';
import path from 'path';
import { WorkspaceTreeDataProvider, WorkspaceStatusProvider } from './workspaceTreeProvider';
import { WorkspaceTreeItem, FileViewKind } from '../models/treeItems';
import {
	resolveCopilotPaths,
	TEMPLATE_FOLDER_NAME,
} from '../services/workspaceStatus';
import { FileEntry, listFileEntries } from '../services/fileTreeService';
import {
	findSkillLocationForPath,
	getSkillLocations,
	SkillLocation,
} from '../services/skillLocations';
import { isSkillEnabled } from '../services/skillConfigService';
import { listInstalledPluginsFromConfig, resolvePluginManifestPath } from '../services/pluginConfigService';
import { messages } from '../i18n';

const FILE_ICON_MAP: Record<string, string> = {
	'.md': 'markdown32.png',
	'.py': 'python32.png',
	'.txt': 'text32.png',
	'.xml': 'file_xml32.png',
	'.yaml': 'settingsfile32.png',
	'.yml': 'settingsfile32.png',
	'.toml': 'settingsfile32.png',
	'.png': 'image32.png',
	'.jpg': 'image32.png',
	'.jpeg': 'image32.png',
	'.bmp': 'image32.png',
	'.gif': 'image32.png',
	'.ico': 'image32.png',
	'.icon': 'image32.png',
	'.xls': 'office_excel32.png',
	'.xlsx': 'office_excel32.png',
	'.doc': 'office_word32.png',
	'.docx': 'office_word32.png',
	'.ppt': 'office_powerpoint32.png',
	'.pptx': 'office_powerpoint32.png',
	'.ps1': 'powershell32.png',
	'.js': 'script32.png',
	'.vbs': 'file_vb32.png',
	'.vb': 'file_vb32.png',
};

export class FileExplorerProvider extends WorkspaceTreeDataProvider<WorkspaceTreeItem> {
	private readonly kind: FileViewKind;
	private readonly context: vscode.ExtensionContext;
	private readonly rootPathOverride?: string;
	private readonly listEntries: (targetPath: string) => FileEntry[];

	constructor(
		kind: FileViewKind,
		context: vscode.ExtensionContext,
		statusProvider?: WorkspaceStatusProvider,
		rootPathOverride?: string,
		listEntries?: (targetPath: string) => FileEntry[],
	) {
		super(statusProvider);
		this.kind = kind;
		this.context = context;
		this.rootPathOverride = rootPathOverride;
		this.listEntries = listEntries ?? listFileEntries;
	}

	getRootPath(): string {
		if (this.kind === 'skills') {
			return (
				this.getRootOptions().find((location) => location.kind === 'project')?.rootPath ??
				this.getRootOptions()[0].rootPath
			);
		}
		if (this.rootPathOverride) {
			return this.rootPathOverride;
		}
		if (this.kind === 'templates') {
			return path.join(resolveCopilotPaths().managerDir, TEMPLATE_FOLDER_NAME);
		}
		if (this.kind === 'commands') {
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			return workspaceRoot ? path.join(workspaceRoot, '.claude', 'commands') : '';
		}
		return path.join(resolveCopilotPaths().copilotDir, this.kind);
	}

	getRootOptions(): SkillLocation[] {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (this.kind === 'commands') {
			if (this.rootPathOverride) {
				return [
						{
							kind: 'project',
							label: messages.explorerWorkspaceCommands,
							rootPath: this.rootPathOverride,
							createPath: this.rootPathOverride,
							priority: 1,
					},
				];
			}
			const roots: SkillLocation[] = [];
			if (workspaceRoot) {
				roots.push({
					kind: 'project',
					label: messages.explorerWorkspaceCommands,
					rootPath: path.join(workspaceRoot, '.claude', 'commands'),
					createPath: path.join(workspaceRoot, '.claude', 'commands'),
					priority: 1,
				});
			}
			roots.push(...getPluginCommandLocations());
			return roots;
		}
		if (this.kind === 'templates') {
			return [
				{
					kind: 'user',
					label: messages.explorerTemplatesRoot,
					rootPath: path.join(resolveCopilotPaths().managerDir, TEMPLATE_FOLDER_NAME),
					createPath: path.join(resolveCopilotPaths().managerDir, TEMPLATE_FOLDER_NAME),
					priority: 1,
				},
			];
		}
		if (this.kind !== 'skills') {
			return [
				{
					kind: 'project',
					label: this.kind,
					rootPath: this.rootPathOverride ?? this.getSingleRootPath(),
					priority: 1,
				},
			];
		}
		return getSkillLocations();
	}

	getLocationForPath(targetPath: string): SkillLocation | undefined {
		if (this.kind !== 'skills') {
			return undefined;
		}
		return findSkillLocationForPath(targetPath, this.getRootOptions());
	}

	protected getAvailableChildren(element?: WorkspaceTreeItem): vscode.ProviderResult<WorkspaceTreeItem[]> {
		if (!element) {
			if (this.kind === 'skills' || this.kind === 'commands') {
				const items = this.readSkillRoots();
				return items.length > 0 ? items : [this.toEmptyItem()];
			}
			const items = this.readDirectory(this.getRootPath());
			return items.length > 0 ? items : [this.toEmptyItem()];
		}

		if (element.nodeType === 'root' || element.nodeType === 'folder') {
			return this.readDirectory(element.fsPath ?? '');
		}

		return [];
	}

	private getSingleRootPath(): string {
		if (this.kind === 'templates') {
			return path.join(resolveCopilotPaths().managerDir, TEMPLATE_FOLDER_NAME);
		}
		if (this.kind === 'commands') {
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			return workspaceRoot ? path.join(workspaceRoot, '.claude', 'commands') : '';
		}
		return path.join(resolveCopilotPaths().copilotDir, this.kind);
	}

	getParent(element: WorkspaceTreeItem): vscode.ProviderResult<WorkspaceTreeItem> {
		if (!element.fsPath) {
			return undefined;
		}
		if (element.nodeType === 'root') {
			return undefined;
		}

		const parentPath = path.dirname(element.fsPath);
		if (!parentPath || parentPath === element.fsPath) {
			return undefined;
		}

		const rootPath = this.getRootPath();
		const parentIsRoot =
			parentPath === rootPath ||
			this.getRootOptions().some((location) => location.rootPath === parentPath);
		if (parentIsRoot) {
			return undefined;
		}

		const folderItem = new WorkspaceTreeItem(
			'folder',
			this.kind,
			path.basename(parentPath),
			vscode.TreeItemCollapsibleState.Collapsed,
			parentPath,
		);
		folderItem.id = parentPath;
		folderItem.contextValue = 'workspace-folder';
		folderItem.iconPath = this.getFolderIcon();
		return folderItem;
	}

	private readSkillRoots(): WorkspaceTreeItem[] {
		return this.getRootOptions().flatMap((location) => {
			if (this.kind === 'skills' && this.isSkillRootFolder(location.rootPath)) {
				const folderItem = new WorkspaceTreeItem(
					'root',
					this.kind,
					path.basename(location.rootPath),
					vscode.TreeItemCollapsibleState.Collapsed,
					location.rootPath,
				);
				folderItem.id = location.rootPath;
				folderItem.contextValue = 'workspace-folder';
				folderItem.iconPath = this.getFolderIcon(location.rootPath);
				this.applyLocationMetadata(folderItem, location, location.rootPath);
				return [folderItem];
			}
			return this.readDirectory(location.rootPath, location);
		});
	}

	private readDirectory(targetPath: string, location?: SkillLocation): WorkspaceTreeItem[] {
		const entries = this.listEntries(targetPath)
			.filter((entry) => !this.isHiddenName(entry.name))
			.filter((entry) => this.kind === 'skills' || !entry.isDirectory)
			.sort((left, right) =>
				left.name.localeCompare(right.name, undefined, {
					numeric: true,
					sensitivity: 'base',
				}),
			);
		const resolvedLocation = location ?? this.getLocationForPath(targetPath);
		return entries.map((entry) => {
			if (entry.isDirectory) {
				const folderItem = new WorkspaceTreeItem(
					'folder',
					this.kind,
					entry.name,
					vscode.TreeItemCollapsibleState.Collapsed,
					entry.fullPath,
				);
				folderItem.id = entry.fullPath;
				folderItem.contextValue = 'workspace-folder';
				folderItem.iconPath = this.getFolderIcon(entry.fullPath);
				this.applyLocationMetadata(folderItem, resolvedLocation, entry.fullPath);
				return folderItem;
			}

			const fileItem = new WorkspaceTreeItem(
				'file',
				this.kind,
				entry.name,
				vscode.TreeItemCollapsibleState.None,
				entry.fullPath,
			);
			fileItem.id = entry.fullPath;
			fileItem.contextValue = 'workspace-file';
			fileItem.command = {
				command: 'copilot-workspace-manager.openFile',
				title: messages.explorerOpenFile,
				arguments: [fileItem],
			};
			fileItem.iconPath = this.getFileIcon(entry.name, entry.fullPath);
			this.applyLocationMetadata(fileItem, resolvedLocation, entry.fullPath);
			return fileItem;
		});
	}

	private applyLocationMetadata(
		item: WorkspaceTreeItem,
		location: SkillLocation | undefined,
		targetPath: string,
	): void {
		if (!location || (this.kind !== 'skills' && this.kind !== 'commands')) {
			return;
		}
		item.tooltip = `${location.label}: ${targetPath}`;
		item.description = location.label;
	}

	private isHiddenName(name: string): boolean {
		return name.startsWith('.');
	}

	private getFolderIcon(
		folderPath?: string,
	): vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } | undefined {
		if (this.kind === 'skills' && folderPath && this.isSkillRootFolder(folderPath)) {
			if (!this.isEnabledSkillRootFolder(folderPath)) {
				return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
			}
			return new vscode.ThemeIcon('folder-library');
		}

		const iconPath = this.context.asAbsolutePath(path.join('images', 'folder32.png'));
		const iconUri = vscode.Uri.file(iconPath);
		return { light: iconUri, dark: iconUri };
	}

	private getFileIcon(
		fileName: string,
		filePath?: string,
	): vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } | undefined {
		if (this.kind === 'commands') {
			return new vscode.ThemeIcon('terminal');
		}

		if (this.kind === 'skills' && fileName === 'SKILL.md' && filePath) {
			return new vscode.ThemeIcon('agent');
		}

		const extension = path.extname(fileName).toLowerCase();
		const iconFileName = FILE_ICON_MAP[extension] ?? 'unknown32.png';
		const iconPath = this.context.asAbsolutePath(path.join('images', iconFileName));
		const iconUri = vscode.Uri.file(iconPath);
		return { light: iconUri, dark: iconUri };
	}

	private isSkillRootFolder(folderPath: string): boolean {
		if (this.getRootOptions().some((location) => path.dirname(folderPath) === location.rootPath)) {
			return true;
		}

		return this.listEntries(folderPath).some(
			(entry) => entry.isFile && entry.name === 'SKILL.md',
		);
	}

	private isEnabledSkillRootFolder(folderPath: string): boolean {
		const skillPath = path.join(folderPath, 'SKILL.md');
		return fs.existsSync(skillPath)
			? isSkillEnabled(resolveCopilotPaths().configPath, skillPath)
			: true;
	}

	private toEmptyItem(): WorkspaceTreeItem {
		const item = new WorkspaceTreeItem(
			'file',
			this.kind,
			this.getEmptyLabel(),
			vscode.TreeItemCollapsibleState.None,
		);
		item.contextValue = `workspace-${this.kind}-empty`;
		item.iconPath = new vscode.ThemeIcon('info');
		return item;
	}

	private getEmptyLabel(): string {
		switch (this.kind) {
			case 'commands':
				return messages.commandsExplorerEmpty;
			case 'skills':
				return messages.skillsExplorerEmpty;
			case 'templates':
				return messages.templatesExplorerEmpty;
		}
	}
}

function getPluginCommandLocations(): SkillLocation[] {
	const { configPath } = resolveCopilotPaths();
	return listInstalledPluginsFromConfig(configPath).flatMap((plugin) => {
		const manifestPath = plugin.manifestPath ?? resolvePluginManifestPath(plugin.pluginRoot);
		if (!manifestPath || !fs.existsSync(manifestPath)) {
			return [];
		}
		try {
			const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { commands?: unknown };
			const commandRoots = normalizePluginPaths(parsed.commands).map((commandPath) =>
				path.resolve(plugin.pluginRoot, commandPath),
			);
			return commandRoots
				.filter((rootPath) => fs.existsSync(rootPath) && fs.statSync(rootPath).isDirectory())
				.map((rootPath) => ({
					kind: 'plugin' as const,
					label: messages.explorerPluginCommands,
					rootPath,
					priority: 2,
				}));
		} catch {
			return [];
		}
	});
}

function normalizePluginPaths(value: unknown): string[] {
	if (typeof value === 'string' && value.trim()) {
		return [value.trim()];
	}
	if (Array.isArray(value)) {
		return value
			.filter((entry): entry is string => typeof entry === 'string')
			.map((entry) => entry.trim())
			.filter(Boolean);
	}
	return [];
}

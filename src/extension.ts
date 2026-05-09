// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import fs from 'fs';
import path from 'path';
import { ensureSelection } from './services/selectionGuard';
import {
	getCoreWorkspaceStatus,
	getWorkspaceStatus,
	resolveCopilotPaths,
	TEMPLATE_FOLDER_NAME,
} from './services/workspaceStatus';
import { WorkspaceTreeItem } from './models/treeItems';
import { registerFileCommands } from './commands/fileCommands';
import { registerAgentCommands } from './commands/agentCommands';
import { CoreExplorerProvider } from './views/coreExplorerProvider';
import { FileExplorerProvider } from './views/fileExplorerProvider';
import { McpExplorerProvider } from './views/mcpExplorerProvider';
import { AgentExplorerProvider } from './views/agentExplorerProvider';
import { messages } from './i18n';
import { runSafely } from './services/errorHandling';
import { SelectionContext } from './services/selectionContext';
import { TreeExpansionState } from './services/treeExpansionState';
import { ViewFocusState } from './services/viewFocusState';
import { getSyncSettings } from './services/settings';
import { HistoryPanelManager } from './services/historyPanel';
import { SkillManagerPanelManager } from './services/skillManagerPanel';
import { AgentManagerPanelManager } from './services/agentManagerPanel';
import { McpManagerPanelManager } from './services/mcpManagerPanel';
import {
	buildSyncScopeKey,
	syncCoreFilesBidirectional,
	syncDirectoryBidirectional,
} from './services/syncService';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const coreProvider = new CoreExplorerProvider(context);
	const commandsProvider = new FileExplorerProvider('commands', context);
	const skillsProvider = new FileExplorerProvider('skills', context);
	const templatesProvider = new FileExplorerProvider('templates', context);
	const mcpProvider = new McpExplorerProvider(context);
	const agentsProvider = new AgentExplorerProvider(context);
	const selectionContext = new SelectionContext();
	const expansionState = new TreeExpansionState();
	const viewFocusState = new ViewFocusState();
	const coreManagerPanelManager = new HistoryPanelManager();
	const skillManagerPanelManager = new SkillManagerPanelManager(() =>
		skillsProvider.refresh(),
	);
	const agentManagerPanelManager = new AgentManagerPanelManager(() =>
		agentsProvider.refresh(),
	);
	const mcpManagerPanelManager = new McpManagerPanelManager(() =>
		mcpProvider.refresh(),
	);

	const coreView = vscode.window.createTreeView('copilot-workspace-manager.core', {
		treeDataProvider: coreProvider,
	});
	const commandsView = vscode.window.createTreeView('copilot-workspace-manager.prompts', {
		treeDataProvider: commandsProvider,
	});
	const skillsView = vscode.window.createTreeView('copilot-workspace-manager.skills', {
		treeDataProvider: skillsProvider,
	});
	const templatesView = vscode.window.createTreeView(
		'copilot-workspace-manager.templates',
		{
			treeDataProvider: templatesProvider,
		},
	);
	const mcpView = vscode.window.createTreeView('copilot-workspace-manager.mcp', {
		treeDataProvider: mcpProvider,
	});
	const agentsView = vscode.window.createTreeView('copilot-workspace-manager.agents', {
		treeDataProvider: agentsProvider,
	});

	const trackExpansion = (
		kind: 'commands' | 'skills' | 'templates',
		view: vscode.TreeView<WorkspaceTreeItem>,
	) => [
		view.onDidExpandElement((event) =>
			expansionState.registerExpanded(kind, event.element),
		),
		view.onDidCollapseElement((event) =>
			expansionState.registerCollapsed(kind, event.element),
		),
	];

	const trackSelection = (
		view: vscode.TreeView<WorkspaceTreeItem>,
		kind?: 'commands' | 'skills' | 'templates',
	) =>
		view.onDidChangeSelection((event) => {
			selectionContext.setSelection(event.selection[0]);
			if (kind) {
				viewFocusState.setActive(kind, event.selection.length > 0);
				return;
			}
			viewFocusState.clear();
		});

	context.subscriptions.push(
		coreView,
		commandsView,
		skillsView,
		templatesView,
		mcpView,
		agentsView,
		trackSelection(coreView),
		trackSelection(commandsView, 'commands'),
		trackSelection(skillsView, 'skills'),
		trackSelection(templatesView, 'templates'),
		trackSelection(mcpView),
		trackSelection(agentsView),
		...trackExpansion('commands', commandsView),
		...trackExpansion('skills', skillsView),
		...trackExpansion('templates', templatesView),
		coreManagerPanelManager,
		skillManagerPanelManager,
		agentManagerPanelManager,
		mcpManagerPanelManager,
	);

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(() => {
			viewFocusState.clear();
		}),
		vscode.window.onDidChangeActiveTerminal(() => {
			viewFocusState.clear();
		}),
	);

	const openFileDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.openFile',
		(item?: WorkspaceTreeItem) =>
			runSafely(async () => {
				const status =
					item?.kind === 'core'
						? getCoreWorkspaceStatus()
						: getWorkspaceStatus();
				if (!status.isAvailable) {
					return;
				}
				if (!ensureSelection(item) || !item.fsPath) {
					return;
				}
				const target = vscode.Uri.file(item.fsPath);
				await vscode.commands.executeCommand('vscode.open', target);
			}),
	);

	const revealFolder = async (targetDir: string): Promise<void> => {
		if (!fs.existsSync(targetDir)) {
			vscode.window.showErrorMessage(messages.openFolderMissing);
			return;
		}
		await vscode.env.openExternal(vscode.Uri.file(targetDir));
	};

	const openCopilotFolderDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.openCopilotFolder',
		() =>
			runSafely(async () => {
				if (!getCoreWorkspaceStatus().isAvailable) {
					return;
				}
				const selection = coreView.selection[0];
				if (selection?.fsPath) {
					await revealFolder(path.dirname(selection.fsPath));
					return;
				}
				const { copilotDir } = resolveCopilotPaths();
				await revealFolder(copilotDir);
			}),
	);

	const openPromptsFolderDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.openPromptsFolder',
		() =>
			runSafely(async () => {
				if (!getWorkspaceStatus().isAvailable) {
					return;
				}
				const selection = commandsView.selection[0];
				if (selection?.fsPath) {
					const targetDir =
						selection.nodeType === 'file'
							? path.dirname(selection.fsPath)
							: selection.fsPath;
					await revealFolder(targetDir);
					return;
				}
				const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
				if (workspaceRoot) {
					await revealFolder(path.join(workspaceRoot, '.claude', 'commands'));
				}
			}),
	);

	const openSkillsFolderDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.openSkillsFolder',
		() =>
			runSafely(async () => {
				if (!getWorkspaceStatus().isAvailable) {
					return;
				}
				const selection = skillsView.selection[0];
				if (selection?.fsPath) {
					const targetDir =
						selection.nodeType === 'file'
							? path.dirname(selection.fsPath)
							: selection.fsPath;
					await revealFolder(targetDir);
					return;
				}
				const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
				if (workspaceRoot) {
					await revealFolder(path.join(workspaceRoot, '.github', 'skills'));
				}
			}),
	);

	const openTemplatesFolderDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.openTemplatesFolder',
		() =>
			runSafely(async () => {
				if (!getWorkspaceStatus().isAvailable) {
					return;
				}
				const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
				await revealFolder(path.join(resolveCopilotPaths().managerDir, TEMPLATE_FOLDER_NAME));
			}),
	);

	const openAgentsFolderDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.openAgentsFolder',
		() =>
			runSafely(async () => {
				if (!getWorkspaceStatus().isAvailable) {
					return;
				}
				const selection = agentsView.selection[0];
				if (selection?.fsPath) {
					await revealFolder(path.dirname(selection.fsPath));
					return;
				}
				const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
				if (workspaceRoot) {
					await revealFolder(path.join(workspaceRoot, '.github', 'agents'));
				}
			}),
	);

	const openSkillManagerDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.openSkillManager',
		() =>
			runSafely(() => {
				if (!getWorkspaceStatus().isAvailable) {
					return;
				}
				skillManagerPanelManager.show();
			}),
	);

	const openCoreManagerDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.openCoreManager',
		() =>
			runSafely(() => {
				coreManagerPanelManager.show();
			}),
	);

	const openAgentManagerDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.openAgentManager',
		() =>
			runSafely(() => {
				if (!getWorkspaceStatus().isAvailable) {
					return;
				}
				agentManagerPanelManager.show();
			}),
	);

	const openMcpManagerDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.openMcpManager',
		() =>
			runSafely(() => {
				if (!getWorkspaceStatus().isAvailable) {
					return;
				}
				mcpManagerPanelManager.show();
			}),
	);

	const confirmSync = async (targetDir: string): Promise<boolean> => {
		const message = messages.syncConfirm(targetDir);
		const choice = await vscode.window.showWarningMessage(
			message,
			{ modal: true },
			messages.dialogOk,
		);
		return choice === messages.dialogOk;
	};

	const syncConfiguredFolder = (
		scopeName: string,
		configuredDir: string,
		targetDirs: string[],
		stateRoot: string,
	): number => {
		let skippedCount = 0;
		for (const targetDir of targetDirs) {
			if (path.resolve(configuredDir) === path.resolve(targetDir)) {
				continue;
			}
			const result = syncDirectoryBidirectional(
				buildSyncScopeKey(scopeName, configuredDir, targetDir),
				stateRoot,
				configuredDir,
				targetDir,
			);
			skippedCount += result.skipped.length;
		}
		return skippedCount;
	};

	const syncCoreDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.syncCore',
		() =>
			runSafely(async () => {
				if (!getCoreWorkspaceStatus().isAvailable) {
					return;
				}
				const { copilotFolder } = getSyncSettings();
				if (!copilotFolder) {
					return;
				}
				if (!(await confirmSync(copilotFolder))) {
					return;
				}
				const { copilotDir } = resolveCopilotPaths();
				const result = syncCoreFilesBidirectional(copilotDir, copilotFolder);
				if (result.skipped.length > 0) {
					vscode.window.showWarningMessage(
						messages.syncSkipped(result.skipped.length),
					);
				}
				coreProvider.refresh();
			}),
	);

	const syncSkillsDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.syncSkills',
		() =>
			runSafely(async () => {
				if (!getWorkspaceStatus().isAvailable) {
					return;
				}
				const { skillsFolder } = getSyncSettings();
				if (!skillsFolder) {
					return;
				}
				if (!(await confirmSync(skillsFolder))) {
					return;
				}
				const { copilotDir } = resolveCopilotPaths();
				const skippedCount = syncConfiguredFolder(
					'skills',
					skillsFolder,
					[path.join(copilotDir, 'skills')],
					copilotDir,
				);
				if (skippedCount > 0) {
					vscode.window.showWarningMessage(
						messages.syncSkipped(skippedCount),
					);
				}
				skillsProvider.refresh();
			}),
	);

	const syncTemplatesDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.syncTemplates',
		() =>
			runSafely(async () => {
				if (!getWorkspaceStatus().isAvailable) {
					return;
				}
				const { templatesFolder } = getSyncSettings();
				if (!templatesFolder) {
					return;
				}
				if (!(await confirmSync(templatesFolder))) {
					return;
				}
				const { copilotDir } = resolveCopilotPaths();
				const { managerDir } = resolveCopilotPaths();
				const skippedCount = syncConfiguredFolder(
					'templates',
					templatesFolder,
					[path.join(managerDir, TEMPLATE_FOLDER_NAME)],
					copilotDir,
				);
				if (skippedCount > 0) {
					vscode.window.showWarningMessage(
						messages.syncSkipped(skippedCount),
					);
				}
				templatesProvider.refresh();
			}),
	);

	const syncAgentsDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.syncAgents',
		() =>
			runSafely(async () => {
				if (!getWorkspaceStatus().isAvailable) {
					return;
				}
				const { agentFolder } = getSyncSettings();
				if (!agentFolder) {
					return;
				}
				if (!(await confirmSync(agentFolder))) {
					return;
				}
				const { copilotDir } = resolveCopilotPaths();
				const skippedCount = syncConfiguredFolder(
					'agents',
					agentFolder,
					[path.join(copilotDir, 'agents')],
					copilotDir,
				);
				if (skippedCount > 0) {
					vscode.window.showWarningMessage(
						messages.syncSkipped(skippedCount),
					);
				}
				agentsProvider.refresh();
			}),
	);

	const refreshDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.refreshAll',
		() =>
			runSafely(() => {
				if (!getWorkspaceStatus().isAvailable) {
					return;
				}
				coreProvider.refresh();
				commandsProvider.refresh();
				skillsProvider.refresh();
				templatesProvider.refresh();
				mcpProvider.refresh();
				agentsProvider.refresh();
			}),
	);

	context.subscriptions.push(
		openFileDisposable,
		openCopilotFolderDisposable,
		openCoreManagerDisposable,
		openSkillManagerDisposable,
		openAgentManagerDisposable,
		openMcpManagerDisposable,
		openPromptsFolderDisposable,
		openSkillsFolderDisposable,
		openTemplatesFolderDisposable,
		openAgentsFolderDisposable,
		syncCoreDisposable,
		syncSkillsDisposable,
		syncTemplatesDisposable,
		syncAgentsDisposable,
		refreshDisposable,
	);

	registerFileCommands(context, {
		getSelection: () => selectionContext.getSelection(),
		providers: {
			commands: commandsProvider,
			skills: skillsProvider,
			templates: templatesProvider,
		},
		views: {
			commands: commandsView,
			skills: skillsView,
			templates: templatesView,
		},
		expansionState,
		viewFocusState,
	});

	registerAgentCommands(context, {
		getSelection: () => selectionContext.getSelection(),
		agentProvider: agentsProvider,
	});
}

function readAgentIds(agentsDir: string): Set<string> {
	if (!fs.existsSync(agentsDir)) {
		return new Set<string>();
	}
	return new Set(
		fs
			.readdirSync(agentsDir, { withFileTypes: true })
			.filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.toml')
			.map((entry) => path.basename(entry.name, path.extname(entry.name))),
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}

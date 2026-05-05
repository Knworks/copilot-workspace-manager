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
	syncCoreInstructionsBidirectional,
	syncDirectoryBidirectional,
} from './services/syncService';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const coreProvider = new CoreExplorerProvider(context);
	const promptsProvider = new FileExplorerProvider('prompts', context);
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
	const promptsView = vscode.window.createTreeView('copilot-workspace-manager.prompts', {
		treeDataProvider: promptsProvider,
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
		kind: 'prompts' | 'skills' | 'templates',
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
		kind?: 'prompts' | 'skills' | 'templates',
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
		promptsView,
		skillsView,
		templatesView,
		mcpView,
		agentsView,
		trackSelection(coreView),
		trackSelection(promptsView, 'prompts'),
		trackSelection(skillsView, 'skills'),
		trackSelection(templatesView, 'templates'),
		trackSelection(mcpView),
		trackSelection(agentsView),
		...trackExpansion('prompts', promptsView),
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
	);

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "copilot-workspace-manager" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const helloWorldDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.helloWorld',
		(item?: vscode.TreeItem) =>
			runSafely(() => {
				if (!getWorkspaceStatus().isAvailable) {
					return;
				}
				if (!ensureSelection(item)) {
					return;
				}
				// The code you place here will be executed every time your command is executed
				// Display a message box to the user
				vscode.window.showInformationMessage(messages.helloWorld);
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
				const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
				if (workspaceRoot) {
					await revealFolder(path.join(workspaceRoot, '.github', 'prompts'));
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
				if (workspaceRoot) {
					await revealFolder(path.join(workspaceRoot, '.copilot', TEMPLATE_FOLDER_NAME));
				}
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
				const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
				if (!workspaceRoot) {
					vscode.window.showInformationMessage(messages.chainNoWorkspace);
					return;
				}
				const { copilotDir } = resolveCopilotPaths();
				const result = syncCoreInstructionsBidirectional(workspaceRoot, copilotDir);
				if (result.skipped.length > 0) {
					vscode.window.showWarningMessage(
						messages.syncSkipped(result.skipped.length),
					);
				}
				coreProvider.refresh();
				mcpProvider.refresh();
			}),
	);

	const syncPromptsDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.syncPrompts',
		() =>
			runSafely(async () => {
				if (!getWorkspaceStatus().isAvailable) {
					return;
				}
				const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
				if (!workspaceRoot) {
					vscode.window.showInformationMessage(messages.chainNoWorkspace);
					return;
				}
				if (!(await confirmSync('Copilot prompts'))) {
					return;
				}
				const { copilotDir } = resolveCopilotPaths();
				const commandResult = syncDirectoryBidirectional(
					'promptCommands',
					copilotDir,
					path.join(copilotDir, 'prompts', 'commands'),
					path.join(workspaceRoot, '.claude', 'commands'),
				);
				const ideResult = syncDirectoryBidirectional(
					'promptIde',
					copilotDir,
					path.join(copilotDir, 'prompts', 'ide'),
					path.join(workspaceRoot, '.github', 'prompts'),
				);
				const skippedCount = commandResult.skipped.length + ideResult.skipped.length;
				if (skippedCount > 0) {
					vscode.window.showWarningMessage(
						messages.syncSkipped(skippedCount),
					);
				}
				promptsProvider.refresh();
			}),
	);

	const syncSkillsDisposable = vscode.commands.registerCommand(
		'copilot-workspace-manager.syncSkills',
		() =>
			runSafely(async () => {
				if (!getWorkspaceStatus().isAvailable) {
					return;
				}
				const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
				if (!workspaceRoot) {
					vscode.window.showInformationMessage(messages.chainNoWorkspace);
					return;
				}
				if (!(await confirmSync('Copilot skills'))) {
					return;
				}
				const { copilotDir } = resolveCopilotPaths();
				const result = syncDirectoryBidirectional(
					'skills',
					copilotDir,
					path.join(workspaceRoot, '.github', 'skills'),
					path.join(copilotDir, 'skills'),
				);
				if (result.skipped.length > 0) {
					vscode.window.showWarningMessage(
						messages.syncSkipped(result.skipped.length),
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
				const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
				if (!workspaceRoot) {
					vscode.window.showInformationMessage(messages.chainNoWorkspace);
					return;
				}
				if (!(await confirmSync('Copilot templates'))) {
					return;
				}
				const { copilotDir } = resolveCopilotPaths();
				const result = syncDirectoryBidirectional(
					'templates',
					copilotDir,
					path.join(workspaceRoot, '.copilot', TEMPLATE_FOLDER_NAME),
					path.join(copilotDir, TEMPLATE_FOLDER_NAME),
				);
				if (result.skipped.length > 0) {
					vscode.window.showWarningMessage(
						messages.syncSkipped(result.skipped.length),
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
				const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
				if (!workspaceRoot) {
					vscode.window.showInformationMessage(messages.chainNoWorkspace);
					return;
				}
				if (!(await confirmSync('Copilot agents'))) {
					return;
				}
				const { copilotDir } = resolveCopilotPaths();
				const result = syncDirectoryBidirectional(
					'agents',
					copilotDir,
					path.join(workspaceRoot, '.github', 'agents'),
					path.join(copilotDir, 'agents'),
				);
				if (result.skipped.length > 0) {
					vscode.window.showWarningMessage(
						messages.syncSkipped(result.skipped.length),
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
				promptsProvider.refresh();
				skillsProvider.refresh();
				templatesProvider.refresh();
				mcpProvider.refresh();
				agentsProvider.refresh();
			}),
	);

	context.subscriptions.push(
		helloWorldDisposable,
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
		syncPromptsDisposable,
		syncSkillsDisposable,
		syncTemplatesDisposable,
		syncAgentsDisposable,
		refreshDisposable,
	);

	registerFileCommands(context, {
		getSelection: () => selectionContext.getSelection(),
		providers: {
			prompts: promptsProvider,
			skills: skillsProvider,
			templates: templatesProvider,
		},
		views: {
			prompts: promptsView,
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

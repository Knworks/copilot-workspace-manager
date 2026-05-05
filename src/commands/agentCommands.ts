import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { WorkspaceTreeItem } from '../models/treeItems';
import { ensureSelection } from '../services/selectionGuard';
import { getWorkspaceStatus } from '../services/workspaceStatus';
import { messages } from '../i18n';
import { runSafely } from '../services/errorHandling';
import { sanitizeName } from '../services/fileNaming';
import {
	listTemplateCandidates,
	readTemplateContents,
} from '../services/templateService';
import { AgentExplorerProvider } from '../views/agentExplorerProvider';

type AgentCommandContext = {
	getSelection: () => WorkspaceTreeItem | undefined;
	agentProvider: AgentExplorerProvider;
};

export function registerAgentCommands(
	context: vscode.ExtensionContext,
	config: AgentCommandContext,
): vscode.Disposable[] {
	const { getSelection, agentProvider } = config;
	const disposables: vscode.Disposable[] = [];

	disposables.push(
		vscode.commands.registerCommand('copilot-workspace-manager.addAgent', () =>
			runSafely(async () => {
				if (!ensureAvailable()) {
					return;
				}
				await addAgent(agentProvider);
			}),
		),
	);

	disposables.push(
		vscode.commands.registerCommand(
			'copilot-workspace-manager.editAgent',
			(item?: WorkspaceTreeItem) =>
				runSafely(async () => {
					if (!ensureAvailable()) {
						return;
					}
					const selection = resolveAgentSelection(item, getSelection);
					if (!ensureSelection(selection) || !selection.fsPath) {
						return;
					}
					await editAgent(selection.fsPath, agentProvider);
				}),
		),
	);

	disposables.push(
		vscode.commands.registerCommand(
			'copilot-workspace-manager.deleteAgent',
			(item?: WorkspaceTreeItem) =>
				runSafely(async () => {
					if (!ensureAvailable()) {
						return;
					}
					const selection = resolveAgentSelection(item, getSelection);
					if (!ensureSelection(selection) || !selection.fsPath) {
						return;
					}
					await deleteAgent(selection.fsPath, agentProvider);
				}),
		),
	);

	disposables.push(
		vscode.commands.registerCommand(
			'copilot-workspace-manager.enableAgent',
			(item?: WorkspaceTreeItem) =>
				runSafely(async () => {
					if (!ensureAvailable()) {
						return;
					}
					const selection = resolveAgentSelection(item, getSelection);
					if (!ensureSelection(selection) || !selection.fsPath) {
						return;
					}
					await enableAgent(selection.fsPath, agentProvider);
				}),
		),
	);

	disposables.push(
		vscode.commands.registerCommand(
			'copilot-workspace-manager.disableAgent',
			(item?: WorkspaceTreeItem) =>
				runSafely(async () => {
					if (!ensureAvailable()) {
						return;
					}
					const selection = resolveAgentSelection(item, getSelection);
					if (!ensureSelection(selection) || !selection.fsPath) {
						return;
					}
					await disableAgent(selection.fsPath, agentProvider);
				}),
		),
	);

	context.subscriptions.push(...disposables);
	return disposables;
}

async function addAgent(agentProvider: AgentExplorerProvider): Promise<void> {
	const agentsDir = await pickAgentLocationRoot(agentProvider);
	if (!agentsDir) {
		return;
	}
	const agentName = await promptAgentName();
	if (!agentName) {
		return;
	}
	const description = await promptAgentDescription();
	if (description === undefined) {
		return;
	}
	const templateContent = await pickTemplateContents();
	if (templateContent === null) {
		return;
	}

	fs.mkdirSync(agentsDir, { recursive: true });
	const agentFilePath = path.join(agentsDir, toAgentFileName(agentName));
	if (fs.existsSync(agentFilePath)) {
		vscode.window.showWarningMessage(messages.agent.fileExists(agentName));
		return;
	}

	fs.writeFileSync(agentFilePath, buildAgentMarkdown(agentName, description, templateContent), 'utf8');
	agentProvider.refresh();
}

async function editAgent(
	agentFilePath: string,
	agentProvider: AgentExplorerProvider,
): Promise<void> {
	const currentName = getAgentId(agentFilePath);
	const currentDescription = readFrontmatterValue(agentFilePath, 'description') ?? '';

	const nextName = await promptAgentName(currentName);
	if (!nextName) {
		return;
	}
	const nextDescription = await promptAgentDescription(currentDescription);
	if (nextDescription === undefined) {
		return;
	}

	const nextFilePath = path.join(path.dirname(agentFilePath), toAgentFileName(nextName));
	if (
		!isSamePath(agentFilePath, nextFilePath) &&
		fs.existsSync(nextFilePath)
	) {
		vscode.window.showWarningMessage(messages.agent.fileExists(nextName));
		return;
	}
	if (!isSamePath(agentFilePath, nextFilePath)) {
		fs.renameSync(agentFilePath, nextFilePath);
	}

	const contents = fs.readFileSync(nextFilePath, 'utf8');
	fs.writeFileSync(
		nextFilePath,
		upsertAgentFrontmatter(contents, nextName, nextDescription),
		'utf8',
	);
	agentProvider.refresh();
}

async function deleteAgent(
	agentFilePath: string,
	agentProvider: AgentExplorerProvider,
): Promise<void> {
	const location = agentProvider.getLocationForPath(agentFilePath);
	const warning =
		location?.kind === 'user'
			? `\n${messages.agent.userAgentsDeleteWarning}`
			: '';
	const choice = await vscode.window.showWarningMessage(
		`${messages.agent.deleteConfirm(path.basename(agentFilePath))}${warning}`,
		{ modal: true },
		messages.dialogOk,
	);
	if (choice !== messages.dialogOk) {
		return;
	}
	fs.rmSync(agentFilePath, { force: true });
	agentProvider.refresh();
}

async function pickAgentLocationRoot(
	agentProvider: AgentExplorerProvider,
): Promise<string | null> {
	const projectFirst = agentProvider
		.getRootOptions()
		.filter((location) => location.kind !== 'plugin');
	const selected = await vscode.window.showQuickPick(
		projectFirst.map((location) => ({
			label: location.label,
			description: location.rootPath,
			location,
		})),
		{ placeHolder: messages.agent.locationPickPlaceholder },
	);
	return selected
		? (selected.location.createPath ?? selected.location.rootPath)
		: null;
}

async function enableAgent(
	agentFilePath: string,
	agentProvider: AgentExplorerProvider,
): Promise<void> {
	vscode.window.showInformationMessage(messages.agent.frontmatterManaged);
	agentProvider.refresh();
}

async function disableAgent(
	agentFilePath: string,
	agentProvider: AgentExplorerProvider,
): Promise<void> {
	vscode.window.showInformationMessage(messages.agent.frontmatterManaged);
	agentProvider.refresh();
}

function ensureAvailable(): boolean {
	return getWorkspaceStatus().isAvailable;
}

function resolveAgentSelection(
	item: WorkspaceTreeItem | undefined,
	getSelection: () => WorkspaceTreeItem | undefined,
): WorkspaceTreeItem | undefined {
	const selection = item ?? getSelection();
	if (!selection) {
		return undefined;
	}
	if (selection.kind !== 'agents' || selection.nodeType !== 'file') {
		vscode.window.showInformationMessage(messages.agent.selectionNotSupported);
		return undefined;
	}
	return selection;
}

async function promptAgentName(defaultValue?: string): Promise<string | undefined> {
	const value = await vscode.window.showInputBox({
		prompt: messages.agent.inputName,
		value: defaultValue,
	});
	if (value === undefined) {
		return undefined;
	}
	const sanitized = sanitizeName(value.trim());
	const withoutExt = stripAgentExtension(sanitized);
	if (!withoutExt) {
		vscode.window.showErrorMessage(messages.agent.invalidName);
		return undefined;
	}
	return withoutExt;
}

function toAgentFileName(agentName: string): string {
	return `${stripAgentExtension(agentName)}.agent.md`;
}

function stripAgentExtension(fileName: string): string {
	return fileName.replace(/(?:\.agent)?\.md$/i, '');
}

function getAgentId(agentFilePath: string): string {
	return stripAgentExtension(path.basename(agentFilePath));
}

function buildAgentMarkdown(name: string, description: string, body: string): string {
	const frontmatter = [
		'---',
		`name: ${JSON.stringify(name)}`,
		`description: ${JSON.stringify(description)}`,
		'---',
		'',
	].join('\n');
	return body.trim() ? `${frontmatter}${body}` : frontmatter;
}

function upsertAgentFrontmatter(contents: string, name: string, description: string): string {
	const body = contents.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
	return buildAgentMarkdown(name, description, body);
}

function readFrontmatterValue(agentFilePath: string, key: string): string | undefined {
	if (!fs.existsSync(agentFilePath)) {
		return undefined;
	}
	const contents = fs.readFileSync(agentFilePath, 'utf8');
	const match = contents.match(new RegExp(`^${key}:\\s*["']?([^"'\\r\\n]+)["']?`, 'm'));
	return match?.[1];
}

async function promptAgentDescription(defaultValue = ''): Promise<string | undefined> {
	return vscode.window.showInputBox({
		prompt: messages.agent.inputDescription,
		value: defaultValue,
	});
}

async function pickTemplateContents(): Promise<string | null> {
	const templates = listTemplateCandidates();
	if (templates.length === 0) {
		return '';
	}

	const items: vscode.QuickPickItem[] = [
		{ label: messages.file.templateNone },
		...templates.map((candidate) => ({
			label: candidate.label,
			description: candidate.fsPath,
		})),
	];

	const selection = await vscode.window.showQuickPick(items, {
		placeHolder: messages.file.templatePickPlaceholder,
	});
	if (!selection) {
		return null;
	}
	if (selection.label === messages.file.templateNone) {
		return '';
	}

	const selected = templates.find((candidate) => candidate.label === selection.label);
	if (!selected) {
		return '';
	}
	return readTemplateContents(selected.fsPath);
}

function isSamePath(sourcePath: string, targetPath: string): boolean {
	return path.resolve(sourcePath) === path.resolve(targetPath);
}

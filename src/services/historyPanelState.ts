import path from 'path';
import * as vscode from 'vscode';
import { messages } from '../i18n';
import { HistoryIndex, HistoryTurnRecord } from './historyService';
import { AgentsChainNode, buildAgentsLoadingChain, listTrustedDirectories } from './coreDiagnosticsService';
import { HookEntryRecord, HookSourceRecord, listHookDiagnostics } from './coreManagerConfigService';
import { PluginRecord, listPluginDiagnostics } from './pluginDiagnosticsService';
import { getCoreWorkspaceStatus, resolveCopilotPaths } from './workspaceStatus';

export const HISTORY_MESSAGE_PREVIEW_MAX_CHARS = 100;

export type CoreViewTab = 'history' | 'chain' | 'trusted' | 'hooks' | 'plugins';

type HistoryTurnSummary = {
	turnId: string;
	displayMessage: string;
	localTime: string;
	sessionId: string;
	issueCount: number;
};

type HistorySelectedTurn = {
	turnId: string;
	localTime: string;
	sessionId: string;
	userMessage: string;
	userMessageLocalTime: string;
	assistantMessages: Array<{ message: string; localTime: string }>;
	toolUsages: Array<{ label: string; status: string; localTime: string; detail?: string }>;
	issues: string[];
	rawEvents: string[];
};

export type HistoryPanelViewModel = {
	appliedQuery: string;
	items: HistoryTurnSummary[];
	selectedTurn?: HistorySelectedTurn;
};

export type HistoryPanelState = {
	index: HistoryIndex;
	selectedTurnId?: string;
	appliedQuery: string;
};

type AgentsChainDisplayEntry = {
	id: string;
	title: string;
	subtitle: string;
	summary: string;
	iconKind: 'copilot' | 'agent';
	path: string;
	explanation: string;
	contentPreview?: string;
	classification: string;
	scope: string;
	applyTo?: string;
};

export type AgentsChainDisplayPayload = {
	entries: AgentsChainDisplayEntry[];
	summary: {
		foundCount: number;
		hasPotentialConflict: boolean;
	};
	workspaceRoot?: string;
	activeFilePath?: string;
	emptyStateMessage?: string;
};

export type HooksDisplayPayload = {
	sources: HookSourceRecord[];
	entries: HookEntryRecord[];
	emptyStateMessage?: string;
};

export type PluginsDisplayPayload = {
	plugins: PluginRecord[];
	emptyStateMessage?: string;
};

export function normalizeQuery(query: string): string {
	return query.trim();
}

function includesCaseInsensitive(text: string, query: string): boolean {
	if (!query) {
		return true;
	}
	return text.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

function truncateMessage(message: string, maxChars: number): string {
	if (message.length <= maxChars) {
		return message;
	}
	return `${message.slice(0, maxChars)}...`;
}

function toTurnSummary(turn: HistoryTurnRecord): HistoryTurnSummary {
	return {
		turnId: turn.turnId,
		displayMessage: truncateMessage(turn.listLabel, HISTORY_MESSAGE_PREVIEW_MAX_CHARS),
		localTime: turn.localTime,
		sessionId: turn.sessionId,
		issueCount: turn.issues.length,
	};
}

function toSelectedTurn(turn: HistoryTurnRecord | undefined): HistorySelectedTurn | undefined {
	if (!turn) {
		return undefined;
	}
	return {
		turnId: turn.turnId,
		localTime: turn.localTime,
		sessionId: turn.sessionId,
		userMessage: turn.userMessage,
		userMessageLocalTime: turn.userMessageLocalTime,
		assistantMessages: turn.assistantMessages,
		toolUsages: turn.toolUsages,
		issues: turn.issues.map((issue) => issue.message),
		rawEvents: turn.rawEvents,
	};
}

function filterItems(turns: HistoryTurnRecord[], query: string): HistoryTurnSummary[] {
	return turns
		.filter((turn) => includesCaseInsensitive(turn.userMessage, query))
		.map(toTurnSummary);
}

export function createEmptyHistoryIndex(): HistoryIndex {
	return { turns: [] };
}

export function deriveHistoryPanelViewModel(state: HistoryPanelState): HistoryPanelViewModel {
	const appliedQuery = normalizeQuery(state.appliedQuery);
	const items = filterItems(state.index.turns, appliedQuery);
	const visibleTurnIds = items.map((item) => item.turnId);
	const selectedTurnId = visibleTurnIds.includes(state.selectedTurnId ?? '')
		? state.selectedTurnId
		: visibleTurnIds[0];
	const selectedTurn = toSelectedTurn(
		state.index.turns.find((turn) => turn.turnId === selectedTurnId),
	);
	return { appliedQuery, items, selectedTurn };
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function isCoreViewTab(value: unknown): value is CoreViewTab {
	return (
		value === 'history' ||
		value === 'chain' ||
		value === 'trusted' ||
		value === 'hooks' ||
		value === 'plugins'
	);
}

function buildRefreshButtonHtml(tab: CoreViewTab): string {
	return `<button class="icon-button" type="button" data-refresh-tab="${tab}" title="${escapeHtml(messages.commandRefresh)}" aria-label="${escapeHtml(messages.commandRefresh)}"><span class="codicon codicon-refresh" aria-hidden="true"></span></button>`;
}

function toClassificationLabel(node: AgentsChainNode): string {
	switch (node.kind) {
		case 'user':
			return messages.chainClassificationUser;
		case 'workspace':
			return messages.chainClassificationWorkspace;
		case 'path':
			return messages.chainClassificationPath;
		case 'agent':
			return messages.chainClassificationAgent;
		case 'customAgent':
			return messages.chainClassificationCustomAgent;
	}
}

function toScopeLabel(node: AgentsChainNode): string {
	switch (node.kind) {
		case 'user':
			return messages.chainScopeUser;
		case 'workspace':
			return messages.chainScopeWorkspace;
		case 'path':
			return messages.chainScopePath;
		case 'agent':
			return messages.chainScopeAgent;
		case 'customAgent':
			return messages.chainScopeCustomAgent;
	}
}

function toExplanation(node: AgentsChainNode): string {
	switch (node.kind) {
		case 'user':
			return messages.chainExplainUser;
		case 'workspace':
			return messages.chainExplainWorkspace;
		case 'path':
			if (node.status === 'invalidApplyTo') {
				return messages.chainExplainInvalidApplyTo;
			}
			return messages.chainExplainPath;
		case 'agent':
			return messages.chainExplainAgent;
		case 'customAgent':
			return messages.chainExplainCustomAgent;
	}
}

function toDisplayEntry(
	node: AgentsChainNode,
	index: number,
): AgentsChainDisplayEntry {
	const classification = toClassificationLabel(node);
	const scope = toScopeLabel(node);
	return {
		id: `chain-${index}`,
		title: node.fileName,
		subtitle: classification,
		summary: classification,
		iconKind: node.kind === 'agent' || node.kind === 'customAgent' ? 'agent' : 'copilot',
		path: node.absolutePath,
		explanation: toExplanation(node),
		contentPreview: node.contentPreview,
		classification,
		scope,
		applyTo: node.applyTo,
	};
}

export function buildAgentsChainPayload(
	workspaceRoot: string | undefined = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
): AgentsChainDisplayPayload {
	const activeFilePath = vscode.window.activeTextEditor?.document.uri.fsPath;
	const nodes = buildAgentsLoadingChain(
		workspaceRoot,
		undefined,
		process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS,
		activeFilePath,
	);
	const hasMultipleEntries = nodes.length > 1;
	const entries = nodes.map((node, index) => toDisplayEntry(node, index));
	return {
		entries,
		summary: {
			foundCount: entries.length,
			hasPotentialConflict: hasMultipleEntries,
		},
		workspaceRoot,
		activeFilePath,
		emptyStateMessage: entries.length > 0 ? undefined : messages.chainEmpty,
	};
}

export function buildTrustedDirectoriesHtml(): string {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const trustedDirectories = listTrustedDirectories(
		path.join(resolveCopilotPaths().copilotDir, 'settings.json'),
		workspaceRoot
			? path.join(workspaceRoot, '.github', 'copilot', 'settings.json')
			: undefined,
	);
	const coreStatus = getCoreWorkspaceStatus();
	const rows = trustedDirectories.map((directory) => `<article class="trusted-row">
		<span class="codicon codicon-workspace-trusted ${directory.exists ? 'trusted-ok' : 'trusted-warning'}" aria-hidden="true"></span>
		<div class="trusted-main">
			<div class="trusted-title">${escapeHtml(directory.sourceLabel)}</div>
			<div class="trusted-path">${escapeHtml(directory.path)}</div>
		</div>
		<div class="trusted-actions">
			<button class="icon-button" type="button" data-remove-trusted="${escapeHtml(directory.path)}" data-remove-trusted-source="${escapeHtml(directory.sourcePath)}" ${coreStatus.isConfigInvalid ? 'disabled' : ''}><span class="codicon codicon-trash" aria-hidden="true"></span></button>
		</div>
	</article>`).join('');
	return `<div class="tab-toolbar tab-toolbar-actions-right">
		<button id="addTrusted" class="icon-button" type="button"><span class="codicon codicon-add" aria-hidden="true"></span></button>
		${buildRefreshButtonHtml('trusted')}
	</div>
	<div class="trusted-list">${rows || `<p class="muted">${messages.historyNoResult}</p>`}</div>`;
}

export function buildHooksPayload(): HooksDisplayPayload {
	const diagnostics = listHookDiagnostics();
	return {
		sources: diagnostics.sources,
		entries: diagnostics.entries,
		emptyStateMessage: diagnostics.sources.length > 0 ? undefined : messages.historyNoResult,
	};
}

export function buildPluginsPayload(): PluginsDisplayPayload {
	const plugins = listPluginDiagnostics();
	return {
		plugins,
		emptyStateMessage: plugins.length > 0 ? undefined : messages.pluginsEmpty,
	};
}

export function sanitizeHookFileName(value: string): string {
	return value.replace(/\.json$/i, '').trim();
}

export async function fileExists(targetPath: string): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(vscode.Uri.file(targetPath));
		return true;
	} catch {
		return false;
	}
}

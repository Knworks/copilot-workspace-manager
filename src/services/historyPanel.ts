import fs from 'fs';
import path from 'path';
import * as vscode from 'vscode';
import { messages } from '../i18n';
import { getMaxSessionHistoryCount } from './settings';
import {
	buildHistoryIndex,
	HistoryIndex,
	HistoryTurnRecord,
} from './historyService';
import {
	AgentsChainNode,
	addTrustedDirectory,
	buildAgentsLoadingChain,
	listTrustedDirectories,
	removeTrustedDirectory,
} from './coreDiagnosticsService';
import {
	createHooksJsonFile,
	listHookDiagnostics,
} from './coreManagerConfigService';
import { getCoreWorkspaceStatus, resolveCopilotPaths } from './workspaceStatus';
import { CODICON_RESOURCE_ROOTS, getCodiconCssHref, getCodiconIconPath } from './webviewAssets';

const HISTORY_VIEW_TYPE = 'copilot-workspace-manager.coreView';
export const HISTORY_MESSAGE_PREVIEW_MAX_CHARS = 100;

type HistoryPanelInboundMessage =
	| { type: 'ready' }
	| { type: 'selectTurn'; turnId: string }
	| { type: 'search'; query: string }
	| { type: 'clearSearch' }
	| { type: 'copyText'; text: string }
	| { type: 'refreshTab'; tab: CoreViewTab }
	| { type: 'addTrustedDirectory' }
	| { type: 'removeTrustedDirectory'; targetPath: string }
	| { type: 'openPath'; targetPath: string }
	| { type: 'createHooksFile'; targetPath: string }
	| { type: 'createEmptyFile'; targetPath: string };

type CoreViewTab = 'history' | 'chain' | 'trusted' | 'hooks';

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

type HistoryPanelViewModel = {
	appliedQuery: string;
	items: HistoryTurnSummary[];
	selectedTurn?: HistorySelectedTurn;
};

type HistoryPanelState = {
	index: HistoryIndex;
	selectedTurnId?: string;
	appliedQuery: string;
};

type AgentsChainDisplaySection = 'current' | 'ignored' | 'problems' | 'details';

type AgentsChainDisplayEntry = {
	id: string;
	section: AgentsChainDisplaySection;
	title: string;
	subtitle: string;
	statusLabel: string;
	summary: string;
	path: string;
	explanation: string;
	contentPreview?: string;
	defaultVisible: boolean;
};

type AgentsChainDisplayPayload = {
	entries: AgentsChainDisplayEntry[];
	summary: {
		currentCount: number;
		ignoredCount: number;
		problemCount: number;
		hiddenCount: number;
	};
	workspaceRoot?: string;
	emptyStateMessage?: string;
};

function normalizeQuery(query: string): string {
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

function createEmptyHistoryIndex(): HistoryIndex {
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

function limitHistoryIndex(index: HistoryIndex, maxHistoryCount: number): HistoryIndex {
	if (maxHistoryCount < 1) {
		return index;
	}
	return {
		turns: index.turns.slice(0, maxHistoryCount),
	};
}

function createNonce(): string {
	const alphabet =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let index = 0; index < 24; index += 1) {
		nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
	}
	return nonce;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function isCoreViewTab(value: unknown): value is CoreViewTab {
	return (
		value === 'history' ||
		value === 'chain' ||
		value === 'trusted' ||
		value === 'hooks'
	);
}

function buildRefreshButtonHtml(tab: CoreViewTab): string {
	return `<button class="icon-button" type="button" data-refresh-tab="${tab}" title="${escapeHtml(messages.commandRefresh)}" aria-label="${escapeHtml(messages.commandRefresh)}"><span class="codicon codicon-refresh" aria-hidden="true"></span></button>`;
}

function toChainSubtitle(node: AgentsChainNode): string {
	return `${node.kind} / ${node.type}`;
}

function toDisplayEntry(node: AgentsChainNode, index: number): AgentsChainDisplayEntry {
	if (node.status === 'Active') {
		return {
			id: `chain-${index}`,
			section: 'current',
			title: node.fileName,
			subtitle: toChainSubtitle(node),
			statusLabel: messages.chainStatusCurrent,
			summary: messages.chainExplainCurrent(node.kind, node.fileName),
			path: node.absolutePath,
			explanation: messages.chainExplainCurrent(node.kind, node.fileName),
			contentPreview: node.contentPreview,
			defaultVisible: true,
		};
	}
	if (node.status === 'Skipped') {
		return {
			id: `chain-${index}`,
			section: 'ignored',
			title: node.fileName,
			subtitle: toChainSubtitle(node),
			statusLabel: messages.chainStatusIgnored,
			summary: messages.chainExplainIgnoredGeneric,
			path: node.absolutePath,
			explanation: messages.chainExplainIgnoredGeneric,
			contentPreview: node.contentPreview,
			defaultVisible: true,
		};
	}
	if (node.status === 'Error') {
		return {
			id: `chain-${index}`,
			section: 'problems',
			title: node.fileName,
			subtitle: toChainSubtitle(node),
			statusLabel: messages.chainStatusProblem,
			summary: messages.chainExplainProblem(node.reason),
			path: node.absolutePath,
			explanation: messages.chainExplainProblem(node.reason),
			contentPreview: node.contentPreview,
			defaultVisible: true,
		};
	}
	return {
		id: `chain-${index}`,
		section: 'details',
		title: node.fileName,
		subtitle: toChainSubtitle(node),
		statusLabel: messages.chainStatusMissing,
		summary: messages.chainExplainMissingGeneric,
		path: node.absolutePath,
		explanation: messages.chainExplainMissingGeneric,
		contentPreview: node.contentPreview,
		defaultVisible: false,
	};
}

function buildAgentsChainPayload(
	workspaceRoot: string | undefined = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
): AgentsChainDisplayPayload {
	if (!workspaceRoot) {
		return {
			entries: [],
			summary: {
				currentCount: 0,
				ignoredCount: 0,
				problemCount: 0,
				hiddenCount: 0,
			},
			emptyStateMessage: messages.chainNoWorkspace,
		};
	}
	const entries = buildAgentsLoadingChain(workspaceRoot).map(toDisplayEntry);
	return {
		entries,
		summary: {
			currentCount: entries.filter((entry) => entry.section === 'current').length,
			ignoredCount: entries.filter((entry) => entry.section === 'ignored').length,
			problemCount: entries.filter((entry) => entry.section === 'problems').length,
			hiddenCount: entries.filter((entry) => !entry.defaultVisible).length,
		},
		workspaceRoot,
	};
}

function buildTrustedDirectoriesHtml(): string {
	const trustedDirectories = listTrustedDirectories(resolveCopilotPaths().configPath);
	const coreStatus = getCoreWorkspaceStatus();
	const rows = trustedDirectories.map((directory) => `<article class="trusted-row turn-card">
		<span class="codicon ${directory.exists ? 'codicon-pass-filled trusted-ok' : 'codicon-warning trusted-warning'}" aria-hidden="true"></span>
		<span class="trusted-path">${escapeHtml(directory.path)}</span>
		<button class="icon-button" type="button" data-remove-trusted="${escapeHtml(directory.path)}" ${coreStatus.isConfigInvalid ? 'disabled' : ''}><span class="codicon codicon-trash" aria-hidden="true"></span></button>
	</article>`).join('');
	return `<div class="tab-toolbar">
		<button id="addTrusted" class="icon-button" type="button"><span class="codicon codicon-add" aria-hidden="true"></span></button>
		${buildRefreshButtonHtml('trusted')}
	</div>
	<div class="trusted-list">${rows || `<p class="muted">${messages.historyNoResult}</p>`}</div>`;
}

function buildHooksHtml(): string {
	const diagnostics = listHookDiagnostics();
	const warnings = diagnostics.warnings
		.map((warning) => `<article class="warning-card">${escapeHtml(warning)}</article>`)
		.join('');
	const sources = diagnostics.sources
		.map((source) => `<article class="hooks-source-item">
			<div><strong>${escapeHtml(source.layer)} / ${escapeHtml(source.format)}</strong></div>
			<div class="muted">${escapeHtml(source.path)}</div>
			<div class="muted">${escapeHtml(messages.hooksEntryCount(source.entryCount))}</div>
		</article>`)
		.join('');
	const entries = diagnostics.entries
		.map((entry) => `<article class="hook-entry-card">
			<div><strong>${escapeHtml(entry.event)}</strong></div>
			<div class="muted">${escapeHtml(entry.command ?? messages.hooksNoCommand)}</div>
		</article>`)
		.join('');
	return `<div class="tab-toolbar">${buildRefreshButtonHtml('hooks')}</div>
	<div class="settings-list">
		${warnings}
		${sources || `<p class="muted">${messages.historyNoResult}</p>`}
		${entries || `<p class="muted">${messages.hooksNoEntries}</p>`}
	</div>`;
}

function serializeAgentsChain(payload: AgentsChainDisplayPayload): string {
	return JSON.stringify(payload);
}

function buildHistoryWebviewHtml(
	webview: vscode.Webview,
	codiconCssHref: string | undefined,
): string {
	const nonce = createNonce();
	const labels = JSON.stringify({
		searchPlaceholder: messages.historySearchPlaceholder,
		clear: messages.historyClear,
		noResult: messages.historyNoResult,
		noPreview: messages.historyNoPreview,
		copy: messages.historyCopy,
		user: messages.historyUserLabel,
		assistant: messages.historyAssistantLabel,
		sessionId: messages.historySessionIdLabel,
		eventsFile: messages.historyEventsFileLabel,
		agentResponses: messages.historyAgentResponsesLabel,
		noAgentResponses: messages.historyNoAgentResponses,
		toolUsage: messages.historyToolUsageLabel,
		noToolUsage: messages.historyNoToolUsage,
		issues: messages.historyIssuesLabel,
		rawEvents: messages.historyRawEventsLabel,
		rawEventsHelp: messages.historyRawEventsHelp,
		chainCurrentSection: messages.chainCurrentSection,
		chainIgnoredSection: messages.chainIgnoredSection,
		chainProblemsSection: messages.chainProblemsSection,
		chainDetailsSection: messages.chainDetailsSection,
		chainSummaryCurrent: messages.chainSummaryCurrent,
		chainSummaryIgnored: messages.chainSummaryIgnored,
		chainSummaryProblems: messages.chainSummaryProblems,
		chainWorkspaceRootLabel: messages.chainWorkspaceRootLabel,
		chainNoWorkspace: messages.chainNoWorkspace,
		chainDetailStatus: messages.chainDetailStatus,
		chainDetailClassification: messages.chainDetailClassification,
		chainDetailPath: messages.chainDetailPath,
		chainDetailExplanation: messages.chainDetailExplanation,
	});
	const csp = [
		"default-src 'none'",
		`img-src ${webview.cspSource} https: data:`,
		`font-src ${webview.cspSource} data:`,
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`script-src 'nonce-${nonce}'`,
	].join('; ');
	const codiconLink = codiconCssHref
		? `<link rel="stylesheet" href="${codiconCssHref}" />`
		: '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="${csp}" />
	${codiconLink}
	<title>${messages.coreViewPanelTitle}</title>
	<style>
		body { margin: 0; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
		.root { display: grid; grid-template-rows: auto 1fr; height: 100vh; }
		.tabs { display: flex; gap: 4px; padding: 8px 12px 0; border-bottom: 1px solid var(--vscode-panel-border); }
		.tab { border: 1px solid var(--vscode-panel-border); border-bottom: 0; padding: 6px 10px; border-radius: 4px 4px 0 0; background: var(--vscode-tab-inactiveBackground); color: var(--vscode-tab-inactiveForeground); display: inline-flex; gap: 6px; align-items: center; }
		.tab.active { background: var(--vscode-tab-activeBackground); color: var(--vscode-tab-activeForeground); }
		.diag-tab { display: none; min-height: 0; }
		.diag-tab.active { display: grid; grid-template-rows: auto 1fr; }
		.top-pane, .tab-toolbar { padding: 10px 12px; border-bottom: 1px solid var(--vscode-panel-border); }
		.toolbar { display: flex; gap: 8px; align-items: center; }
		.toolbar input { flex: 1; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 8px; padding: 6px 8px; }
		.toolbar input:focus { outline: none; border-color: var(--vscode-focusBorder, #0e639c); box-shadow: 0 0 0 1px var(--vscode-focusBorder, #0e639c); }
		.bottom-pane { display: grid; grid-template-columns: 30% 70%; min-height: 0; }
		.left-pane { border-right: 1px solid var(--vscode-panel-border); overflow: auto; padding: 10px 8px; }
		.right-pane { overflow: auto; padding: 10px 8px; }
		.turn-card, .message-frame, .setting-card, .warning-card, .hook-entry-card, .hooks-source-item { border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editorWidget-background); padding: 8px; }
		.turn-card { width: 100%; text-align: left; display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; color: inherit; cursor: pointer; }
		.turn-card.active { border-color: var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
		.turn-title { font-size: 12px; line-height: 1.4; word-break: break-word; }
		.turn-main { display: grid; gap: 4px; min-width: 0; }
		.turn-meta, .message-meta, .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
		.turn-meta { display: inline-flex; gap: 8px; align-items: center; }
		.turn-issue-badge { color: var(--vscode-editorWarning-foreground); }
		.preview-empty { color: var(--vscode-descriptionForeground); }
		.answer-block, .chain-list, .chain-detail, .trusted-list, .settings-list, .history-list, .history-section { display: grid; gap: 6px; }
		.history-section.compact { gap: 3px; }
		.history-section.compact .section-title { margin-bottom: 4px; }
		.frame-header, .setting-card, .trusted-row { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
		.message-frame { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: start; }
		.message-main { display: grid; gap: 4px; min-width: 0; }
		.copy-button { border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); padding: 4px 6px; cursor: pointer; }
		.icon-button { width: 24px; height: 24px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--vscode-panel-border); border-radius: 4px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); cursor: pointer; }
		.meta-grid, .chain-detail-grid { display: grid; grid-template-columns: 140px 1fr; gap: 8px 12px; }
		.meta-label, .chain-detail-label { color: var(--vscode-descriptionForeground); font-size: 12px; font-weight: 600; }
		.section-title, .chain-section-title { margin: 0 0 6px; font-size: 12px; color: var(--vscode-descriptionForeground); }
		.markdown-content p { margin: 0 0 12px 0; line-height: 1.6; }
		.markdown-content pre, .raw-events pre { background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; overflow: auto; }
		mark.search-highlight { background: var(--vscode-editor-findMatchHighlightBackground); }
		.message-heading { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; color: var(--vscode-foreground); }
		.message-heading .codicon-comment, .message-heading .codicon-account, .message-heading .codicon-copilot, .message-heading .codicon-tools { color: inherit; }
		.message-heading-wrap { display: grid; gap: 4px; }
		.row-icon { font-size: 22px; color: var(--vscode-descriptionForeground); align-self: start; }
		.block-actions { display: flex; align-items: start; }
		.raw-events { margin: 0; }
		.raw-events summary { margin-bottom: 6px; }
		.answer-block > section, .answer-block > details { margin: 0; }
		.answer-block ul { margin: 0; padding-left: 20px; }
		.chain-toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
		.chain-toolbar-main { display: grid; gap: 4px; min-width: 0; }
		.chain-summary-line { color: var(--vscode-descriptionForeground); font-size: 12px; }
		.chain-group { display: grid; gap: 6px; }
		.chain-row { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; width: 100%; padding: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editorWidget-background); color: var(--vscode-foreground); text-align: left; cursor: pointer; }
		.chain-row.active { border-color: var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
		.chain-main { display: grid; gap: 4px; min-width: 0; }
		.chain-title { font-weight: 600; word-break: break-word; }
		.chain-subtitle, .chain-status-meta, .chain-path { color: var(--vscode-descriptionForeground); font-size: 12px; }
		.chain-status-badge { display: inline-flex; align-items: center; gap: 6px; color: var(--vscode-descriptionForeground); font-size: 12px; white-space: nowrap; }
		.chain-detail-card { display: grid; gap: 10px; padding: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editorWidget-background); }
		.required-switch { display: inline-flex; align-items: center; cursor: pointer; user-select: none; gap: 8px; }
		.required-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
		.required-switch span.switch-track { display: inline-block; width: 34px; height: 18px; border-radius: 999px; background: var(--vscode-checkbox-background, var(--vscode-input-background)); border: 1px solid var(--vscode-checkbox-border, var(--vscode-panel-border)); position: relative; vertical-align: middle; box-sizing: border-box; transition: background 0.15s ease, border-color 0.15s ease; }
		.required-switch span.switch-track::after { content: ""; position: absolute; top: 50%; left: 1px; width: 14px; height: 14px; border-radius: 50%; background: var(--vscode-button-secondaryForeground); transform: translateY(-50%); transition: transform 0.15s ease; }
		.required-switch input:checked + span.switch-track { background: var(--vscode-button-background); border-color: var(--vscode-button-background); }
		.required-switch input:checked + span.switch-track::after { transform: translate(16px, -50%); background: var(--vscode-button-foreground); }
		.required-switch input:focus-visible + span.switch-track { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
		.chain-toggle-label { color: var(--vscode-descriptionForeground); font-size: 12px; }
	</style>
</head>
<body>
	<div class="root">
		<nav class="tabs" aria-label="${escapeHtml(messages.coreViewTabsAriaLabel)}">
			<button class="tab active" data-tab="history" type="button"><span class="codicon codicon-history" aria-hidden="true"></span><span>${messages.coreViewConversationHistoryTab}</span></button>
			<button class="tab" data-tab="chain" type="button"><span class="codicon codicon-copilot" aria-hidden="true"></span><span>${messages.coreViewAgentsChainTab}</span></button>
			<button class="tab" data-tab="trusted" type="button">${messages.coreViewTrustedDirectoriesTab}</button>
			<button class="tab" data-tab="hooks" type="button">${messages.coreViewHooksTab}</button>
		</nav>
		<section id="historyTab" class="diag-tab active">
			<section class="top-pane">
				<div class="toolbar">
					<input id="searchInput" type="text" />
					<button id="clearButton" class="icon-button" type="button"></button>
					${buildRefreshButtonHtml('history')}
				</div>
			</section>
			<section class="bottom-pane">
				<aside id="treeArea" class="left-pane"></aside>
				<main id="previewArea" class="right-pane"></main>
			</section>
		</section>
		<section id="chainTab" class="diag-tab">
			<div class="tab-toolbar">
				<div class="chain-toolbar">
					<div class="chain-toolbar-main">
						<div id="chainContext" class="muted"></div>
						<div id="chainSummary" class="chain-summary-line"></div>
					</div>
					<div class="toolbar">
						<label class="required-switch" title="${escapeHtml(messages.chainToggleDetails)}">
							<input id="chainDetailsToggle" type="checkbox" />
							<span class="switch-track"></span>
							<span class="chain-toggle-label">${messages.chainToggleDetails}</span>
						</label>
						${buildRefreshButtonHtml('chain')}
					</div>
				</div>
			</div>
			<section class="bottom-pane">
				<aside id="chainList" class="left-pane"></aside>
				<main id="chainPreview" class="right-pane"></main>
			</section>
		</section>
		<section id="trustedTab" class="diag-tab"><div id="trustedContent"></div></section>
		<section id="hooksTab" class="diag-tab"><div id="hooksContent"></div></section>
	</div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const labels = ${labels};
		let chainPayload = ${serializeAgentsChain({ entries: [], summary: { currentCount: 0, ignoredCount: 0, problemCount: 0, hiddenCount: 0 } })};
		let showDetailedChainCandidates = false;
		let selectedChainId = chainPayload.entries[0]?.id;
		let state = { appliedQuery: '', items: [], selectedTurn: undefined };
		const loadedTabs = new Set();
		const searchInput = document.getElementById('searchInput');
		const clearButton = document.getElementById('clearButton');
		const treeArea = document.getElementById('treeArea');
		const previewArea = document.getElementById('previewArea');
		const chainList = document.getElementById('chainList');
		const chainPreview = document.getElementById('chainPreview');
		const chainContext = document.getElementById('chainContext');
		const chainSummary = document.getElementById('chainSummary');
		const chainDetailsToggle = document.getElementById('chainDetailsToggle');
		const escapeHtml = (value) => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll(\"'\", '&#39;');
		const escapeRegExp = (value) => value.replace(/[.*+?^$()|[\\]{}\\\\]/g, '\\\\$&');
		const renderMarkdown = (markdown) => escapeHtml(markdown || '').split(/\\n{2,}/).map((chunk) => '<p>' + chunk.replaceAll('\\n', '<br />') + '</p>').join('');
		const highlightTitle = (text, query) => {
			const escaped = escapeHtml(text);
			if (!query) {
				return escaped;
			}
			return escaped.replace(new RegExp(escapeRegExp(query), 'gi'), (match) => '<mark class="search-highlight">' + match + '</mark>');
		};
		const chainSections = [['current', labels.chainCurrentSection], ['ignored', labels.chainIgnoredSection], ['problems', labels.chainProblemsSection], ['details', labels.chainDetailsSection]];

		searchInput.placeholder = labels.searchPlaceholder;
		clearButton.title = labels.clear;
		clearButton.innerHTML = '<span class="codicon codicon-clear-all" aria-hidden="true"></span>';

		for (const button of document.querySelectorAll('[data-tab]')) {
			button.addEventListener('click', () => {
				document.querySelectorAll('[data-tab]').forEach((item) => item.classList.remove('active'));
				document.querySelectorAll('.diag-tab').forEach((item) => item.classList.remove('active'));
				button.classList.add('active');
				const tab = button.dataset.tab;
				document.getElementById(tab + 'Tab')?.classList.add('active');
				if (tab && !loadedTabs.has(tab)) {
					vscode.postMessage({ type: 'refreshTab', tab });
				}
			});
		}

		document.addEventListener('click', (event) => {
			const target = event.target instanceof Element ? event.target : null;
			const refreshButton = target?.closest('[data-refresh-tab]');
			if (refreshButton?.dataset?.refreshTab) {
				vscode.postMessage({ type: 'refreshTab', tab: refreshButton.dataset.refreshTab });
				return;
			}
			const addTrustedButton = target?.closest('#addTrusted');
			if (addTrustedButton) {
				vscode.postMessage({ type: 'addTrustedDirectory' });
				return;
			}
			const removeTrustedButton = target?.closest('[data-remove-trusted]');
			if (removeTrustedButton?.dataset?.removeTrusted) {
				vscode.postMessage({ type: 'removeTrustedDirectory', targetPath: removeTrustedButton.dataset.removeTrusted });
				return;
			}
			const openPathButton = target?.closest('[data-open-path]');
			if (openPathButton?.dataset?.openPath) {
				vscode.postMessage({ type: 'openPath', targetPath: openPathButton.dataset.openPath });
				return;
			}
			const createHooksFileButton = target?.closest('[data-create-hooks-file]');
			if (createHooksFileButton?.dataset?.createHooksFile) {
				vscode.postMessage({ type: 'createHooksFile', targetPath: createHooksFileButton.dataset.createHooksFile });
				return;
			}
			const createEmptyFileButton = target?.closest('[data-create-empty-file]');
			if (createEmptyFileButton?.dataset?.createEmptyFile) {
				vscode.postMessage({ type: 'createEmptyFile', targetPath: createEmptyFileButton.dataset.createEmptyFile });
				return;
			}
		});

		document.addEventListener('change', (event) => {
			const target = event.target instanceof HTMLInputElement ? event.target : null;
			if (target === chainDetailsToggle) {
				showDetailedChainCandidates = Boolean(chainDetailsToggle.checked);
				renderChain();
			}
		});

		const renderList = () => {
			if (state.items.length === 0) {
				treeArea.innerHTML = '<div class="preview-empty">' + labels.noResult + '</div>';
				return;
			}
			treeArea.innerHTML = '<div class="history-list"></div>';
			const list = treeArea.querySelector('.history-list');
			for (const item of state.items) {
				const card = document.createElement('button');
				card.type = 'button';
				card.className = 'turn-card' + (state.selectedTurn?.turnId === item.turnId ? ' active' : '');
				card.addEventListener('click', () => vscode.postMessage({ type: 'selectTurn', turnId: item.turnId }));
				card.innerHTML = '<span class="codicon codicon-comment row-icon" aria-hidden="true"></span><div class="turn-main"><div class="turn-meta">' + escapeHtml(item.localTime) + '</div><div class="turn-title">' + highlightTitle(item.displayMessage, state.appliedQuery) + '</div></div>' + (item.issueCount > 0 ? '<div class="turn-issue-badge">' + item.issueCount + '</div>' : '<div></div>');
				list?.appendChild(card);
			}
		};

		const renderPreview = () => {
			if (!state.selectedTurn) {
				previewArea.innerHTML = '<div class="preview-empty">' + labels.noPreview + '</div>';
				return;
			}
			const selected = state.selectedTurn;
			const copyLabel = escapeHtml(labels.copy);
			const assistants = selected.assistantMessages.length > 0
				? selected.assistantMessages.map((item, index) => '<section class="message-frame"><span class="codicon codicon-copilot row-icon" aria-hidden="true"></span><div class="message-main"><div class="message-meta">' + escapeHtml(item.localTime) + '</div><div class="markdown-content">' + renderMarkdown(item.message) + '</div></div><div class="block-actions"><button id="copyAssistantButton-' + index + '" class="copy-button" type="button" title="' + copyLabel + '" aria-label="' + copyLabel + '"><span class="codicon codicon-copy" aria-hidden="true"></span></button></div></section>').join('')
				: '<p class="muted">' + escapeHtml(labels.noAgentResponses) + '</p>';
			const tools = selected.toolUsages.length > 0
				? selected.toolUsages.map((item) => '<section class="message-frame"><span class="codicon codicon-tools row-icon" aria-hidden="true"></span><div class="message-main"><div class="message-heading">' + escapeHtml(item.label) + '</div><div class="message-meta">' + escapeHtml(item.localTime) + ' / ' + escapeHtml(item.status) + '</div>' + (item.detail ? '<div class="markdown-content">' + renderMarkdown(item.detail) + '</div>' : '') + '</div><div></div></section>').join('')
				: '<p class="muted">' + escapeHtml(labels.noToolUsage) + '</p>';
			const issues = selected.issues.length > 0 ? '<section class="history-section"><h2 class="section-title">' + escapeHtml(labels.issues) + '</h2><ul>' + selected.issues.map((issue) => '<li>' + escapeHtml(issue) + '</li>').join('') + '</ul></section>' : '';
			const rawEvents = selected.rawEvents.length > 0 ? '<details class="raw-events"><summary>' + escapeHtml(labels.rawEvents) + '</summary><p class="muted">' + escapeHtml(labels.rawEventsHelp) + '</p><pre>' + escapeHtml(selected.rawEvents.join('\\n\\n')) + '</pre></details>' : '';
			previewArea.innerHTML = '<article class="answer-block"><section class="message-frame"><span class="codicon codicon-account row-icon" aria-hidden="true"></span><div class="message-main"><div class="message-meta">' + escapeHtml(selected.userMessageLocalTime) + '</div><div class="markdown-content">' + renderMarkdown(selected.userMessage) + '</div></div><div class="block-actions"><button id="copyUserButton" class="copy-button" type="button" title="' + copyLabel + '" aria-label="' + copyLabel + '"><span class="codicon codicon-copy" aria-hidden="true"></span></button></div></section><section class="history-section compact"><h2 class="section-title">' + escapeHtml(labels.agentResponses) + '</h2>' + assistants + '</section><section class="history-section compact"><h2 class="section-title">' + escapeHtml(labels.toolUsage) + '</h2>' + tools + '</section>' + issues + rawEvents + '</article>';
			document.getElementById('copyUserButton')?.addEventListener('click', () => vscode.postMessage({ type: 'copyText', text: selected.userMessage }));
			for (let index = 0; index < selected.assistantMessages.length; index += 1) {
				document.getElementById('copyAssistantButton-' + index)?.addEventListener('click', () => vscode.postMessage({ type: 'copyText', text: selected.assistantMessages[index].message }));
			}
		};

		const getVisibleChainEntries = () => (chainPayload.entries || []).filter((entry) => entry.defaultVisible || showDetailedChainCandidates);
		const renderChain = () => {
			const visibleEntries = getVisibleChainEntries();
			const summary = chainPayload.summary || { currentCount: 0, ignoredCount: 0, problemCount: 0, hiddenCount: 0 };
			chainContext.innerHTML = chainPayload.workspaceRoot ? escapeHtml(labels.chainWorkspaceRootLabel + ': ' + chainPayload.workspaceRoot) : escapeHtml(labels.chainWorkspaceRootLabel + ': ' + labels.chainNoWorkspace);
			chainSummary.innerHTML = labels.chainSummaryCurrent + ': ' + summary.currentCount + ' / ' + labels.chainSummaryIgnored + ': ' + summary.ignoredCount + ' / ' + labels.chainSummaryProblems + ': ' + summary.problemCount;
			if (visibleEntries.length === 0) {
				chainList.innerHTML = '<div class="preview-empty">' + (chainPayload.emptyStateMessage || labels.noResult) + '</div>';
				chainPreview.innerHTML = '<div class="preview-empty">' + (chainPayload.emptyStateMessage || labels.noResult) + '</div>';
				return;
			}
			if (!visibleEntries.some((entry) => entry.id === selectedChainId)) {
				selectedChainId = visibleEntries[0].id;
			}
			chainList.innerHTML = '';
			for (const [sectionId, sectionLabel] of chainSections) {
				const sectionEntries = visibleEntries.filter((entry) => entry.section === sectionId);
				if (sectionEntries.length === 0) {
					continue;
				}
				const section = document.createElement('section');
				section.className = 'chain-group';
				section.innerHTML = '<h3 class="chain-section-title">' + escapeHtml(sectionLabel) + '</h3>';
				for (const entry of sectionEntries) {
					const card = document.createElement('button');
					card.type = 'button';
					card.className = 'chain-row' + (entry.id === selectedChainId ? ' active' : '');
					card.innerHTML = '<span class="codicon codicon-file row-icon" aria-hidden="true"></span><div class="chain-main"><div class="chain-title">' + escapeHtml(entry.title) + '</div><div class="chain-subtitle">' + escapeHtml(entry.summary) + '</div></div><div class="chain-status-badge">' + escapeHtml(entry.statusLabel) + '</div>';
					card.addEventListener('click', () => { selectedChainId = entry.id; renderChain(); });
					section.appendChild(card);
				}
				chainList.appendChild(section);
			}
			const selected = visibleEntries.find((entry) => entry.id === selectedChainId) || visibleEntries[0];
			chainPreview.innerHTML = '<section class="chain-detail-card"><div class="chain-main"><div class="chain-title">' + escapeHtml(selected.title) + '</div><div class="chain-status-meta">' + escapeHtml(selected.statusLabel) + ' / ' + escapeHtml(selected.subtitle) + '</div></div><div class="chain-detail-grid"><div class="chain-detail-label">' + escapeHtml(labels.chainDetailStatus) + '</div><div>' + escapeHtml(selected.statusLabel) + '</div><div class="chain-detail-label">' + escapeHtml(labels.chainDetailClassification) + '</div><div>' + escapeHtml(selected.subtitle) + '</div><div class="chain-detail-label">' + escapeHtml(labels.chainDetailPath) + '</div><div class="chain-path">' + escapeHtml(selected.path) + '</div><div class="chain-detail-label">' + escapeHtml(labels.chainDetailExplanation) + '</div><div>' + escapeHtml(selected.explanation) + '</div></div>' + (selected.contentPreview ? '<pre>' + escapeHtml(selected.contentPreview) + '</pre>' : '') + '</section>';
		};

		const render = () => {
			searchInput.value = state.appliedQuery;
			renderList();
			renderPreview();
			renderChain();
		};

		searchInput.addEventListener('input', () => vscode.postMessage({ type: 'search', query: searchInput.value }));
		clearButton.addEventListener('click', () => {
			searchInput.value = '';
			vscode.postMessage({ type: 'clearSearch' });
		});

		window.addEventListener('message', (event) => {
			const message = event.data;
			if (message?.type === 'tabContent') {
				if (message.tab === 'chain') {
					loadedTabs.add('chain');
					chainPayload = message.payload || { entries: [], summary: { currentCount: 0, ignoredCount: 0, problemCount: 0, hiddenCount: 0 } };
					selectedChainId = chainPayload.entries.find((entry) => entry.defaultVisible)?.id || chainPayload.entries[0]?.id;
					renderChain();
				}
				if (message.tab === 'trusted') {
					loadedTabs.add('trusted');
					document.getElementById('trustedContent').innerHTML = message.html;
				}
				if (message.tab === 'hooks') {
					loadedTabs.add('hooks');
					document.getElementById('hooksContent').innerHTML = message.html;
				}
				return;
			}
			if (message?.type !== 'state') {
				return;
			}
			loadedTabs.add('history');
			state = message.payload;
			render();
		});

		vscode.postMessage({ type: 'ready' });
	</script>
</body>
</html>`;
}

export function createHistoryWebviewPanel(): vscode.WebviewPanel {
	const panelOptions: vscode.WebviewPanelOptions & vscode.WebviewOptions = {
		enableScripts: true,
		retainContextWhenHidden: true,
		...(CODICON_RESOURCE_ROOTS.length > 0
			? { localResourceRoots: CODICON_RESOURCE_ROOTS }
			: {}),
	};
	const panel = vscode.window.createWebviewPanel(
		HISTORY_VIEW_TYPE,
		messages.coreViewPanelTitle,
		{ viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
		panelOptions,
	);
	panel.iconPath = getCodiconIconPath('copilot');
	return panel;
}

export class HistoryPanelManager implements vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	private state: HistoryPanelState | undefined;

	constructor(
		private readonly panelFactory: () => vscode.WebviewPanel = createHistoryWebviewPanel,
		private readonly loadIndex: () => HistoryIndex = () => buildHistoryIndex(),
		private readonly copyToClipboard: (text: string) => Thenable<void> = (text) =>
			vscode.env.clipboard.writeText(text),
		private readonly notifyCopied: () => Thenable<string | undefined> = () =>
			vscode.window.showInformationMessage(messages.historyCopied),
		private readonly getMaxHistoryCount: () => number = () =>
			getMaxSessionHistoryCount(),
		private readonly registerPanelDispose: (
			panel: vscode.WebviewPanel,
			listener: () => void,
		) => vscode.Disposable | void = (panel, listener) => panel.onDidDispose(listener),
	) {}

	show(): vscode.WebviewPanel {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Active, true);
			this.postState();
			return this.panel;
		}

		const panel = this.panelFactory();
		this.state = {
			index: createEmptyHistoryIndex(),
			selectedTurnId: undefined,
			appliedQuery: '',
		};
		const codiconCssHref = getCodiconCssHref(panel.webview);
		panel.webview.html = buildHistoryWebviewHtml(panel.webview, codiconCssHref);
		panel.webview.onDidReceiveMessage((message: unknown) =>
			this.handleInboundMessage(message),
		);
		this.registerPanelDispose(panel, () => {
			if (this.panel === panel) {
				this.panel = undefined;
				this.state = undefined;
			}
		});
		this.panel = panel;
		return panel;
	}

	private handleInboundMessage(message: unknown): void {
		if (!this.panel || !this.state || !message || typeof message !== 'object') {
			return;
		}
		const incoming = message as Partial<HistoryPanelInboundMessage>;
		if (incoming.type === 'ready') {
			this.refreshTab('history');
			return;
		}
		if (incoming.type === 'selectTurn' && typeof incoming.turnId === 'string') {
			this.state.selectedTurnId = incoming.turnId;
			this.postState();
			return;
		}
		if (incoming.type === 'search' && typeof incoming.query === 'string') {
			this.state.appliedQuery = normalizeQuery(incoming.query);
			this.state.selectedTurnId = undefined;
			this.postState();
			return;
		}
		if (incoming.type === 'clearSearch') {
			this.state.appliedQuery = '';
			this.state.selectedTurnId = undefined;
			this.postState();
			return;
		}
		if (incoming.type === 'copyText' && typeof incoming.text === 'string') {
			void this.copyToClipboard(incoming.text);
			void this.notifyCopied();
			return;
		}
		if (incoming.type === 'refreshTab' && isCoreViewTab(incoming.tab)) {
			this.refreshTab(incoming.tab);
			return;
		}
		if (incoming.type === 'addTrustedDirectory') {
			void this.addTrustedDirectory();
			return;
		}
		if (
			incoming.type === 'removeTrustedDirectory' &&
			typeof incoming.targetPath === 'string'
		) {
			void this.removeTrustedDirectory(incoming.targetPath);
			return;
		}
		if (incoming.type === 'openPath' && typeof incoming.targetPath === 'string') {
			void this.openPath(incoming.targetPath);
			return;
		}
		if (
			incoming.type === 'createHooksFile' &&
			typeof incoming.targetPath === 'string'
		) {
			void this.createHooksFile(incoming.targetPath);
			return;
		}
		if (
			incoming.type === 'createEmptyFile' &&
			typeof incoming.targetPath === 'string'
		) {
			void this.createEmptyFile(incoming.targetPath);
		}
	}

	private async addTrustedDirectory(): Promise<void> {
		const picked = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
		});
		const targetPath = picked?.[0]?.fsPath;
		if (!targetPath) {
			return;
		}
		addTrustedDirectory(resolveCopilotPaths().configPath, targetPath);
		vscode.window.showInformationMessage(messages.mcpToggleUpdated);
		this.refreshTab('trusted');
	}

	private async removeTrustedDirectory(targetPath: string): Promise<void> {
		const choice = await vscode.window.showWarningMessage(
			messages.trustedDirectoryDeleteConfirm(targetPath),
			{ modal: true },
			messages.dialogOk,
		);
		if (choice !== messages.dialogOk) {
			return;
		}
		removeTrustedDirectory(resolveCopilotPaths().configPath, targetPath);
		vscode.window.showInformationMessage(messages.mcpToggleUpdated);
		this.refreshTab('trusted');
	}

	private async openPath(targetPath: string): Promise<void> {
		await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetPath));
	}

	private async createHooksFile(targetPath: string): Promise<void> {
		createHooksJsonFile(targetPath);
		await this.openPath(targetPath);
		this.refreshTab('hooks');
	}

	private async createEmptyFile(targetPath: string): Promise<void> {
		fs.mkdirSync(path.dirname(targetPath), { recursive: true });
		if (!fs.existsSync(targetPath)) {
			fs.writeFileSync(targetPath, '', 'utf8');
		}
		await this.openPath(targetPath);
		this.refreshTab('hooks');
	}

	private refreshTab(tab: CoreViewTab): void {
		if (!this.panel || !this.state) {
			return;
		}
		if (tab === 'chain') {
			void this.panel.webview.postMessage({
				type: 'tabContent',
				tab,
				payload: buildAgentsChainPayload(),
			});
			return;
		}
		if (tab === 'trusted') {
			void this.panel.webview.postMessage({
				type: 'tabContent',
				tab,
				html: buildTrustedDirectoriesHtml(),
			});
			return;
		}
		if (tab === 'hooks') {
			void this.panel.webview.postMessage({
				type: 'tabContent',
				tab,
				html: buildHooksHtml(),
			});
			return;
		}
		this.state.index = limitHistoryIndex(this.loadIndex(), this.getMaxHistoryCount());
		this.postState();
	}

	private postState(): void {
		if (!this.panel || !this.state) {
			return;
		}
		const viewModel = deriveHistoryPanelViewModel(this.state);
		this.state.selectedTurnId = viewModel.selectedTurn?.turnId;
		void this.panel.webview.postMessage({ type: 'state', payload: viewModel });
	}

	dispose(): void {
		this.panel?.dispose();
		this.panel = undefined;
		this.state = undefined;
	}
}

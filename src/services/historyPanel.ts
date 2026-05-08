import path from 'path';
import * as vscode from 'vscode';
import { messages } from '../i18n';
import { getMaxSessionHistoryCount } from './settings';
import {
	addTrustedDirectory,
	createInstructionFile,
	removeTrustedDirectory,
} from './coreDiagnosticsService';
import { setPluginEnabled } from './pluginConfigService';
import { resolveCopilotPaths } from './workspaceStatus';
import { buildHistoryIndex, HistoryIndex } from './historyService';
import {
	buildAgentsChainPayload,
	AgentsChainDisplayPayload,
	buildHooksPayload,
	buildPluginsPayload,
	buildTrustedDirectoriesHtml,
	createEmptyHistoryIndex,
	deriveHistoryPanelViewModel,
	fileExists,
	HistoryPanelState,
	isCoreViewTab,
	normalizeQuery,
	sanitizeHookFileName,
	CoreViewTab,
} from './historyPanelState';
import {
	CODICON_RESOURCE_ROOTS,
	IMAGE_RESOURCE_ROOTS,
	getCodiconCssHref,
	getCodiconIconPath,
	getWebviewFontFamily,
	getWebviewImageHref,
} from './webviewAssets';
import { sanitizeName } from './fileNaming';
import { promptTextInputWithQuickPick } from './textInputQuickPick';

export { deriveHistoryPanelViewModel } from './historyPanelState';

const HISTORY_VIEW_TYPE = 'copilot-workspace-manager.coreView';

type HistoryPanelInboundMessage =
	| { type: 'ready' }
	| { type: 'selectTurn'; turnId: string }
	| { type: 'search'; query: string }
	| { type: 'clearSearch' }
	| { type: 'copyText'; text: string }
	| { type: 'refreshTab'; tab: CoreViewTab }
	| { type: 'addInstruction' }
	| { type: 'addTrustedDirectory' }
	| { type: 'addHooksFile' }
	| { type: 'removeTrustedDirectory'; targetPath: string; sourcePath: string }
	| { type: 'togglePluginEnabled'; pluginSpec: string; enabled: boolean }
	| { type: 'openPath'; targetPath: string };

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

function buildRefreshButtonHtml(tab: CoreViewTab): string {
	return `<button class="icon-button" type="button" data-refresh-tab="${tab}" title="${escapeHtml(messages.commandRefresh)}" aria-label="${escapeHtml(messages.commandRefresh)}"><span class="codicon codicon-refresh" aria-hidden="true"></span></button>`;
}

function serializeAgentsChain(payload: AgentsChainDisplayPayload): string {
	return JSON.stringify(payload);
}

function buildHistoryWebviewHtml(
	webview: vscode.Webview,
	codiconCssHref: string | undefined,
): string {
	const nonce = createNonce();
	const fontFamily = getWebviewFontFamily();
	const agentLightIconHref = getWebviewImageHref(webview, 'agents_light.png');
	const agentDarkIconHref = getWebviewImageHref(webview, 'agents_dark.png');
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
		chainSummaryFound: messages.chainSummaryFound,
		chainSummaryPotentialConflict: messages.chainSummaryPotentialConflict,
		chainAddInstruction: messages.chainAddInstruction,
		chainWorkspaceRootLabel: messages.chainWorkspaceRootLabel,
		chainNoWorkspace: messages.chainNoWorkspace,
		chainPreviewEmpty: messages.chainPreviewEmpty,
		chainDetailScope: messages.chainDetailScope,
		chainDetailClassification: messages.chainDetailClassification,
		chainDetailPath: messages.chainDetailPath,
		chainDetailApplyTo: messages.chainDetailApplyTo,
		chainDetailExplanation: messages.chainDetailExplanation,
		chainScopePath: messages.chainScopePath,
		hooksOpenSource: messages.hooksOpenSource,
		hooksNoEntries: messages.hooksNoEntries,
		hooksNoCommand: messages.hooksNoCommand,
		hooksEntryCount: messages.hooksEntryCount(0),
		hooksCommandLabel: messages.hooksCommandLabel,
		hooksMatcherLabel: messages.hooksMatcherLabel,
		hooksMatcherNotUsed: messages.hooksMatcherNotUsed,
		hooksSchemaLabel: messages.hooksSchemaLabel,
		hooksTypeLabel: messages.hooksTypeLabel,
		hooksBashLabel: messages.hooksBashLabel,
		hooksPowershellLabel: messages.hooksPowershellLabel,
		hooksPromptLabel: messages.hooksPromptLabel,
		hooksTimeoutLabel: messages.hooksTimeoutLabel,
		hooksStatusMessageLabel: messages.hooksStatusMessageLabel,
		open: messages.agentManagerOpen,
		pluginsToggle: messages.pluginsToggle,
		pluginToggleUpdated: messages.pluginToggleUpdated,
		pluginsEmpty: messages.pluginsEmpty,
		pluginsAgents: messages.pluginsAgents,
		pluginsSkills: messages.pluginsSkills,
		pluginsCommands: messages.pluginsCommands,
		pluginsHooks: messages.pluginsHooks,
		pluginsMcpServers: messages.pluginsMcpServers,
		pluginsLspServers: messages.pluginsLspServers,
		pluginsDiagnostics: messages.pluginsDiagnostics,
		pluginsState: messages.pluginsState,
		pluginsInstallKind: messages.pluginsInstallKind,
		pluginsPluginRoot: messages.pluginsPluginRoot,
		pluginsManifestPath: messages.pluginsManifestPath,
		pluginsVersion: messages.pluginsVersion,
		pluginsAuthor: messages.pluginsAuthor,
		pluginsLicense: messages.pluginsLicense,
		pluginsHomepage: messages.pluginsHomepage,
		pluginsRepository: messages.pluginsRepository,
		pluginsKeywords: messages.pluginsKeywords,
		pluginsCategory: messages.pluginsCategory,
		pluginsTags: messages.pluginsTags,
		pluginsDescription: messages.pluginsDescription,
		pluginsPath: messages.pluginsPath,
		pluginsStatus: messages.pluginsStatus,
		pluginsSource: messages.pluginsSource,
		pluginsCount: messages.pluginsCount,
		pluginsType: messages.pluginsType,
		pluginsTools: messages.pluginsTools,
		pluginsSeverity: messages.pluginsSeverity,
		pluginsStateEnabled: messages.pluginsStateEnabled,
		pluginsStateDisabled: messages.pluginsStateDisabled,
		pluginsStateUnknown: messages.pluginsStateUnknown,
		pluginsInstallKindMarketplace: messages.pluginsInstallKindMarketplace,
		pluginsInstallKindDirect: messages.pluginsInstallKindDirect,
		pluginsInstallKindUnknown: messages.pluginsInstallKindUnknown,
		pluginsComponentStatusReadonly: messages.pluginsComponentStatusReadonly,
		pluginsComponentStatusConflict: messages.pluginsComponentStatusConflict,
		pluginsComponentStatusOverridden: messages.pluginsComponentStatusOverridden,
		pluginsDiagnosticSeverityInfo: messages.pluginsDiagnosticSeverityInfo,
		pluginsDiagnosticSeverityWarning: messages.pluginsDiagnosticSeverityWarning,
		pluginsDiagnosticSeverityError: messages.pluginsDiagnosticSeverityError,
		pluginsNone: messages.pluginsNone,
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
		body { margin: 0; font-family: ${fontFamily}; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
		.root { display: grid; grid-template-rows: auto 1fr; height: 100vh; }
		.tabs { display: flex; gap: 4px; padding: 8px 12px 0; border-bottom: 1px solid var(--vscode-panel-border); }
		.tab { border: 1px solid var(--vscode-panel-border); border-bottom: 0; padding: 6px 10px; border-radius: 4px 4px 0 0; background: var(--vscode-tab-inactiveBackground); color: var(--vscode-tab-inactiveForeground); display: inline-flex; gap: 6px; align-items: center; }
		.tab.active { background: var(--vscode-tab-activeBackground); color: var(--vscode-tab-activeForeground); }
		.diag-tab { display: none; min-height: 0; }
		.diag-tab.active { display: grid; grid-template-rows: auto 1fr; }
		.top-pane, .tab-toolbar { padding: 10px 12px; border-bottom: 1px solid var(--vscode-panel-border); }
		.tab-toolbar { display: flex; gap: 8px; align-items: center; }
		.tab-toolbar-actions-right { justify-content: flex-end; }
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
		.answer-block, .chain-list, .chain-detail, .trusted-list, .settings-list, .history-list, .history-section, .hooks-list { display: grid; gap: 6px; }
		.trusted-list, .settings-list { padding: 10px 8px; }
		.history-section.compact { gap: 3px; }
		.history-section.compact .section-title { margin-bottom: 4px; }
		.frame-header, .setting-card { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
		.message-frame { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: start; }
		.message-main { display: grid; gap: 4px; min-width: 0; }
		.copy-button { border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); padding: 4px 6px; cursor: pointer; }
		.icon-button { width: 24px; height: 24px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--vscode-panel-border); border-radius: 4px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); cursor: pointer; }
		.meta-grid, .chain-detail-grid { display: grid; grid-template-columns: 140px 1fr; gap: 8px 12px; }
		.meta-label, .chain-detail-label { color: var(--vscode-descriptionForeground); font-size: 12px; font-weight: 600; }
		.section-title { margin: 0 0 6px; font-size: 12px; color: var(--vscode-descriptionForeground); }
		.chain-section-title { margin: 0 0 2px; font-size: 12px; color: var(--vscode-descriptionForeground); }
		.markdown-content p { margin: 0 0 12px 0; line-height: 1.6; }
		.markdown-content code, .markdown-content pre, .markdown-content pre code, .raw-events pre { font-family: inherit; }
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
		.chain-toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; width: 100%; }
		.chain-toolbar-main { display: grid; gap: 4px; min-width: 0; }
		.chain-summary-line { color: var(--vscode-descriptionForeground); font-size: 12px; }
		.chain-group { display: grid; gap: 2px; }
		.chain-group-details { margin-top: 2px; }
		.chain-row { position: relative; display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: start; width: 100%; padding: 8px 10px 8px 8px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editorWidget-background); color: var(--vscode-foreground); text-align: left; cursor: pointer; }
		.chain-row.active { border-color: var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
		.chain-icon-image { width: 16px; height: 16px; display: inline-block; }
		.chain-icon-image.dark { display: none; }
		body.vscode-dark .chain-icon-image.light, body.vscode-high-contrast:not(.vscode-high-contrast-light) .chain-icon-image.light { display: none; }
		body.vscode-dark .chain-icon-image.dark, body.vscode-high-contrast:not(.vscode-high-contrast-light) .chain-icon-image.dark { display: inline-block; }
		.chain-row-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
		.chain-list-badge { display: inline-flex; align-items: center; padding: 1px 6px; border-radius: 999px; background: var(--vscode-textBlockQuote-background); color: var(--vscode-textLink-foreground); border: 1px solid color-mix(in srgb, var(--vscode-textLink-foreground) 28%, var(--vscode-panel-border)); font-size: 11px; line-height: 1.4; white-space: nowrap; }
		.chain-main { display: grid; gap: 4px; min-width: 0; }
		.chain-title { flex: 1; min-width: 0; font-weight: 600; word-break: break-word; }
		.chain-subtitle, .chain-status-meta, .chain-path { color: var(--vscode-descriptionForeground); font-size: 12px; }
		.trusted-row { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; padding: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editorWidget-background); }
		.trusted-main { display: grid; gap: 4px; min-width: 0; }
		.trusted-title { font-weight: 600; }
		.trusted-path { color: var(--vscode-descriptionForeground); font-size: 12px; word-break: break-all; }
		.trusted-actions { display: flex; align-items: center; gap: 10px; }
		.hook-source-row { width: 100%; box-sizing: border-box; display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; padding: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editorWidget-background); color: var(--vscode-foreground); font: inherit; text-align: left; cursor: pointer; }
		.hook-source-row.active { border-color: var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
		.hook-source-main { display: grid; gap: 4px; min-width: 0; }
		.hook-source-title { font-weight: 600; }
		.hook-source-path, .hook-source-meta, .hook-entry-meta, .hook-entry-detail-label { color: var(--vscode-descriptionForeground); font-size: 12px; }
		.hook-source-row.active .hook-source-path, .hook-source-row.active .hook-source-meta { color: inherit; opacity: 0.85; }
		.hook-source-path { word-break: break-all; }
		.hook-source-actions { display: flex; align-items: center; gap: 10px; }
		.hook-entry-list { display: grid; gap: 6px; }
		.hook-entry-card { display: grid; gap: 8px; }
		.hook-entry-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
		.hook-entry-heading-main { display: inline-flex; align-items: center; gap: 8px; min-width: 0; font-weight: 600; }
		.hook-entry-heading-label { min-width: 0; word-break: break-word; }
		.hook-entry-card-action { display: flex; align-items: center; flex-shrink: 0; }
		.hook-entry-detail-grid { display: grid; grid-template-columns: 110px 1fr; gap: 6px 12px; }
		.plugin-block { padding: 0; overflow: hidden; }
		.plugin-block-body { display: grid; gap: 8px; padding: 10px; }
		.plugin-block-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px; cursor: pointer; list-style: none; }
		.plugin-block-summary::-webkit-details-marker { display: none; }
		.plugin-block-summary:hover { background: var(--vscode-list-hoverBackground); }
		.plugin-block-summary-main { display: inline-flex; align-items: center; gap: 8px; min-width: 0; font-weight: 600; }
		.plugin-block-summary-meta { display: inline-flex; align-items: center; gap: 8px; color: var(--vscode-descriptionForeground); font-size: 12px; white-space: nowrap; }
		.plugin-block-summary .codicon-chevron-right { transition: transform 120ms ease; }
		.plugin-block[open] .plugin-block-summary .codicon-chevron-right { transform: rotate(90deg); }
		.plugin-overview-card { padding: 10px; }
		.plugin-state-value { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
		.switch { display: inline-flex; align-items: center; cursor: pointer; }
		.switch input { display: none; }
		.switch span { display: inline-block; width: 34px; height: 18px; border-radius: 999px; background: #d85b74; position: relative; vertical-align: middle; }
		.switch span::after { content: ""; position: absolute; width: 14px; height: 14px; top: 2px; left: 2px; border-radius: 50%; background: #6e6e6e; transition: left 0.12s ease; }
		.switch input:checked + span { background: var(--vscode-testing-iconPassed); }
		.switch input:checked + span::after { left: 18px; }
		@media (prefers-color-scheme: dark) { .switch span::after { background: #ffffff; } }
		.chain-detail-card { position: relative; display: grid; gap: 8px; padding: 10px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editorWidget-background); }
		.chain-preview-block { padding: 10px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editor-background); }
		.chain-summary-warning { color: var(--vscode-editorWarning-foreground); }
	</style>
</head>
<body>
	<div class="root">
		<nav class="tabs" aria-label="${escapeHtml(messages.coreViewTabsAriaLabel)}">
			<button class="tab active" data-tab="history" type="button"><span class="codicon codicon-history" aria-hidden="true"></span><span>${messages.coreViewConversationHistoryTab}</span></button>
			<button class="tab" data-tab="chain" type="button"><span class="codicon codicon-copilot" aria-hidden="true"></span><span>${messages.coreViewAgentsChainTab}</span></button>
			<button class="tab" data-tab="trusted" type="button"><span class="codicon codicon-workspace-trusted" aria-hidden="true"></span><span>${messages.coreViewTrustedDirectoriesTab}</span></button>
			<button class="tab" data-tab="hooks" type="button"><span class="codicon codicon-symbol-event" aria-hidden="true"></span><span>${messages.coreViewHooksTab}</span></button>
			<button class="tab" data-tab="plugins" type="button"><span class="codicon codicon-plug" aria-hidden="true"></span><span>${messages.coreViewPluginsTab}</span></button>
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
					<div class="toolbar"><button id="addInstructionFile" class="icon-button" type="button" title="${escapeHtml(messages.chainAddInstruction)}" aria-label="${escapeHtml(messages.chainAddInstruction)}"><span class="codicon codicon-add" aria-hidden="true"></span></button>${buildRefreshButtonHtml('chain')}</div>
				</div>
			</div>
			<section class="bottom-pane">
				<aside id="chainList" class="left-pane"></aside>
				<main id="chainPreview" class="right-pane"></main>
			</section>
		</section>
		<section id="trustedTab" class="diag-tab"><div id="trustedContent"></div></section>
		<section id="hooksTab" class="diag-tab">
			<div class="tab-toolbar tab-toolbar-actions-right"><button id="addHooksFile" class="icon-button" type="button" title="${escapeHtml(messages.hooksAddFile)}" aria-label="${escapeHtml(messages.hooksAddFile)}"><span class="codicon codicon-add" aria-hidden="true"></span></button>${buildRefreshButtonHtml('hooks')}</div>
			<section class="bottom-pane">
				<aside class="left-pane"><div id="hooksList" class="hooks-list"></div></aside>
				<main id="hooksPreview" class="right-pane"></main>
			</section>
		</section>
		<section id="pluginsTab" class="diag-tab">
			<div class="tab-toolbar tab-toolbar-actions-right">${buildRefreshButtonHtml('plugins')}</div>
			<section class="bottom-pane">
				<aside class="left-pane"><div id="pluginsList" class="hooks-list"></div></aside>
				<main id="pluginsPreview" class="right-pane"></main>
			</section>
		</section>
	</div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const labels = ${labels};
		let chainPayload = ${serializeAgentsChain({ entries: [], summary: { foundCount: 0, hasPotentialConflict: false } })};
		let hooksPayload = { sources: [], entries: [], emptyStateMessage: labels.noResult };
		let pluginsPayload = { plugins: [], emptyStateMessage: labels.pluginsEmpty };
		let selectedChainId = chainPayload.entries[0]?.id;
		let selectedHookSourceId = undefined;
		let selectedPluginId = undefined;
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
		const hooksList = document.getElementById('hooksList');
		const hooksPreview = document.getElementById('hooksPreview');
		const pluginsList = document.getElementById('pluginsList');
		const pluginsPreview = document.getElementById('pluginsPreview');
		const renderChainRowIcon = (entry) => entry.iconKind === 'agent' && ${JSON.stringify(Boolean(agentLightIconHref && agentDarkIconHref))}
			? '<span class="row-icon" aria-hidden="true"><img class="chain-icon-image light" src="${agentLightIconHref ?? ''}" alt="" /><img class="chain-icon-image dark" src="${agentDarkIconHref ?? ''}" alt="" /></span>'
			: '<span class="codicon codicon-copilot row-icon" aria-hidden="true"></span>';
		const escapeHtml = (value) => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll(\"'\", '&#39;');
		const escapeRegExp = (value) => value.replace(/[.*+?^$()|[\\]{}\\\\]/g, '\\\\$&');
		const renderInlineMarkdown = (text) => escapeHtml(text || '')
			.replace(new RegExp('\\u0060([^\\u0060]+)\\u0060', 'g'), '<code>$1</code>')
			.replace(new RegExp('\\\\*\\\\*([^*]+)\\\\*\\\\*', 'g'), '<strong>$1</strong>')
			.replace(new RegExp('\\\\*([^*]+)\\\\*', 'g'), '<em>$1</em>');
		const renderMarkdown = (markdown) => {
			const source = String(markdown || '').replace(/\\r\\n/g, '\\n');
			if (!source.trim()) {
				return '';
			}
			const lines = source.split('\\n');
			const html = [];
			let inCodeBlock = false;
			let codeLines = [];
			let inList = false;
			const flushList = () => {
				if (!inList) {
					return;
				}
				html.push('</ul>');
				inList = false;
			};
			const flushCodeBlock = () => {
				if (!inCodeBlock) {
					return;
				}
				html.push('<pre><code>' + escapeHtml(codeLines.join('\\n')) + '</code></pre>');
				inCodeBlock = false;
				codeLines = [];
			};
			for (const line of lines) {
				if (line.trim().startsWith('\u0060\u0060\u0060')) {
					if (inCodeBlock) {
						flushCodeBlock();
					} else {
						flushList();
						inCodeBlock = true;
					}
					continue;
				}
				if (inCodeBlock) {
					codeLines.push(line);
					continue;
				}
				if (!line.trim()) {
					flushList();
					continue;
				}
				const headingMatch = line.match(/^(#{1,6})\\s+(.*)$/);
				if (headingMatch) {
					flushList();
					const level = headingMatch[1].length;
					html.push('<h' + level + '>' + renderInlineMarkdown(headingMatch[2]) + '</h' + level + '>');
					continue;
				}
				const listMatch = line.match(/^\\s*[-*+]\\s+(.*)$/);
				if (listMatch) {
					if (!inList) {
						html.push('<ul>');
						inList = true;
					}
					html.push('<li>' + renderInlineMarkdown(listMatch[1]) + '</li>');
					continue;
				}
				flushList();
				html.push('<p>' + renderInlineMarkdown(line).replace(/  /g, '&nbsp; ') + '</p>');
			}
			flushList();
			flushCodeBlock();
			return html.join('');
		};
		const highlightTitle = (text, query) => {
			const escaped = escapeHtml(text);
			if (!query) {
				return escaped;
			}
			return escaped.replace(new RegExp(escapeRegExp(query), 'gi'), (match) => '<mark class="search-highlight">' + match + '</mark>');
		};
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
			const addHooksFileButton = target?.closest('#addHooksFile');
			if (addHooksFileButton) {
				vscode.postMessage({ type: 'addHooksFile' });
				return;
			}
			const addInstructionFileButton = target?.closest('#addInstructionFile');
			if (addInstructionFileButton) {
				vscode.postMessage({ type: 'addInstruction' });
				return;
			}
			const removeTrustedButton = target?.closest('[data-remove-trusted]');
			if (removeTrustedButton?.dataset?.removeTrusted && removeTrustedButton?.dataset?.removeTrustedSource) {
				vscode.postMessage({ type: 'removeTrustedDirectory', targetPath: removeTrustedButton.dataset.removeTrusted, sourcePath: removeTrustedButton.dataset.removeTrustedSource });
				return;
			}
			const openPathButton = target?.closest('[data-open-path]');
			if (openPathButton?.dataset?.openPath) {
				vscode.postMessage({ type: 'openPath', targetPath: openPathButton.dataset.openPath });
				return;
			}
			const hookSourceRow = target?.closest('[data-hook-source-id]');
			if (hookSourceRow?.dataset?.hookSourceId) {
				selectedHookSourceId = hookSourceRow.dataset.hookSourceId;
				renderHooks();
				return;
			}
			const pluginRow = target?.closest('[data-plugin-id]');
			if (pluginRow?.dataset?.pluginId) {
				selectedPluginId = pluginRow.dataset.pluginId;
				renderPlugins();
				return;
			}
		});

		document.addEventListener('change', (event) => {
			const target = event.target instanceof HTMLInputElement ? event.target : null;
			if (target?.dataset?.togglePluginSpec) {
				vscode.postMessage({ type: 'togglePluginEnabled', pluginSpec: target.dataset.togglePluginSpec, enabled: target.checked });
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

		const renderChain = () => {
			const visibleEntries = chainPayload.entries || [];
			const summary = chainPayload.summary || { foundCount: 0, hasPotentialConflict: false };
			chainContext.innerHTML = chainPayload.workspaceRoot ? escapeHtml(labels.chainWorkspaceRootLabel + ': ' + chainPayload.workspaceRoot) : escapeHtml(labels.chainWorkspaceRootLabel + ': ' + labels.chainNoWorkspace);
			chainSummary.innerHTML = escapeHtml(labels.chainSummaryFound + ': ' + summary.foundCount)
				+ (summary.hasPotentialConflict ? ' <span class="chain-summary-warning">' + escapeHtml(labels.chainSummaryPotentialConflict) + '</span>' : '');
			if (visibleEntries.length === 0) {
				chainList.innerHTML = '<div class="preview-empty">' + (chainPayload.emptyStateMessage || labels.noResult) + '</div>';
				chainPreview.innerHTML = '<div class="preview-empty">' + (chainPayload.emptyStateMessage || labels.noResult) + '</div>';
				return;
			}
			if (!visibleEntries.some((entry) => entry.id === selectedChainId)) {
				selectedChainId = visibleEntries[0].id;
			}
			chainList.innerHTML = '';
			const section = document.createElement('section');
			section.className = 'chain-group';
			for (const entry of visibleEntries) {
				const card = document.createElement('button');
				card.type = 'button';
				card.className = 'chain-row' + (entry.id === selectedChainId ? ' active' : '');
				card.innerHTML = renderChainRowIcon(entry) + '<div class="chain-main"><div class="chain-row-header"><div class="chain-title">' + escapeHtml(entry.title) + '</div>' + (entry.applyTo ? '<span class="chain-list-badge">' + escapeHtml(labels.chainScopePath) + '</span>' : '') + '</div><div class="chain-subtitle">' + escapeHtml(entry.summary) + '</div></div>';
				card.addEventListener('click', () => { selectedChainId = entry.id; renderChain(); });
				section.appendChild(card);
			}
			chainList.appendChild(section);
			const selected = visibleEntries.find((entry) => entry.id === selectedChainId) || visibleEntries[0];
			chainPreview.innerHTML = '<section class="chain-detail-card"><div class="chain-main"><div class="chain-title">' + escapeHtml(selected.title) + '</div><div class="chain-status-meta">' + escapeHtml(selected.subtitle) + '</div></div><div class="chain-detail-grid"><div class="chain-detail-label">' + escapeHtml(labels.chainDetailClassification) + '</div><div>' + escapeHtml(selected.classification) + '</div><div class="chain-detail-label">' + escapeHtml(labels.chainDetailScope) + '</div><div>' + escapeHtml(selected.scope) + '</div><div class="chain-detail-label">' + escapeHtml(labels.chainDetailPath) + '</div><div class="chain-path">' + escapeHtml(selected.path) + '</div>' + (selected.applyTo ? '<div class="chain-detail-label">' + escapeHtml(labels.chainDetailApplyTo) + '</div><div>' + escapeHtml(selected.applyTo) + '</div>' : '') + '<div class="chain-detail-label">' + escapeHtml(labels.chainDetailExplanation) + '</div><div>' + escapeHtml(selected.explanation) + '</div></div>' + (selected.contentPreview ? '<div class="chain-preview-block"><div class="markdown-content">' + renderMarkdown(selected.contentPreview) + '</div></div>' : '') + '</section>';
		};

		const renderHooks = () => {
			const sources = hooksPayload.sources || [];
			const entries = hooksPayload.entries || [];
			const formatHookEntryCount = (count) => labels.hooksEntryCount.replace('0', String(count));
			if (sources.length === 0) {
				hooksList.innerHTML = '<div class="preview-empty">' + escapeHtml(hooksPayload.emptyStateMessage || labels.noResult) + '</div>';
				hooksPreview.innerHTML = '<div class="preview-empty">' + escapeHtml(hooksPayload.emptyStateMessage || labels.noResult) + '</div>';
				return;
			}
			if (!sources.some((source) => source.id === selectedHookSourceId)) {
				selectedHookSourceId = sources[0].id;
			}
			hooksList.innerHTML = '';
			for (const source of sources) {
				const card = document.createElement('article');
				card.className = 'hook-source-row' + (source.id === selectedHookSourceId ? ' active' : '');
				card.dataset.hookSourceId = source.id;
				card.innerHTML = '<span class="codicon codicon-symbol-event row-icon" aria-hidden="true"></span><div class="hook-source-main"><div class="hook-source-title">' + escapeHtml(source.label) + '</div><div class="hook-source-path">' + escapeHtml(source.path) + '</div><div class="hook-source-meta">' + escapeHtml(formatHookEntryCount(source.entryCount)) + '</div></div><div class="hook-source-actions"><button class="icon-button" type="button" data-open-path="' + escapeHtml(source.path) + '" title="' + escapeHtml(labels.hooksOpenSource) + '" aria-label="' + escapeHtml(labels.hooksOpenSource) + '"><span class="codicon codicon-file-text" aria-hidden="true"></span></button></div>';
				hooksList.appendChild(card);
			}
			const selectedSource = sources.find((source) => source.id === selectedHookSourceId) || sources[0];
			const selectedEntries = entries.filter((entry) => entry.sourceId === selectedSource.id);
			if (selectedEntries.length === 0) {
				hooksPreview.innerHTML = '<div class="preview-empty">' + escapeHtml(labels.hooksNoEntries) + '</div>';
				return;
			}
			hooksPreview.innerHTML = '<div class="hook-entry-list">' + selectedEntries.map((entry) =>
				'<article class="hook-entry-card"><div class="hook-entry-heading"><div class="hook-entry-heading-main"><span class="codicon codicon-symbol-event" aria-hidden="true"></span><span class="hook-entry-heading-label">' + escapeHtml(entry.event) + '</span></div></div><div class="hook-entry-detail-grid"><div class="hook-entry-detail-label">' + escapeHtml(labels.hooksSchemaLabel) + '</div><div>' + escapeHtml(entry.schemaKind) + '</div><div class="hook-entry-detail-label">' + escapeHtml(labels.hooksCommandLabel) + '</div><div>' + escapeHtml(entry.command || labels.hooksNoCommand) + '</div>' + (entry.bash ? '<div class="hook-entry-detail-label">' + escapeHtml(labels.hooksBashLabel) + '</div><div>' + escapeHtml(entry.bash) + '</div>' : '') + (entry.powershell ? '<div class="hook-entry-detail-label">' + escapeHtml(labels.hooksPowershellLabel) + '</div><div>' + escapeHtml(entry.powershell) + '</div>' : '') + (entry.prompt ? '<div class="hook-entry-detail-label">' + escapeHtml(labels.hooksPromptLabel) + '</div><div>' + escapeHtml(entry.prompt) + '</div>' : '') + '<div class="hook-entry-detail-label">' + escapeHtml(labels.hooksMatcherLabel) + '</div><div>' + escapeHtml(entry.matcher || labels.hooksMatcherNotUsed) + '</div><div class="hook-entry-detail-label">' + escapeHtml(labels.hooksTypeLabel) + '</div><div>' + escapeHtml(entry.handlerType) + '</div><div class="hook-entry-detail-label">' + escapeHtml(labels.hooksTimeoutLabel) + '</div><div>' + escapeHtml(entry.timeout ?? '') + '</div><div class="hook-entry-detail-label">' + escapeHtml(labels.hooksStatusMessageLabel) + '</div><div>' + escapeHtml(entry.statusMessage ?? '') + '</div></div></article>'
			).join('') + '</div>';
		};

		const renderPluginOverviewBlock = (itemsHtml) =>
			'<article class="hook-entry-card plugin-overview-card">' + itemsHtml + '</article>';

		const renderPluginBlock = (title, icon, itemsHtml, count, open) =>
			'<details class="hook-entry-card plugin-block"' + (open ? ' open' : '') + '><summary class="plugin-block-summary"><span class="plugin-block-summary-main"><span class="codicon codicon-' + escapeHtml(icon) + '" aria-hidden="true"></span><span class="hook-entry-heading-label">' + escapeHtml(title) + '</span></span><span class="plugin-block-summary-meta">' + escapeHtml(String(count)) + '<span class="codicon codicon-chevron-right" aria-hidden="true"></span></span></summary><div class="plugin-block-body">' + itemsHtml + '</div></details>';

		const renderTwoColumnGrid = (rows) =>
			'<div class="hook-entry-detail-grid">' + rows.map((row) => '<div class="hook-entry-detail-label">' + escapeHtml(String(row[0])) + '</div><div>' + escapeHtml(String(row[1])) + '</div>').join('') + '</div>';

		const renderPluginOverviewGrid = (plugin, rows) => {
			const localizePluginState = (value) => value === 'Enabled'
				? labels.pluginsStateEnabled
				: value === 'Disabled'
					? labels.pluginsStateDisabled
					: labels.pluginsStateUnknown;
			const stateValue = '<div class="plugin-state-value"><span>' + escapeHtml(localizePluginState(plugin.state)) + '</span><label class="switch" title="' + escapeHtml(labels.pluginsToggle) + '"><input type="checkbox" data-toggle-plugin-spec="' + escapeHtml(plugin.pluginSpec) + '" ' + (plugin.state === 'Enabled' ? 'checked' : '') + ' /><span></span></label></div>';
			return '<div class="hook-entry-detail-grid"><div class="hook-entry-detail-label">' + escapeHtml(labels.pluginsState) + '</div><div>' + stateValue + '</div>' + rows.map((row) => '<div class="hook-entry-detail-label">' + escapeHtml(String(row[0])) + '</div><div>' + escapeHtml(String(row[1])) + '</div>').join('') + '</div>';
		};

		const renderCardActionButton = (targetPath, title) =>
			targetPath
				? '<div class="hook-entry-card-action"><button class="icon-button" type="button" data-open-path="' + escapeHtml(targetPath) + '" title="' + escapeHtml(title) + '" aria-label="' + escapeHtml(title) + '"><span class="codicon codicon-file-text" aria-hidden="true"></span></button></div>'
				: '';

		const renderCardHeading = (title, openPath, icon) =>
			'<div class="hook-entry-heading"><div class="hook-entry-heading-main">' + (icon ? '<span class="codicon codicon-' + escapeHtml(icon) + '" aria-hidden="true"></span>' : '') + '<span class="hook-entry-heading-label">' + escapeHtml(title) + '</span></div>' + renderCardActionButton(openPath, labels.open) + '</div>';

		const renderPlugins = () => {
			const plugins = pluginsPayload.plugins || [];
			const localizeInstallKind = (value) => value === 'Marketplace'
				? labels.pluginsInstallKindMarketplace
				: value === 'Direct'
					? labels.pluginsInstallKindDirect
					: labels.pluginsInstallKindUnknown;
			const localizeComponentStatus = (value) => value === 'Conflict'
				? labels.pluginsComponentStatusConflict
				: value === 'Overridden'
					? labels.pluginsComponentStatusOverridden
					: labels.pluginsComponentStatusReadonly;
			const localizeDiagnosticSeverity = (value) => value === 'error'
				? labels.pluginsDiagnosticSeverityError
				: value === 'warning'
					? labels.pluginsDiagnosticSeverityWarning
					: labels.pluginsDiagnosticSeverityInfo;
			if (plugins.length === 0) {
				pluginsList.innerHTML = '<div class="preview-empty">' + escapeHtml(pluginsPayload.emptyStateMessage || labels.pluginsEmpty) + '</div>';
				pluginsPreview.innerHTML = '<div class="preview-empty">' + escapeHtml(pluginsPayload.emptyStateMessage || labels.pluginsEmpty) + '</div>';
				return;
			}
			if (!plugins.some((plugin) => plugin.id === selectedPluginId)) {
				selectedPluginId = plugins[0].id;
			}
			pluginsList.innerHTML = plugins.map((plugin) =>
				'<button type="button" class="hook-source-row' + (plugin.id === selectedPluginId ? ' active' : '') + '" data-plugin-id="' + escapeHtml(plugin.id) + '"><span class="codicon codicon-plug row-icon" aria-hidden="true"></span><div class="hook-source-main"><div class="hook-source-title">' + escapeHtml(plugin.name) + '</div><div class="hook-source-path">' + escapeHtml(plugin.description || plugin.pluginRoot) + '</div><div class="hook-source-meta">' + escapeHtml((plugin.version || localizeInstallKind(plugin.installKind)) + ' · ' + labels.pluginsAgents + ':' + plugin.agents.length + ' ' + labels.pluginsSkills + ':' + plugin.skills.length + ' ' + labels.pluginsCommands + ':' + plugin.commands.length + ' ' + labels.pluginsHooks + ':' + plugin.hooks.length + ' ' + labels.pluginsMcpServers + ':' + plugin.mcpServers.length + ' ' + labels.pluginsLspServers + ':' + plugin.lspServers.length) + '</div></div></button>'
			).join('');
			const plugin = plugins.find((entry) => entry.id === selectedPluginId) || plugins[0];
			const overviewRows = [
				[labels.pluginsDescription, plugin.description],
				[labels.pluginsInstallKind, localizeInstallKind(plugin.installKind)],
				[labels.pluginsVersion, plugin.version],
				[labels.pluginsAuthor, plugin.author],
				[labels.pluginsLicense, plugin.license],
				[labels.pluginsHomepage, plugin.homepage],
				[labels.pluginsRepository, plugin.repository],
				[labels.pluginsKeywords, plugin.keywords.join(', ')],
				[labels.pluginsCategory, plugin.category],
				[labels.pluginsTags, plugin.tags.join(', ')],
				[labels.pluginsPluginRoot, plugin.pluginRoot],
				[labels.pluginsManifestPath, plugin.manifestPath || ''],
			].filter((row) => row[1]);
			const agentItems = plugin.agents.length
				? plugin.agents.map((entry) => '<article class="hook-entry-card">' + renderCardHeading(entry.id, entry.fullPath, 'hubot') + renderTwoColumnGrid([[labels.pluginsDescription, entry.description || labels.pluginsNone], [labels.pluginsPath, entry.relativePath], [labels.pluginsStatus, localizeComponentStatus(entry.status)]]) + '</article>').join('')
				: '<div class="preview-empty">' + escapeHtml(labels.pluginsNone) + '</div>';
			const skillItems = plugin.skills.length
				? plugin.skills.map((entry) => '<article class="hook-entry-card">' + renderCardHeading(entry.name, entry.fullPath, 'agent') + renderTwoColumnGrid([[labels.pluginsDescription, entry.description || labels.pluginsNone], [labels.pluginsPath, entry.relativePath], [labels.pluginsStatus, localizeComponentStatus(entry.status)]]) + '</article>').join('')
				: '<div class="preview-empty">' + escapeHtml(labels.pluginsNone) + '</div>';
			const commandItems = plugin.commands.length
				? plugin.commands.map((entry) => '<article class="hook-entry-card">' + renderCardHeading(entry.name, entry.fullPath, 'terminal') + renderTwoColumnGrid([[labels.pluginsDescription, entry.description || labels.pluginsNone], [labels.pluginsPath, entry.relativePath], [labels.pluginsStatus, localizeComponentStatus(entry.status)]]) + '</article>').join('')
				: '<div class="preview-empty">' + escapeHtml(labels.pluginsNone) + '</div>';
			const hookItems = plugin.hooks.length
				? plugin.hooks.map((entry) => '<article class="hook-entry-card">' + renderCardHeading(entry.event, entry.sourcePath || plugin.manifestPath || plugin.pluginRoot, 'symbol-event') + renderTwoColumnGrid([[labels.pluginsCount, entry.count], [labels.pluginsSource, entry.source], [labels.pluginsStatus, localizeComponentStatus(entry.status)]]) + '</article>').join('')
				: '<div class="preview-empty">' + escapeHtml(labels.pluginsNone) + '</div>';
			const mcpItems = plugin.mcpServers.length
				? plugin.mcpServers.map((entry) => '<article class="hook-entry-card">' + renderCardHeading(entry.id, entry.sourcePath || plugin.manifestPath || plugin.pluginRoot, 'mcp') + renderTwoColumnGrid([[labels.pluginsType, entry.type], [labels.pluginsTools, entry.tools], [labels.pluginsSource, entry.source], [labels.pluginsStatus, localizeComponentStatus(entry.status)]]) + '</article>').join('')
				: '<div class="preview-empty">' + escapeHtml(labels.pluginsNone) + '</div>';
			const lspItems = plugin.lspServers.length
				? plugin.lspServers.map((entry) => '<article class="hook-entry-card">' + renderCardHeading(entry.id, entry.sourcePath || plugin.manifestPath || plugin.pluginRoot, 'server') + renderTwoColumnGrid([[labels.pluginsSource, entry.source], [labels.pluginsStatus, localizeComponentStatus(entry.status)]]) + '</article>').join('')
				: '<div class="preview-empty">' + escapeHtml(labels.pluginsNone) + '</div>';
			const diagnosticItems = plugin.diagnostics.length
				? plugin.diagnostics.map((entry) => '<article class="hook-entry-card">' + renderCardHeading(entry.message, plugin.manifestPath || plugin.pluginRoot, 'warning') + renderTwoColumnGrid([[labels.pluginsSeverity, localizeDiagnosticSeverity(entry.severity)]]) + '</article>').join('')
				: '<div class="preview-empty">' + escapeHtml(labels.pluginsNone) + '</div>';
			pluginsPreview.innerHTML = '<div class="hook-entry-list">'
				+ renderPluginOverviewBlock(renderPluginOverviewGrid(plugin, overviewRows))
				+ renderPluginBlock(labels.pluginsAgents, 'hubot', agentItems, plugin.agents.length, false)
				+ renderPluginBlock(labels.pluginsSkills, 'agent', skillItems, plugin.skills.length, false)
				+ renderPluginBlock(labels.pluginsCommands, 'terminal', commandItems, plugin.commands.length, false)
				+ renderPluginBlock(labels.pluginsHooks, 'symbol-event', hookItems, plugin.hooks.length, false)
				+ renderPluginBlock(labels.pluginsMcpServers, 'mcp', mcpItems, plugin.mcpServers.length, false)
				+ renderPluginBlock(labels.pluginsLspServers, 'server', lspItems, plugin.lspServers.length, false)
				+ renderPluginBlock(labels.pluginsDiagnostics, 'warning', diagnosticItems, plugin.diagnostics.length, false)
				+ '</div>';
		};

		const render = () => {
			searchInput.value = state.appliedQuery;
			renderList();
			renderPreview();
			renderChain();
			renderHooks();
			renderPlugins();
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
					chainPayload = message.payload || { entries: [], summary: { foundCount: 0, hasPotentialConflict: false } };
					selectedChainId = chainPayload.entries[0]?.id;
					renderChain();
				}
				if (message.tab === 'trusted') {
					loadedTabs.add('trusted');
					document.getElementById('trustedContent').innerHTML = message.html;
				}
				if (message.tab === 'hooks') {
					loadedTabs.add('hooks');
					hooksPayload = message.payload || { sources: [], entries: [], emptyStateMessage: labels.noResult };
					selectedHookSourceId = hooksPayload.sources[0]?.id;
					renderHooks();
				}
				if (message.tab === 'plugins') {
					loadedTabs.add('plugins');
					pluginsPayload = message.payload || { plugins: [], emptyStateMessage: labels.pluginsEmpty };
					selectedPluginId = pluginsPayload.plugins[0]?.id;
					renderPlugins();
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
		...([...
			CODICON_RESOURCE_ROOTS,
			...IMAGE_RESOURCE_ROOTS,
		].length > 0
			? { localResourceRoots: [...CODICON_RESOURCE_ROOTS, ...IMAGE_RESOURCE_ROOTS] }
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
		if (incoming.type === 'addHooksFile') {
			void this.addHooksFile();
			return;
		}
		if (incoming.type === 'addInstruction') {
			void this.addInstruction();
			return;
		}
		if (
			incoming.type === 'removeTrustedDirectory' &&
			typeof incoming.targetPath === 'string' &&
			typeof incoming.sourcePath === 'string'
		) {
			void this.removeTrustedDirectory(incoming.sourcePath, incoming.targetPath);
			return;
		}
		if (
			incoming.type === 'togglePluginEnabled' &&
			typeof incoming.pluginSpec === 'string' &&
			typeof incoming.enabled === 'boolean'
		) {
			void this.togglePluginEnabled(incoming.pluginSpec, incoming.enabled);
			return;
		}
		if (incoming.type === 'openPath' && typeof incoming.targetPath === 'string') {
			void this.openPath(incoming.targetPath);
			return;
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
		addTrustedDirectory(path.join(resolveCopilotPaths().copilotDir, 'settings.json'), targetPath);
		vscode.window.showInformationMessage(messages.mcpToggleUpdated);
		this.refreshTab('trusted');
	}

	private async addHooksFile(): Promise<void> {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceRoot) {
			vscode.window.showInformationMessage(messages.chainNoWorkspace);
			return;
		}
		const fileName = await this.promptHookFileName();
		if (!fileName) {
			return;
		}
		const hooksDir = path.join(workspaceRoot, '.github', 'hooks');
		const targetPath = path.join(hooksDir, `${fileName}.json`);
		if (await fileExists(targetPath)) {
			vscode.window.showErrorMessage(messages.hooksDuplicateFileError);
			return;
		}
		try {
			await vscode.workspace.fs.createDirectory(vscode.Uri.file(hooksDir));
			await vscode.workspace.fs.writeFile(
				vscode.Uri.file(targetPath),
				Buffer.from('{\n  "hooks": {\n  }\n}\n', 'utf8'),
			);
			await this.openPath(targetPath);
			this.refreshTab('hooks');
		} catch (error) {
			vscode.window.showErrorMessage(
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	private async addInstruction(): Promise<void> {
		const selection = await vscode.window.showQuickPick(
			[
				{
					label: `${messages.chainClassificationUser} (~/.copilot/)`,
					value: 'user' as const,
				},
				{
					label: `${messages.chainClassificationWorkspace} (.github/)`,
					value: 'workspace' as const,
				},
				{
					label: `${messages.chainClassificationPath} (.github/instructions/)`,
					value: 'path' as const,
				},
			],
			{ placeHolder: messages.chainAddInstructionTypePlaceholder },
		);
		if (!selection) {
			return;
		}
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if ((selection.value === 'workspace' || selection.value === 'path') && !workspaceRoot) {
			vscode.window.showInformationMessage(messages.chainNoWorkspace);
			return;
		}
		if (selection.value === 'path') {
			await this.addPathInstruction(workspaceRoot as string);
			return;
		}
		const targetPath = selection.value === 'user'
			? path.join(resolveCopilotPaths().copilotDir, 'copilot-instructions.md')
			: path.join(workspaceRoot as string, '.github', 'copilot-instructions.md');
		const createdPath = createInstructionFile(targetPath, selection.value);
		if (!createdPath) {
			vscode.window.showErrorMessage(messages.chainInstructionAlreadyExists);
			return;
		}
		await this.openPath(createdPath);
		this.refreshTab('chain');
	}

	private async addPathInstruction(workspaceRoot: string): Promise<void> {
		const folderInput = await promptTextInputWithQuickPick({
			title: messages.chainPathInstructionAddFolder,
			placeholder: messages.file.inputFolderName,
			ignoreFocusOut: true,
			resolvePreviewValue: (value) => sanitizeName(value.trim()),
			formatLabel: (value) => messages.file.createFolderPreview(value),
			description: '.github/instructions',
		});
		const folderName = sanitizeName((folderInput ?? '').trim());
		if (!folderInput) {
			return;
		}
		if (!folderName) {
			vscode.window.showErrorMessage(messages.file.invalidName);
			return;
		}
		const fileStem = await this.promptPathInstructionFileName(folderName);
		if (fileStem === undefined) {
			return;
		}
		const normalizedFileStem = sanitizeName(fileStem.trim() || folderName);
		if (!normalizedFileStem) {
			vscode.window.showErrorMessage(messages.file.invalidName);
			return;
		}
		const targetPath = path.join(
			workspaceRoot,
			'.github',
			'instructions',
			folderName,
			`${normalizedFileStem}.instructions.md`,
		);
		const createdPath = createInstructionFile(targetPath, 'path');
		if (!createdPath) {
			vscode.window.showErrorMessage(messages.chainInstructionAlreadyExists);
			return;
		}
		await this.openPath(createdPath);
		this.refreshTab('chain');
	}

	private async promptPathInstructionFileName(folderName: string): Promise<string | undefined> {
		return promptTextInputWithQuickPick({
			title: messages.chainPathInstructionAddFile,
			placeholder: messages.chainPathInstructionFilePrompt,
			initialValue: folderName,
			ignoreFocusOut: true,
			resolvePreviewValue: (value) =>
				`${sanitizeName(value.trim() || folderName)}.instructions.md`,
			formatLabel: (value) => messages.chainPathInstructionPreview(value),
			description: '.github/instructions',
		});
	}

	private async removeTrustedDirectory(sourcePath: string, targetPath: string): Promise<void> {
		const choice = await vscode.window.showWarningMessage(
			messages.trustedDirectoryDeleteConfirm(targetPath),
			{ modal: true },
			messages.dialogOk,
		);
		if (choice !== messages.dialogOk) {
			return;
		}
		removeTrustedDirectory(sourcePath, targetPath);
		vscode.window.showInformationMessage(messages.mcpToggleUpdated);
		this.refreshTab('trusted');
	}

	private async togglePluginEnabled(pluginSpec: string, enabled: boolean): Promise<void> {
		setPluginEnabled(resolveCopilotPaths().configPath, pluginSpec, enabled);
		await vscode.window.showInformationMessage(messages.pluginToggleUpdated);
		this.refreshTab('plugins');
	}

	private async openPath(targetPath: string): Promise<void> {
		await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetPath));
	}

	private async promptHookFileName(): Promise<string | undefined> {
		return promptTextInputWithQuickPick({
			title: messages.hooksAddFile,
			placeholder: messages.hooksFileNamePlaceholder,
			ignoreFocusOut: true,
			resolvePreviewValue: (value) => sanitizeHookFileName(value),
			resolveValue: (_rawValue, previewValue) => previewValue,
			formatLabel: (value) => `$(add) ${value}.json`,
			description: '.github/hooks',
		});
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
				payload: buildHooksPayload(),
			});
			return;
		}
		if (tab === 'plugins') {
			void this.panel.webview.postMessage({
				type: 'tabContent',
				tab,
				payload: buildPluginsPayload(),
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

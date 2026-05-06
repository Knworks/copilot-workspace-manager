import * as vscode from 'vscode';
import { messages } from '../i18n';
import {
	AgentManagerRecord,
	listAgentManagerRecords,
	resolveAgentManagerPaths,
	setAgentFrontmatterToggle,
} from './agentManagerService';
import {
	CODICON_RESOURCE_ROOTS,
	getCodiconCssHref,
	getCodiconIconPath,
	getWebviewFontFamily,
} from './webviewAssets';

const AGENT_MANAGER_VIEW_TYPE = 'copilot-workspace-manager.agentManager';

type InboundMessage =
	| { type: 'ready' }
	| { type: 'selectAgent'; agentId: string }
	| { type: 'search'; query: string }
	| { type: 'refresh' }
	| { type: 'openAgent'; agentPath: string }
	| {
			type: 'toggleAgentSetting';
			agentPath: string;
			setting: 'user-invocable' | 'disable-model-invocation';
			enabled: boolean;
	  };

type AgentPanelState = {
	query: string;
	records: AgentManagerRecord[];
	selectedAgentId?: string;
};

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
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

function filterRecords(records: AgentManagerRecord[], query: string): AgentManagerRecord[] {
	const normalized = query.trim().toLocaleLowerCase();
	if (!normalized) {
		return records;
	}
	return records.filter((record) =>
		[
			record.name,
			record.description,
			record.model,
			record.tools,
			record.mcpServers,
			record.agentPath,
			record.previewContent,
		].some((value) => value.toLocaleLowerCase().includes(normalized)),
	);
}

function toViewModel(state: AgentPanelState): {
	query: string;
	records: AgentManagerRecord[];
	selected?: AgentManagerRecord;
} {
	const records = filterRecords(state.records, state.query);
	const selected =
		records.find((record) => record.id === state.selectedAgentId) ?? records[0];
	return {
		query: state.query,
		records,
		selected,
	};
}

function buildHtml(webview: vscode.Webview): string {
	const nonce = createNonce();
	const codiconCssHref = getCodiconCssHref(webview);
	const fontFamily = getWebviewFontFamily();
	const labels = JSON.stringify({
		noResult: messages.agentManagerNoResult,
		open: messages.agentManagerOpen,
		model: messages.agentManagerModelLabel,
		tools: messages.agentManagerToolsLabel,
		mcpServers: messages.agentManagerMcpServersLabel,
		userInvocable: messages.agentManagerUserInvocableLabel,
		disableModelInvocation: messages.agentManagerDisableModelInvocationLabel,
			previewEmpty: messages.agentManagerPreviewEmpty,
		clear: messages.historyClear,
		searchPlaceholder: messages.agentManagerSearchPlaceholder,
	});
	const csp = [
		"default-src 'none'",
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
	<title>${escapeHtml(messages.agentManagerTitle)}</title>
	<style>
		body { margin: 0; font-family: ${fontFamily}; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
		.root { display: grid; grid-template-rows: auto 1fr; height: 100vh; }
		.toolbar { padding: 10px 12px; border-bottom: 1px solid var(--vscode-panel-border); display: flex; gap: 8px; align-items: center; }
		.toolbar input { flex: 1; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 8px; padding: 6px 8px; }
		.toolbar input:focus { outline: none; border-color: var(--vscode-focusBorder, #0e639c); box-shadow: 0 0 0 1px var(--vscode-focusBorder, #0e639c); }
		.bottom-pane { display: grid; grid-template-columns: 34% 66%; min-height: 0; }
		.left-pane { border-right: 1px solid var(--vscode-panel-border); overflow: auto; padding: 10px 8px; }
		.right-pane { overflow: auto; padding: 10px 8px; }
		.agent-list, .agent-detail { display: grid; gap: 6px; }
		.agent-row, .agent-detail-card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editorWidget-background); padding: 8px; }
		.agent-row { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; cursor: pointer; }
		.agent-row.active { border-color: var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
		.agent-row.readonly { opacity: 0.75; }
		.agent-main { display: grid; gap: 4px; min-width: 0; }
		.agent-title { font-weight: 600; }
		.agent-description, .agent-path, .location, .agent-meta-label, .agent-meta-value, .agent-toggle-label, .preview-empty { color: var(--vscode-descriptionForeground); font-size: 12px; }
		.agent-path { word-break: break-all; }
		.agent-actions { display: flex; align-items: center; gap: 10px; }
		.agent-meta-grid, .agent-detail-grid { display: grid; grid-template-columns: 220px 1fr; gap: 8px 12px; align-items: center; }
		.agent-meta-label { font-weight: 600; }
		.agent-detail-card { display: grid; gap: 10px; }
		.agent-toggle-row { display: contents; }
		.agent-toggle-row.disabled { opacity: 0.7; }
		.agent-preview-full { grid-column: 1 / -1; }
		.required-switch { display: inline-flex; align-items: center; cursor: pointer; user-select: none; }
		.required-switch input { display: none; }
		.required-switch span { display: inline-block; width: 34px; height: 18px; border-radius: 999px; background: #d85b74; position: relative; vertical-align: middle; }
		.required-switch span::after { content: ""; position: absolute; width: 14px; height: 14px; top: 2px; left: 2px; border-radius: 50%; background: #6e6e6e; transition: left 0.12s ease; }
		.required-switch input:checked + span { background: var(--vscode-testing-iconPassed); }
		.required-switch input:checked + span::after { left: 18px; }
		@media (prefers-color-scheme: dark) { .required-switch span::after { background: #ffffff; } }
		.icon-button { width: 24px; height: 24px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--vscode-panel-border); border-radius: 4px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); cursor: pointer; }
		.row-icon { font-size: 22px; color: var(--vscode-descriptionForeground); align-self: start; }
		.preview-body { padding: 10px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editor-background); overflow: auto; }
		.preview-body h1, .preview-body h2, .preview-body h3, .preview-body h4, .preview-body h5, .preview-body h6 { margin: 0 0 10px 0; }
		.preview-body p { margin: 0 0 12px 0; line-height: 1.6; }
		.preview-body ul { margin: 0 0 12px 0; padding-left: 20px; }
		.preview-body li { margin: 0 0 4px 0; }
		.preview-body pre { background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; overflow: auto; }
		.preview-body code, .preview-body pre, .preview-body pre code { font-family: inherit; }
	</style>
</head>
<body>
	<div class="root">
		<section class="toolbar">
			<input id="searchInput" type="text" placeholder="${escapeHtml(messages.agentManagerSearchPlaceholder)}" />
			<button id="clearSearch" class="icon-button" type="button" title="${escapeHtml(messages.historyClear)}" aria-label="${escapeHtml(messages.historyClear)}"><span class="codicon codicon-clear-all" aria-hidden="true"></span></button>
			<button id="refreshList" class="icon-button" type="button" title="${escapeHtml(messages.commandRefresh)}" aria-label="${escapeHtml(messages.commandRefresh)}"><span class="codicon codicon-refresh" aria-hidden="true"></span></button>
		</section>
		<section class="bottom-pane">
			<aside class="left-pane"><div id="agentList" class="agent-list"></div></aside>
			<main class="right-pane"><div id="agentDetail" class="agent-detail"></div></main>
		</section>
	</div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const labels = ${labels};
		let state = { query: '', records: [], selected: undefined };
		const searchInput = document.getElementById('searchInput');
		const agentList = document.getElementById('agentList');
		const agentDetail = document.getElementById('agentDetail');

		const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
		const renderInlineMarkdown = (text) => escapeHtml(text || '')
			.replace(/\\u0060([^\\u0060]+)\\u0060/g, '<code>$1</code>')
			.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
			.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
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
			for (const line of lines) {
				if (line.trim().startsWith('\`\`\`')) {
					flushList();
					if (inCodeBlock) {
						html.push('<pre><code>' + escapeHtml(codeLines.join('\\n')) + '</code></pre>');
						codeLines = [];
						inCodeBlock = false;
					} else {
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
				html.push('<p>' + renderInlineMarkdown(line) + '</p>');
			}
			flushList();
			if (inCodeBlock) {
				html.push('<pre><code>' + escapeHtml(codeLines.join('\\n')) + '</code></pre>');
			}
			return html.join('');
		};

		const renderList = () => {
			if (!state.records.length) {
				agentList.innerHTML = '<p class="preview-empty">' + escapeHtml(labels.noResult) + '</p>';
				return;
			}
			agentList.innerHTML = '';
			for (const record of state.records) {
				const card = document.createElement('article');
				card.className = 'agent-row' + (state.selected?.id === record.id ? ' active' : '') + (record.readonly ? ' readonly' : '');
				card.dataset.agentId = record.id;
				card.innerHTML =
					'<span class="codicon codicon-hubot row-icon" aria-hidden="true"></span>' +
					'<div class="agent-main">' +
					'<div class="agent-title">' + escapeHtml(record.name) + '</div>' +
					'<div class="agent-description">' + escapeHtml(record.description) + '</div>' +
					'<div class="agent-path" title="' + escapeHtml(record.location.label + ': ' + record.agentPath) + '">' + escapeHtml(record.agentPath) + '</div>' +
					'</div>' +
					'<div class="agent-actions">' +
					'<span class="location">' + escapeHtml(record.location.label) + '</span>' +
					(record.readonly ? '<span class="codicon codicon-lock" aria-label="Read only"></span>' : '') +
					'<button class="icon-button" type="button" data-open-path="' + escapeHtml(record.agentPath) + '" title="' + escapeHtml(labels.open) + '" aria-label="' + escapeHtml(labels.open) + '"><span class="codicon codicon-file-text" aria-hidden="true"></span></button>' +
					'</div>';
				agentList.appendChild(card);
			}
		};

		const renderDetail = () => {
			if (!state.selected) {
				agentDetail.innerHTML = '<p class="preview-empty">' + escapeHtml(labels.noResult) + '</p>';
				return;
			}
			const record = state.selected;
			agentDetail.innerHTML =
				'<article class="agent-detail-card">' +
				'<div class="agent-detail-grid">' +
				'<div class="agent-meta-label">' + escapeHtml(labels.model) + '</div><div class="agent-meta-value">' + escapeHtml(record.model) + '</div>' +
				'<div class="agent-meta-label">' + escapeHtml(labels.tools) + '</div><div class="agent-meta-value">' + escapeHtml(record.tools) + '</div>' +
				'<div class="agent-meta-label">' + escapeHtml(labels.mcpServers) + '</div><div class="agent-meta-value">' + escapeHtml(record.mcpServers) + '</div>' +
				'<label class="agent-toggle-row' + (record.readonly ? ' disabled' : '') + '"><span class="agent-toggle-label">' + escapeHtml(labels.userInvocable) + '</span><span class="required-switch"><input type="checkbox" data-agent-path="' + escapeHtml(record.agentPath) + '" data-setting="user-invocable" ' + (record.userInvocable ? 'checked' : '') + (record.readonly ? ' disabled' : '') + ' /><span></span></span></label>' +
				'<label class="agent-toggle-row' + (record.readonly ? ' disabled' : '') + '"><span class="agent-toggle-label">' + escapeHtml(labels.disableModelInvocation) + '</span><span class="required-switch"><input type="checkbox" data-agent-path="' + escapeHtml(record.agentPath) + '" data-setting="disable-model-invocation" ' + (record.disableModelInvocation ? 'checked' : '') + (record.readonly ? ' disabled' : '') + ' /><span></span></span></label>' +
				'<div class="agent-preview-full preview-body">' + (record.previewContent ? renderMarkdown(record.previewContent) : '<p class="preview-empty">' + escapeHtml(labels.previewEmpty) + '</p>') + '</div>' +
				'</div>' +
				'</article>';
		};

		const render = () => {
			searchInput.value = state.query;
			renderList();
			renderDetail();
		};

		searchInput.addEventListener('input', () => {
			vscode.postMessage({ type: 'search', query: searchInput.value });
		});
		document.getElementById('clearSearch')?.addEventListener('click', () => {
			searchInput.value = '';
			vscode.postMessage({ type: 'search', query: '' });
			searchInput.focus();
		});
		document.getElementById('refreshList')?.addEventListener('click', () => {
			vscode.postMessage({ type: 'refresh' });
		});
		document.addEventListener('change', (event) => {
			const target = event.target instanceof HTMLInputElement ? event.target : null;
			const agentPath = target?.dataset?.agentPath;
			const setting = target?.dataset?.setting;
			if (agentPath && (setting === 'user-invocable' || setting === 'disable-model-invocation')) {
				vscode.postMessage({ type: 'toggleAgentSetting', agentPath, setting, enabled: target.checked });
			}
		});
		document.addEventListener('click', (event) => {
			const target = event.target instanceof Element ? event.target : null;
			const openButton = target?.closest('[data-open-path]');
			if (openButton?.dataset?.openPath) {
				vscode.postMessage({ type: 'openAgent', agentPath: openButton.dataset.openPath });
				return;
			}
			const row = target?.closest('[data-agent-id]');
			if (row?.dataset?.agentId) {
				vscode.postMessage({ type: 'selectAgent', agentId: row.dataset.agentId });
			}
		});
		window.addEventListener('message', (event) => {
			const message = event.data;
			if (message?.type !== 'state') {
				return;
			}
			state = message.payload;
			render();
		});
		vscode.postMessage({ type: 'ready' });
	</script>
</body>
</html>`;
}

export class AgentManagerPanelManager implements vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	private records: AgentManagerRecord[] = [];
	private query = '';
	private selectedAgentId: string | undefined;

	constructor(private readonly onDidChangeAgents: () => void) {}

	show(): void {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Active);
			this.refresh();
			return;
		}
		this.records = this.readRecords();
		this.selectedAgentId = this.records[0]?.id;
		this.panel = vscode.window.createWebviewPanel(
			AGENT_MANAGER_VIEW_TYPE,
			messages.agentManagerTitle,
			{ viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				...(CODICON_RESOURCE_ROOTS.length > 0
					? { localResourceRoots: CODICON_RESOURCE_ROOTS }
					: {}),
			},
		);
		this.panel.iconPath = getCodiconIconPath('hubot');
		this.panel.onDidDispose(() => {
			this.panel = undefined;
		});
		this.panel.webview.onDidReceiveMessage((message: InboundMessage) =>
			this.handleMessage(message),
		);
		this.panel.webview.html = buildHtml(this.panel.webview);
		this.postState();
	}

	refresh(): void {
		if (!this.panel) {
			return;
		}
		this.records = this.readRecords();
		if (!this.records.some((record) => record.id === this.selectedAgentId)) {
			this.selectedAgentId = this.records[0]?.id;
		}
		this.postState();
	}

	dispose(): void {
		this.panel?.dispose();
	}

	private handleMessage(message: InboundMessage): void {
		if (message.type === 'ready') {
			this.postState();
			return;
		}
		if (message.type === 'search') {
			this.query = message.query;
			this.postState();
			return;
		}
		if (message.type === 'selectAgent') {
			this.selectedAgentId = message.agentId;
			this.postState();
			return;
		}
		if (message.type === 'refresh') {
			this.refresh();
			return;
		}
		if (message.type === 'openAgent') {
			void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(message.agentPath));
			return;
		}
		if (message.type === 'toggleAgentSetting') {
			setAgentFrontmatterToggle(message.agentPath, message.setting, message.enabled);
			this.onDidChangeAgents();
			this.refresh();
		}
	}

	private postState(): void {
		if (!this.panel) {
			return;
		}
		const payload = toViewModel({
			query: this.query,
			records: this.records,
			selectedAgentId: this.selectedAgentId,
		});
		this.selectedAgentId = payload.selected?.id;
		void this.panel.webview.postMessage({ type: 'state', payload });
	}

	private readRecords(): AgentManagerRecord[] {
		const { configPath } = resolveAgentManagerPaths();
		return listAgentManagerRecords(configPath);
	}
}

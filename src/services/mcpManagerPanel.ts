import * as vscode from 'vscode';
import { messages } from '../i18n';
import {
	deleteMcpServer,
	listMcpFormModels,
	McpFormModel,
	saveMcpServer,
} from './mcpManagerService';
import { toggleMcpServer } from './mcpService';
import { resolveCopilotPaths } from './workspaceStatus';
import {
	CODICON_RESOURCE_ROOTS,
	getCodiconCssHref,
	getCodiconIconPath,
	getWebviewFontFamily,
} from './webviewAssets';

const MCP_MANAGER_VIEW_TYPE = 'copilot-workspace-manager.mcpManager';

type InboundMessage =
	| { type: 'ready' }
	| { type: 'search'; query: string }
	| { type: 'refresh' }
	| { type: 'select'; id: string }
	| { type: 'toggle'; id: string }
	| { type: 'delete'; id: string }
	| { type: 'save'; model: McpFormModel; previousId?: string }
	| { type: 'add' }
	| { type: 'cancel' };

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function createNonce(): string {
	return Array.from({ length: 24 }, () =>
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(
			Math.floor(Math.random() * 62),
		),
	).join('');
}

function emptyModel(): McpFormModel {
	return {
		id: '',
		type: 'local',
		command: '',
		args: [],
		tools: ['*'],
		env: [],
		cwd: '',
		url: '',
		headers: [],
		timeout: undefined,
		oauthClientId: '',
		oauthPublicClient: true,
		oidc: false,
		filterMapping: undefined,
		enabled: true,
	};
}

function buildList(models: McpFormModel[], selectedId: string | undefined): string {
	return models.map((model) => `<button type="button" class="server ${model.id === selectedId ? 'active' : ''}${model.enabled ? '' : ' disabled'}" data-select="${escapeHtml(model.id)}" data-filter-text="${escapeHtml(model.id.toLocaleLowerCase())}">
		<span class="codicon codicon-mcp server-icon" aria-hidden="true"></span>
		<span class="server-name">${escapeHtml(model.id)}</span>
		<label class="switch" title="${escapeHtml(messages.mcpManagerToggle)}">
			<input type="checkbox" data-toggle="${escapeHtml(model.id)}" ${model.enabled ? 'checked' : ''} />
			<span></span>
		</label>
	</button>`).join('');
}

function buildFieldLabel(label: string, description: string): string {
	return `<span class="field-label">${escapeHtml(label)}<span class="codicon codicon-info info-icon" title="${escapeHtml(description)}" aria-label="${escapeHtml(description)}"></span></span>`;
}

function localizeValidationErrors(errors: string[]): string[] {
	return errors.map((error) => {
		switch (error) {
			case 'serverNameRequired':
				return messages.mcpValidationServerNameRequired;
			case 'serverNameDuplicate':
				return messages.mcpValidationServerNameDuplicate;
			case 'typeInvalid':
				return messages.mcpValidationTypeInvalid;
			case 'commandRequired':
				return messages.mcpValidationCommandRequired;
			case 'urlRequired':
				return messages.mcpValidationUrlRequired;
			case 'timeoutInvalid':
				return messages.mcpValidationTimeoutInvalid;
			case 'headersKeyRequired':
				return messages.mcpValidationHeadersKeyRequired;
			case 'envKeyRequired':
				return messages.mcpValidationEnvKeyRequired;
			case 'filterMappingInvalid':
				return messages.mcpValidationFilterMappingInvalid;
			default:
				return error;
		}
	});
}

function getMcpFieldDescriptions(): Record<string, string> {
	return {
		id: messages.mcpManagerDescriptionServerName,
		type: messages.mcpManagerDescriptionType,
		command: messages.mcpManagerDescriptionCommand,
		args: messages.mcpManagerDescriptionArgs,
		tools: messages.mcpManagerDescriptionTools,
		env: messages.mcpManagerDescriptionEnv,
		cwd: messages.mcpManagerDescriptionCwd,
		url: messages.mcpManagerDescriptionUrl,
		headers: messages.mcpManagerDescriptionHeaders,
		timeout: messages.mcpManagerDescriptionTimeout,
		oauthClientId: messages.mcpManagerDescriptionOAuthClientId,
		oauthPublicClient: messages.mcpManagerDescriptionOAuthPublicClient,
		oidc: messages.mcpManagerDescriptionOidc,
		filterMapping: messages.mcpManagerDescriptionFilterMapping,
	};
}

function buildHtml(
	webview: vscode.Webview,
	models: McpFormModel[],
	selectedId: string | undefined,
	query: string,
): string {
	const nonce = createNonce();
	const selected = models.find((model) => model.id === selectedId) ?? models[0] ?? emptyModel();
	const codiconCssHref = getCodiconCssHref(webview);
	const fontFamily = getWebviewFontFamily();
	const serializedModels = JSON.stringify(models);
	const serializedSelected = JSON.stringify(selected);
	const fieldDescriptions = JSON.stringify(getMcpFieldDescriptions());
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
	<title>${escapeHtml(messages.mcpManagerTitle)}</title>
	<style>
		body { margin: 0; font-family: ${fontFamily}; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
		.root { display: grid; grid-template-rows: auto 1fr; height: 100vh; min-width: 0; }
		.panes { display: grid; grid-template-columns: 40% 60%; min-height: 0; }
		.left { border-right: 1px solid var(--vscode-panel-border); display: grid; grid-template-rows: auto 1fr; min-width: 0; min-height: 0; }
		.right { padding: 10px 0; overflow: auto; min-width: 0; box-sizing: border-box; }
		.search-area { padding: 10px 12px; border-bottom: 1px solid var(--vscode-panel-border); display: flex; gap: 8px; align-items: center; }
		.search-area input { flex: 1; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 8px; padding: 6px 8px; }
		.search-area input:focus, input:focus, textarea:focus, select:focus { outline: none; border-color: var(--vscode-focusBorder, #0e639c); box-shadow: 0 0 0 1px var(--vscode-focusBorder, #0e639c); }
		.list-actions { padding: 10px 12px; border-bottom: 1px solid var(--vscode-panel-border); display: flex; justify-content: space-between; gap: 12px; align-items: center; }
		.list-actions-left, .list-actions-right { display: flex; gap: 8px; align-items: center; }
		.server-list { padding: 10px 12px; overflow: auto; }
		.server { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; width: 100%; margin-bottom: 6px; padding: 8px; background: var(--vscode-editorWidget-background); color: var(--vscode-foreground); border: 1px solid var(--vscode-panel-border); border-radius: 6px; text-align: left; cursor: pointer; }
		.server.disabled { opacity: 0.55; }
		.server.active { border-color: var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
		.server-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.server-icon { color: var(--vscode-descriptionForeground); }
		.detail-form-shell { width: 100%; padding: 0 0 0 12px; box-sizing: border-box; }
		form { display: grid; gap: 12px; width: 100%; box-sizing: border-box; }
		.section { display: grid; gap: 10px; padding: 0 12px 0 0; }
		.section-title { font-size: 12px; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.04em; }
		label { display: grid; gap: 4px; width: 100%; box-sizing: border-box; }
		.field-label { display: inline-flex; align-items: center; gap: 6px; }
		.field-label-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
		.info-icon { color: var(--vscode-descriptionForeground); }
		.list-field { display: grid; gap: 6px; }
		.list-rows { display: grid; gap: 8px; }
		.list-row, .pair-row { display: grid; gap: 8px; align-items: center; }
		.list-row { grid-template-columns: minmax(0, 1fr) auto; }
		.pair-row { grid-template-columns: minmax(120px, 0.9fr) minmax(0, 1.1fr) auto; }
		input, textarea, select { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 6px; padding: 6px 8px; }
		textarea { min-height: 70px; resize: vertical; }
		.icon-button { width: 24px; height: 24px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--vscode-panel-border); border-radius: 4px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); cursor: pointer; }
		.switch input { display: none; }
		.switch span { display: inline-block; width: 34px; height: 18px; border-radius: 999px; background: #d85b74; position: relative; vertical-align: middle; }
		.switch span::after { content: ""; position: absolute; width: 14px; height: 14px; top: 2px; left: 2px; border-radius: 50%; background: #6e6e6e; transition: left 0.12s ease; }
		.switch input:checked + span { background: var(--vscode-testing-iconPassed); }
		.switch input:checked + span::after { left: 18px; }
		@media (prefers-color-scheme: dark) {
			.switch span::after { background: #ffffff; }
		}
		.checkbox-field { display: flex; align-items: center; gap: 8px; }
		.checkbox-field input[type="checkbox"] { width: auto; }
		.toggle-field { justify-items: start; }
		.toggle-switch { display: inline-flex; align-items: center; cursor: pointer; user-select: none; }
		.toggle-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
		.toggle-switch span { display: inline-block; width: 34px; height: 18px; border-radius: 999px; background: var(--vscode-checkbox-background, var(--vscode-input-background)); border: 1px solid var(--vscode-checkbox-border, var(--vscode-panel-border)); position: relative; vertical-align: middle; box-sizing: border-box; transition: background 0.15s ease, border-color 0.15s ease; }
		.toggle-switch span::after { content: ""; position: absolute; top: 50%; left: 1px; width: 14px; height: 14px; border-radius: 50%; background: var(--vscode-button-secondaryForeground); transform: translateY(-50%); transition: transform 0.15s ease; }
		.toggle-switch input:checked + span { background: var(--vscode-button-background); border-color: var(--vscode-button-background); }
		.toggle-switch input:checked + span::after { transform: translate(16px, -50%); background: var(--vscode-button-foreground); }
		.toggle-switch input:focus-visible + span { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
	</style>
</head>
<body>
	<div class="root">
		<div class="search-area">
			<input id="search" value="${escapeHtml(query)}" placeholder="${escapeHtml(messages.mcpManagerSearchPlaceholder)}" />
			<button id="clearSearch" class="icon-button" type="button" title="${escapeHtml(messages.historyClear)}" aria-label="${escapeHtml(messages.historyClear)}"><span class="codicon codicon-clear-all" aria-hidden="true"></span></button>
			<button id="refreshList" class="icon-button" type="button" title="${escapeHtml(messages.commandRefresh)}" aria-label="${escapeHtml(messages.commandRefresh)}"><span class="codicon codicon-refresh" aria-hidden="true"></span></button>
		</div>
		<div class="panes">
			<section class="left">
				<div class="list-actions">
					<div class="list-actions-left">
						<button id="add" class="icon-button" type="button" title="${escapeHtml(messages.mcpManagerAdd)}" aria-label="${escapeHtml(messages.mcpManagerAdd)}"><span class="codicon codicon-add" aria-hidden="true"></span></button>
						<button id="delete" class="icon-button" type="button" title="${escapeHtml(messages.mcpManagerDelete)}" aria-label="${escapeHtml(messages.mcpManagerDelete)}"><span class="codicon codicon-trash" aria-hidden="true"></span></button>
					</div>
					<div class="list-actions-right">
						<button id="save" class="icon-button" type="button" title="${escapeHtml(messages.mcpManagerSave)}" aria-label="${escapeHtml(messages.mcpManagerSave)}"><span class="codicon codicon-save" aria-hidden="true"></span></button>
						<button id="cancel" class="icon-button" type="button" title="${escapeHtml(messages.mcpManagerCancel)}" aria-label="${escapeHtml(messages.mcpManagerCancel)}"><span class="codicon codicon-discard" aria-hidden="true"></span></button>
					</div>
				</div>
				<div class="server-list">${buildList(models, selected.id)}</div>
			</section>
			<section id="detailPane" class="right"></section>
		</div>
	</div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const models = ${serializedModels};
		const descriptions = ${fieldDescriptions};
		const initialModel = ${serializedSelected};
		let selectedId = ${JSON.stringify(selected.id)};
		let draftModel = cloneModel(initialModel);

		function emptyModel() {
			return {
				id: '',
				type: 'local',
				command: '',
				args: [],
				tools: ['*'],
				env: [],
				cwd: '',
				url: '',
				headers: [],
				timeout: undefined,
				oauthClientId: '',
				oauthPublicClient: true,
				oidc: false,
				filterMapping: undefined,
				enabled: true,
			};
		}

		function cloneModel(model) {
			return JSON.parse(JSON.stringify(model || emptyModel()));
		}

		function isLocalType(type) {
			return type === 'local' || type === 'stdio';
		}

		function isRemoteType(type) {
			return type === 'http' || type === 'sse';
		}

		function escapeHtml(value) {
			return String(value ?? '')
				.replaceAll('&', '&amp;')
				.replaceAll('<', '&lt;')
				.replaceAll('>', '&gt;')
				.replaceAll('"', '&quot;');
		}

		function fieldLabel(label, description) {
			return '<span class="field-label">' + escapeHtml(label) + '<span class="codicon codicon-info info-icon" title="' + escapeHtml(description) + '" aria-label="' + escapeHtml(description) + '"></span></span>';
		}

		function buildListRowsHtml(name, entries, placeholder, removeLabel) {
			const resolvedEntries = entries && entries.length > 0 ? entries : [''];
			return resolvedEntries.map((entry) =>
				'<div class="list-row">' +
				'<input name="' + name + '" value="' + escapeHtml(entry || '') + '" placeholder="' + escapeHtml(placeholder) + '" />' +
				'<button class="icon-button list-remove" type="button" title="' + escapeHtml(removeLabel) + '" aria-label="' + escapeHtml(removeLabel) + '"><span class="codicon codicon-close" aria-hidden="true"></span></button>' +
				'</div>'
			).join('');
		}

		function buildPairRowsHtml(keyName, valueName, entries, keyPlaceholder, valuePlaceholder, removeLabel) {
			const resolvedEntries = entries && entries.length > 0 ? entries : [{ key: '', value: '' }];
			return resolvedEntries.map((entry) =>
				'<div class="pair-row">' +
				'<input name="' + keyName + '" value="' + escapeHtml(entry.key || '') + '" placeholder="' + escapeHtml(keyPlaceholder) + '" />' +
				'<input name="' + valueName + '" value="' + escapeHtml(entry.value || '') + '" placeholder="' + escapeHtml(valuePlaceholder) + '" />' +
				'<button class="icon-button pair-remove" type="button" title="' + escapeHtml(removeLabel) + '" aria-label="' + escapeHtml(removeLabel) + '"><span class="codicon codicon-close" aria-hidden="true"></span></button>' +
				'</div>'
			).join('');
		}

		function buildForm(model) {
			const localSection = isLocalType(model.type)
				? '<div class="section">' +
					'<div class="section-title">${escapeHtml(messages.mcpManagerLocalSection)}</div>' +
					'<label>' + fieldLabel(${JSON.stringify(messages.mcpManagerCommandLabel)}, descriptions.command) + '<input name="command" value="' + escapeHtml(model.command) + '" /></label>' +
					'<div class="list-field">' +
						'<span class="field-label-row">' +
							fieldLabel(${JSON.stringify(messages.mcpManagerArgsLabel)}, descriptions.args) +
							'<button id="addArgRow" class="icon-button" type="button" title="${escapeHtml(messages.mcpManagerAddArg)}" aria-label="${escapeHtml(messages.mcpManagerAddArg)}"><span class="codicon codicon-add" aria-hidden="true"></span></button>' +
						'</span>' +
						'<div id="argRows" class="list-rows">' + buildListRowsHtml('argItem', model.args, ${JSON.stringify(messages.mcpManagerArgPlaceholder)}, ${JSON.stringify(messages.mcpManagerRemoveArg)}) + '</div>' +
					'</div>' +
					'<div class="list-field">' +
						'<span class="field-label-row">' +
							fieldLabel(${JSON.stringify(messages.mcpManagerEnvLabel)}, descriptions.env) +
							'<button id="addEnvRow" class="icon-button" type="button" title="${escapeHtml(messages.mcpManagerAddEnv)}" aria-label="${escapeHtml(messages.mcpManagerAddEnv)}"><span class="codicon codicon-add" aria-hidden="true"></span></button>' +
						'</span>' +
						'<div id="envRows" class="list-rows">' + buildPairRowsHtml('envKey', 'envValue', model.env, ${JSON.stringify(messages.mcpManagerEnvKeyPlaceholder)}, ${JSON.stringify(messages.mcpManagerEnvValuePlaceholder)}, ${JSON.stringify(messages.mcpManagerRemoveEnv)}) + '</div>' +
					'</div>' +
					'<label>' + fieldLabel(${JSON.stringify(messages.mcpManagerCwdLabel)}, descriptions.cwd) + '<input name="cwd" value="' + escapeHtml(model.cwd) + '" /></label>' +
				'</div>'
				: '';
			const remoteSection = isRemoteType(model.type)
				? '<div class="section">' +
					'<div class="section-title">${escapeHtml(messages.mcpManagerRemoteSection)}</div>' +
					'<label>' + fieldLabel(${JSON.stringify(messages.mcpManagerUrlLabel)}, descriptions.url) + '<input name="url" value="' + escapeHtml(model.url) + '" /></label>' +
					'<div class="list-field">' +
						'<span class="field-label-row">' +
							fieldLabel(${JSON.stringify(messages.mcpManagerHeadersLabel)}, descriptions.headers) +
							'<button id="addHeaderRow" class="icon-button" type="button" title="${escapeHtml(messages.mcpManagerAddHeader)}" aria-label="${escapeHtml(messages.mcpManagerAddHeader)}"><span class="codicon codicon-add" aria-hidden="true"></span></button>' +
						'</span>' +
						'<div id="headerRows" class="list-rows">' + buildPairRowsHtml('headerKey', 'headerValue', model.headers, ${JSON.stringify(messages.mcpManagerHeaderKeyPlaceholder)}, ${JSON.stringify(messages.mcpManagerHeaderValuePlaceholder)}, ${JSON.stringify(messages.mcpManagerRemoveHeader)}) + '</div>' +
					'</div>' +
					'<label>' + fieldLabel(${JSON.stringify(messages.mcpManagerOAuthClientIdLabel)}, descriptions.oauthClientId) + '<input name="oauthClientId" value="' + escapeHtml(model.oauthClientId) + '" /></label>' +
					'<label class="checkbox-field">' +
						'<input name="oauthPublicClient" type="checkbox" ' + (model.oauthPublicClient ? 'checked' : '') + ' />' +
						fieldLabel(${JSON.stringify(messages.mcpManagerOAuthPublicClientLabel)}, descriptions.oauthPublicClient) +
					'</label>' +
				'</div>'
				: '';
			return '<div class="detail-form-shell"><form id="form" data-previous-id="' + escapeHtml(model.id) + '" data-enabled="' + (model.enabled === false ? 'false' : 'true') + '">' +
				'<div class="section">' +
					'<label>' + fieldLabel(${JSON.stringify(messages.mcpManagerServerName)}, descriptions.id) + '<input name="id" value="' + escapeHtml(model.id) + '" /></label>' +
					'<label>' + fieldLabel(${JSON.stringify(messages.mcpManagerTypeLabel)}, descriptions.type) + '<select name="type">' +
						'<option value="local" ' + (model.type === 'local' ? 'selected' : '') + '>Local</option>' +
						'<option value="stdio" ' + (model.type === 'stdio' ? 'selected' : '') + '>STDIO</option>' +
						'<option value="http" ' + (model.type === 'http' ? 'selected' : '') + '>HTTP</option>' +
						'<option value="sse" ' + (model.type === 'sse' ? 'selected' : '') + '>SSE</option>' +
					'</select></label>' +
				'</div>' +
				localSection +
				remoteSection +
				'<div class="section">' +
					'<div class="section-title">${escapeHtml(messages.mcpManagerCommonSection)}</div>' +
					'<div class="list-field">' +
						'<span class="field-label-row">' +
							fieldLabel(${JSON.stringify(messages.mcpManagerToolsLabel)}, descriptions.tools) +
							'<button id="addToolRow" class="icon-button" type="button" title="${escapeHtml(messages.mcpManagerAddTool)}" aria-label="${escapeHtml(messages.mcpManagerAddTool)}"><span class="codicon codicon-add" aria-hidden="true"></span></button>' +
						'</span>' +
						'<div id="toolRows" class="list-rows">' + buildListRowsHtml('toolItem', model.tools, ${JSON.stringify(messages.mcpManagerToolPlaceholder)}, ${JSON.stringify(messages.mcpManagerRemoveTool)}) + '</div>' +
					'</div>' +
					'<label>' + fieldLabel(${JSON.stringify(messages.mcpManagerTimeoutLabel)}, descriptions.timeout) + '<input name="timeout" value="' + escapeHtml(model.timeout ?? '') + '" /></label>' +
					'<label class="toggle-field">' + fieldLabel(${JSON.stringify(messages.mcpManagerOidcLabel)}, descriptions.oidc) + '<span class="toggle-switch"><input name="oidc" type="checkbox" ' + (model.oidc ? 'checked' : '') + ' /><span></span></span></label>' +
					'<label>' + fieldLabel(${JSON.stringify(messages.mcpManagerFilterMappingLabel)}, descriptions.filterMapping) + '<select name="filterMapping">' +
						'<option value="" ' + (!model.filterMapping ? 'selected' : '') + '></option>' +
						'<option value="none" ' + (model.filterMapping === 'none' ? 'selected' : '') + '>none</option>' +
						'<option value="markdown" ' + (model.filterMapping === 'markdown' ? 'selected' : '') + '>markdown</option>' +
						'<option value="hidden_characters" ' + (model.filterMapping === 'hidden_characters' ? 'selected' : '') + '>hidden_characters</option>' +
					'</select></label>' +
				'</div>' +
			'</form></div>';
		}

		function collectListEntries(name) {
			return Array.from(document.querySelectorAll('input[name="' + name + '"]'))
				.map((input) => String(input.value || '').trim())
				.filter(Boolean);
		}

		function collectKeyValueEntries(keyName, valueName) {
			const keys = Array.from(document.querySelectorAll('input[name="' + keyName + '"]'));
			const values = Array.from(document.querySelectorAll('input[name="' + valueName + '"]'));
			return keys.map((keyInput, index) => ({
				key: String(keyInput.value || '').trim(),
				value: String(values[index]?.value || '').trim(),
			})).filter((entry) => entry.key.length > 0 || entry.value.length > 0);
		}

		function numberValue(form, name) {
			const value = String(new FormData(form).get(name) ?? '').trim();
			return value ? Number(value) : undefined;
		}

		function collectModelFromForm() {
			const form = document.getElementById('form');
			const data = new FormData(form);
			return {
				id: String(data.get('id') ?? '').trim(),
				type: String(data.get('type') ?? 'local'),
				command: String(data.get('command') ?? ''),
				args: collectListEntries('argItem'),
				tools: collectListEntries('toolItem'),
				env: collectKeyValueEntries('envKey', 'envValue'),
				cwd: String(data.get('cwd') ?? ''),
				url: String(data.get('url') ?? ''),
				headers: collectKeyValueEntries('headerKey', 'headerValue'),
				timeout: numberValue(form, 'timeout'),
				oauthClientId: String(data.get('oauthClientId') ?? ''),
				oauthPublicClient: data.get('oauthPublicClient') === 'on',
				oidc: data.get('oidc') === 'on',
				filterMapping: String(data.get('filterMapping') ?? '').trim() || undefined,
				enabled: form.dataset.enabled !== 'false',
			};
		}

		function applyTypeChange(model, nextType) {
			const next = cloneModel(model);
			const wasLocal = isLocalType(next.type);
			const willBeLocal = isLocalType(nextType);
			const wasRemote = isRemoteType(next.type);
			const willBeRemote = isRemoteType(nextType);
			next.type = nextType;
			if (wasLocal && willBeRemote) {
				next.command = '';
				next.args = [];
				next.env = [];
				next.cwd = '';
			}
			if (wasRemote && willBeLocal) {
				next.url = '';
				next.headers = [];
				next.oauthClientId = '';
				next.oauthPublicClient = true;
			}
			return next;
		}

		function bindRowCollection(collectionId, createRow) {
			const container = document.getElementById(collectionId);
			container?.addEventListener('click', (event) => {
				const target = event.target instanceof Element ? event.target : null;
				const removeButton = target?.closest?.('.list-remove, .pair-remove');
				if (!removeButton) {
					return;
				}
				const rows = container.querySelectorAll('.list-row, .pair-row');
				if (rows.length === 1) {
					rows[0].querySelectorAll('input').forEach((input) => {
						input.value = '';
					});
				} else {
					removeButton.closest('.list-row, .pair-row')?.remove();
				}
			});
			return container;
		}

		function createListRow(name, placeholder, removeLabel, value = '') {
			const row = document.createElement('div');
			row.className = 'list-row';
			row.innerHTML =
				'<input name="' + name + '" value="' + escapeHtml(value) + '" placeholder="' + escapeHtml(placeholder) + '" />' +
				'<button class="icon-button list-remove" type="button" title="' + escapeHtml(removeLabel) + '" aria-label="' + escapeHtml(removeLabel) + '"><span class="codicon codicon-close" aria-hidden="true"></span></button>';
			return row;
		}

		function createPairRow(keyName, valueName, keyPlaceholder, valuePlaceholder, removeLabel, key = '', value = '') {
			const row = document.createElement('div');
			row.className = 'pair-row';
			row.innerHTML =
				'<input name="' + keyName + '" value="' + escapeHtml(key) + '" placeholder="' + escapeHtml(keyPlaceholder) + '" />' +
				'<input name="' + valueName + '" value="' + escapeHtml(value) + '" placeholder="' + escapeHtml(valuePlaceholder) + '" />' +
				'<button class="icon-button pair-remove" type="button" title="' + escapeHtml(removeLabel) + '" aria-label="' + escapeHtml(removeLabel) + '"><span class="codicon codicon-close" aria-hidden="true"></span></button>';
			return row;
		}

		function bindForm() {
			const form = document.getElementById('form');
			document.getElementById('addArgRow')?.addEventListener('click', () => {
				document.getElementById('argRows')?.appendChild(
					createListRow('argItem', ${JSON.stringify(messages.mcpManagerArgPlaceholder)}, ${JSON.stringify(messages.mcpManagerRemoveArg)}),
				);
			});
			document.getElementById('addToolRow')?.addEventListener('click', () => {
				document.getElementById('toolRows')?.appendChild(
					createListRow('toolItem', ${JSON.stringify(messages.mcpManagerToolPlaceholder)}, ${JSON.stringify(messages.mcpManagerRemoveTool)}),
				);
			});
			document.getElementById('addEnvRow')?.addEventListener('click', () => {
				document.getElementById('envRows')?.appendChild(
					createPairRow('envKey', 'envValue', ${JSON.stringify(messages.mcpManagerEnvKeyPlaceholder)}, ${JSON.stringify(messages.mcpManagerEnvValuePlaceholder)}, ${JSON.stringify(messages.mcpManagerRemoveEnv)}),
				);
			});
			document.getElementById('addHeaderRow')?.addEventListener('click', () => {
				document.getElementById('headerRows')?.appendChild(
					createPairRow('headerKey', 'headerValue', ${JSON.stringify(messages.mcpManagerHeaderKeyPlaceholder)}, ${JSON.stringify(messages.mcpManagerHeaderValuePlaceholder)}, ${JSON.stringify(messages.mcpManagerRemoveHeader)}),
				);
			});
			bindRowCollection('argRows');
			bindRowCollection('toolRows');
			bindRowCollection('envRows');
			bindRowCollection('headerRows');
			form?.addEventListener('input', () => {
				draftModel = collectModelFromForm();
			});
			form?.addEventListener('change', (event) => {
				const target = event.target;
				if (target?.name === 'type') {
					draftModel = applyTypeChange(collectModelFromForm(), String(target.value));
					renderForm(draftModel);
					return;
				}
				draftModel = collectModelFromForm();
			});
			form?.addEventListener('submit', (event) => {
				event.preventDefault();
				const model = collectModelFromForm();
				vscode.postMessage({
					type: 'save',
					previousId: form.dataset.previousId || undefined,
					model,
				});
			});
		}

		function renderForm(model) {
			draftModel = cloneModel(model || emptyModel());
			document.getElementById('detailPane').innerHTML = buildForm(draftModel);
			bindForm();
		}

		function selectServer(id) {
			selectedId = id;
			document.querySelectorAll('.server').forEach((server) => {
				server.classList.toggle('active', server.dataset?.select === id);
			});
			renderForm(models.find((model) => model.id === id) || emptyModel());
		}

		document.querySelectorAll('.server').forEach((server) => {
			const model = models.find((item) => item.id === server.dataset?.select);
			server.classList.toggle('disabled', model?.enabled === false);
		});

		const searchInput = document.getElementById('search');
		const applyFilter = () => {
			const searchQuery = searchInput.value.trim().toLocaleLowerCase();
			document.querySelectorAll('.server').forEach((server) => {
				const text = server.dataset?.filterText || '';
				server.style.display = searchQuery.length > 0 && !text.includes(searchQuery) ? 'none' : '';
			});
		};
		searchInput.addEventListener('input', applyFilter);
		document.getElementById('clearSearch')?.addEventListener('click', () => {
			searchInput.value = '';
			applyFilter();
			searchInput.focus();
		});
		document.getElementById('refreshList')?.addEventListener('click', () => {
			vscode.postMessage({ type: 'refresh' });
		});
		document.getElementById('add')?.addEventListener('click', () => {
			selectedId = '';
			document.querySelectorAll('.server').forEach((server) => server.classList.remove('active'));
			renderForm(emptyModel());
			vscode.postMessage({ type: 'add' });
		});
		document.getElementById('delete')?.addEventListener('click', () => {
			const previousId = document.getElementById('form')?.dataset?.previousId;
			if (previousId) {
				vscode.postMessage({ type: 'delete', id: previousId });
			}
		});
		document.getElementById('save')?.addEventListener('click', () => {
			document.getElementById('form')?.requestSubmit();
		});
		document.getElementById('cancel')?.addEventListener('click', () => {
			vscode.postMessage({ type: 'cancel' });
		});
		document.querySelector('.server-list')?.addEventListener('click', (event) => {
			const target = event.target instanceof Element ? event.target : null;
			const toggle = target?.closest?.('[data-toggle]');
			if (toggle) {
				return;
			}
			const server = target?.closest?.('[data-select]');
			if (server?.dataset?.select !== undefined) {
				selectServer(server.dataset.select);
				vscode.postMessage({ type: 'select', id: server.dataset.select });
			}
		});
		document.addEventListener('change', (event) => {
			const target = event.target;
			if (target?.dataset?.toggle) {
				event.stopPropagation();
				const model = models.find((item) => item.id === target.dataset.toggle);
				if (model) {
					model.enabled = Boolean(target.checked);
				}
				target.closest('.server')?.classList.toggle('disabled', !target.checked);
				vscode.postMessage({ type: 'toggle', id: target.dataset.toggle });
			}
		});

		applyFilter();
		renderForm(initialModel);
		vscode.postMessage({ type: 'ready' });
	</script>
</body>
</html>`;
}

export class McpManagerPanelManager implements vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	private models: McpFormModel[] = [];
	private selectedId: string | undefined;
	private query = '';

	constructor(private readonly onDidChangeMcp: () => void) {}

	show(): void {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Active);
			this.refresh();
			return;
		}
		this.models = this.readModels();
		this.selectedId = this.models[0]?.id;
		this.panel = vscode.window.createWebviewPanel(
			MCP_MANAGER_VIEW_TYPE,
			messages.mcpManagerTitle,
			{ viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				...(CODICON_RESOURCE_ROOTS.length > 0
					? { localResourceRoots: CODICON_RESOURCE_ROOTS }
				: {}),
			},
		);
		this.panel.iconPath = getCodiconIconPath('mcp');
		this.panel.onDidDispose(() => {
			this.panel = undefined;
		});
		this.panel.webview.onDidReceiveMessage((message: InboundMessage) =>
			this.handleMessage(message),
		);
		this.refresh();
	}

	refresh(): void {
		this.models = this.readModels();
		if (!this.selectedId || !this.models.some((model) => model.id === this.selectedId)) {
			this.selectedId = this.models[0]?.id;
		}
		this.render();
	}

	dispose(): void {
		this.panel?.dispose();
	}

	private async handleMessage(message: InboundMessage): Promise<void> {
		const { mcpConfigPath, mcpDisabledConfigPath } = resolveCopilotPaths();
		if (message.type === 'ready') {
			return;
		}
		if (message.type === 'search') {
			this.query = message.query;
		} else if (message.type === 'refresh') {
			this.refresh();
			return;
		} else if (message.type === 'select') {
			this.selectedId = message.id;
		} else if (message.type === 'add') {
			this.selectedId = undefined;
			this.models = [emptyModelForPanel(), ...this.models];
		} else if (message.type === 'cancel') {
			this.refresh();
			return;
		} else if (message.type === 'toggle') {
			toggleMcpServer(mcpConfigPath, mcpDisabledConfigPath, message.id);
			this.onDidChangeMcp();
			this.refresh();
			return;
		} else if (message.type === 'delete') {
			const choice = await vscode.window.showWarningMessage(
				messages.mcpManagerDeleteConfirm(message.id),
				{ modal: true },
				messages.dialogOk,
			);
			if (choice === messages.dialogOk) {
				deleteMcpServer(mcpConfigPath, mcpDisabledConfigPath, message.id);
				this.onDidChangeMcp();
				this.refresh();
			}
			return;
		} else if (message.type === 'save') {
			const result = saveMcpServer(mcpConfigPath, mcpDisabledConfigPath, message.model, message.previousId);
			if (!result.ok) {
				vscode.window.showErrorMessage(localizeValidationErrors(result.errors).join('\n'));
			} else {
				vscode.window.showInformationMessage(messages.mcpToggleUpdated);
				this.selectedId = message.model.id;
				this.onDidChangeMcp();
				this.refresh();
			}
			return;
		}
		this.render();
	}

	private render(): void {
		if (!this.panel) {
			return;
		}
		this.panel.webview.html = buildHtml(
			this.panel.webview,
			this.models,
			this.selectedId,
			this.query,
		);
	}

	private readModels(): McpFormModel[] {
		const paths = resolveCopilotPaths();
		return listMcpFormModels(paths.mcpConfigPath, paths.mcpDisabledConfigPath);
	}
}

function emptyModelForPanel(): McpFormModel {
	return emptyModel();
}

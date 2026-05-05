import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';
import { messages } from '../i18n';
import { listTrustedDirectories } from './coreDiagnosticsService';
import { resolveCopilotPaths } from './workspaceStatus';

export type HookEventName =
	| 'SessionStart'
	| 'PreToolUse'
	| 'PermissionRequest'
	| 'PostToolUse'
	| 'UserPromptSubmit'
	| 'Stop';

export type HookSourceRecord = {
	id: string;
	layer: 'user' | 'project';
	format: 'hooks.json' | 'inline';
	path: string;
	exists: boolean;
	active: boolean;
	entryCount: number;
	warning?: string;
};

export type HookEntryRecord = {
	id: string;
	layer: 'user' | 'project';
	format: 'hooks.json' | 'inline';
	event: HookEventName;
	matcher?: string;
	handlerType: string;
	command?: string;
	timeout?: number;
	statusMessage?: string;
	active: boolean;
	supported: boolean;
	sourcePath: string;
	warning?: string;
};

export type HookDiagnosticsSnapshot = {
	hooksEnabled: boolean;
	workspaceRoot?: string;
	projectTrusted: boolean;
	sources: HookSourceRecord[];
	entries: HookEntryRecord[];
	warnings: string[];
};

type ParsedHookGroup = {
	event: HookEventName;
	matcher?: string;
	handlers: Array<{
		type: string;
		command?: string;
		timeout?: number;
		statusMessage?: string;
	}>;
};

const HOOK_EVENTS: HookEventName[] = [
	'SessionStart',
	'PreToolUse',
	'PermissionRequest',
	'PostToolUse',
	'UserPromptSubmit',
	'Stop',
];

function getWorkspaceRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function listHookDiagnostics(
	configPath: string = resolveCopilotPaths().configPath,
	homeDir: string = os.homedir(),
	workspaceRoot: string | undefined = getWorkspaceRoot(),
): HookDiagnosticsSnapshot {
	const hooksEnabled = readHooksEnabled(configPath);
	const trustedDirectories = listTrustedDirectories(configPath);
	const projectTrusted = workspaceRoot
		? trustedDirectories.some(
				(directory) => path.resolve(directory.path) === path.resolve(workspaceRoot),
			)
		: false;
	const userCopilotDir = resolveCopilotPaths(homeDir).copilotDir;

	const layers: Array<{
		layer: 'user' | 'project';
		configPath: string;
		hooksJsonPath: string;
		active: boolean;
	}> = [
		{
			layer: 'user',
			configPath: path.join(userCopilotDir, 'config.json'),
			hooksJsonPath: path.join(userCopilotDir, 'hooks.json'),
			active: hooksEnabled,
		},
	];
	if (workspaceRoot) {
		layers.push({
			layer: 'project',
			configPath: path.join(workspaceRoot, '.github', 'copilot-instructions.md'),
			hooksJsonPath: path.join(workspaceRoot, '.github', 'hooks.json'),
			active: hooksEnabled && projectTrusted,
		});
	}

	const warnings: string[] = [];
	const sources: HookSourceRecord[] = [];
	const entries: HookEntryRecord[] = [];

	for (const layer of layers) {
		const inlineGroups = parseInlineHooks(layer.configPath);
		const jsonGroups = parseHooksJson(layer.hooksJsonPath);
		if (inlineGroups.groups.length > 0 && jsonGroups.groups.length > 0) {
			warnings.push(
				messages.hooksWarningMergedSources(
					layer.layer === 'user'
						? messages.hooksLayerUser
						: messages.hooksLayerProject,
				),
			);
		}

		sources.push({
			id: `${layer.layer}:hooks.json`,
			layer: layer.layer,
			format: 'hooks.json',
			path: layer.hooksJsonPath,
			exists: fs.existsSync(layer.hooksJsonPath),
			active: layer.active,
			entryCount: countHookHandlers(jsonGroups.groups),
			warning: jsonGroups.error,
		});
		sources.push({
			id: `${layer.layer}:inline`,
			layer: layer.layer,
			format: 'inline',
			path: layer.configPath,
			exists: fs.existsSync(layer.configPath),
			active: layer.active,
			entryCount: countHookHandlers(inlineGroups.groups),
			warning: inlineGroups.error,
		});

		entries.push(
			...toHookEntries(layer.layer, 'hooks.json', layer.hooksJsonPath, layer.active, jsonGroups.groups),
			...toHookEntries(layer.layer, 'inline', layer.configPath, layer.active, inlineGroups.groups),
		);
	}

	if (!hooksEnabled) {
		warnings.unshift(messages.hooksWarningFeatureDisabled);
	}
	if (workspaceRoot && !projectTrusted) {
		warnings.push(messages.hooksWarningProjectUntrusted);
	}

	return {
		hooksEnabled,
		workspaceRoot,
		projectTrusted,
		sources,
		entries,
		warnings,
	};
}

export function createHooksJsonFile(targetPath: string): void {
	fs.mkdirSync(path.dirname(targetPath), { recursive: true });
	if (!fs.existsSync(targetPath)) {
		fs.writeFileSync(targetPath, `${JSON.stringify({ hooks: {} }, null, 2)}\n`, 'utf8');
	}
}

function readHooksEnabled(configPath: string): boolean {
	if (!fs.existsSync(configPath)) {
		return true;
	}
	try {
		const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
			features?: Record<string, unknown>;
		};
		const enabled = parsed.features?.codex_hooks;
		return typeof enabled === 'boolean' ? enabled : true;
	} catch {
		return true;
	}
}

function countHookHandlers(groups: ParsedHookGroup[]): number {
	return groups.reduce((total, group) => total + group.handlers.length, 0);
}

function toHookEntries(
	layer: 'user' | 'project',
	format: 'hooks.json' | 'inline',
	sourcePath: string,
	active: boolean,
	groups: ParsedHookGroup[],
): HookEntryRecord[] {
	return groups.flatMap((group, groupIndex) =>
		group.handlers.map((handler, handlerIndex) => ({
			id: `${layer}:${format}:${group.event}:${groupIndex}:${handlerIndex}`,
			layer,
			format,
			event: group.event,
			matcher: group.matcher,
			handlerType: handler.type,
			command: handler.command,
			timeout: handler.timeout,
			statusMessage: handler.statusMessage,
			active,
			supported: handler.type === 'command',
			sourcePath,
			warning:
				handler.type !== 'command'
					? messages.hooksWarningUnsupportedHandler
					: undefined,
		})),
	);
}

function parseHooksJson(filePath: string): {
	groups: ParsedHookGroup[];
	error?: string;
} {
	if (!fs.existsSync(filePath)) {
		return { groups: [] };
	}
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
			hooks?: Partial<Record<HookEventName, Array<{ matcher?: string; hooks?: Array<Record<string, unknown>> }>>>;
		};
		const groups: ParsedHookGroup[] = [];
		for (const event of HOOK_EVENTS) {
			for (const group of parsed.hooks?.[event] ?? []) {
				groups.push({
					event,
					matcher: typeof group.matcher === 'string' ? group.matcher : undefined,
					handlers: (group.hooks ?? []).map((handler) => ({
						type: typeof handler.type === 'string' ? handler.type : 'unknown',
						command: typeof handler.command === 'string' ? handler.command : undefined,
						timeout:
							typeof handler.timeout === 'number'
								? handler.timeout
								: typeof handler.timeout === 'string'
									? Number(handler.timeout)
									: undefined,
						statusMessage:
							typeof handler.statusMessage === 'string'
								? handler.statusMessage
								: undefined,
					})),
				});
			}
		}
		return { groups };
	} catch (error) {
		return {
			groups: [],
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function parseInlineHooks(filePath: string): {
	groups: ParsedHookGroup[];
	error?: string;
} {
	if (!fs.existsSync(filePath)) {
		return { groups: [] };
	}
	const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
	const groups: ParsedHookGroup[] = [];
	let currentGroup: ParsedHookGroup | undefined;
	let currentHandler:
		| {
				type: string;
				command?: string;
				timeout?: number;
				statusMessage?: string;
		  }
		| undefined;

	for (const line of lines) {
		const groupMatch = line.match(/^\s*\[\[hooks\.(SessionStart|PreToolUse|PermissionRequest|PostToolUse|UserPromptSubmit|Stop)\]\]\s*$/);
		if (groupMatch) {
			currentGroup = {
				event: groupMatch[1] as HookEventName,
				handlers: [],
			};
			groups.push(currentGroup);
			currentHandler = undefined;
			continue;
		}

		const handlerMatch = line.match(/^\s*\[\[hooks\.(SessionStart|PreToolUse|PermissionRequest|PostToolUse|UserPromptSubmit|Stop)\.hooks\]\]\s*$/);
		if (handlerMatch) {
			if (!currentGroup || currentGroup.event !== handlerMatch[1]) {
				currentGroup = {
					event: handlerMatch[1] as HookEventName,
					handlers: [],
				};
				groups.push(currentGroup);
			}
			currentHandler = { type: 'unknown' };
			currentGroup.handlers.push(currentHandler);
			continue;
		}

		const keyValueMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*(?:#.*)?$/);
		if (!keyValueMatch) {
			continue;
		}
		const key = keyValueMatch[1];
		const value = parseTomlScalar(keyValueMatch[2]);
		if (currentHandler) {
			if (key === 'type' && typeof value === 'string') {
				currentHandler.type = value;
			}
			if (key === 'command' && typeof value === 'string') {
				currentHandler.command = value;
			}
			if (key === 'timeout' && typeof value === 'number') {
				currentHandler.timeout = value;
			}
			if (key === 'statusMessage' && typeof value === 'string') {
				currentHandler.statusMessage = value;
			}
			continue;
		}
		if (currentGroup && key === 'matcher' && typeof value === 'string') {
			currentGroup.matcher = value;
		}
	}

	return { groups };
}

function parseTomlScalar(rawValue: string): string | number | boolean | undefined {
	const value = rawValue.trim();
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1).replace(/''/g, "'");
	}
	if (value === 'true' || value === 'false') {
		return value === 'true';
	}
	const numeric = Number(value);
	if (!Number.isNaN(numeric)) {
		return numeric;
	}
	return undefined;
}

import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';
import { listInstalledPluginsFromConfig } from './pluginConfigService';
import { resolveCopilotPaths } from './workspaceStatus';

export type HookEventName = string;

export type HookSourceKind = 'workspace' | 'plugin';

export type HookSourceRecord = {
	id: string;
	kind: HookSourceKind;
	label: 'Workspace Hooks' | 'Plugin Hooks';
	path: string;
	exists: boolean;
	entryCount: number;
};

export type HookEntryRecord = {
	id: string;
	sourceId: string;
	sourceLabel: HookSourceRecord['label'];
	sourcePath: string;
	event: HookEventName;
	matcher?: string;
	handlerType: string;
	schemaKind: 'copilot-cli' | 'flat' | 'nested';
	command?: string;
	bash?: string;
	powershell?: string;
	prompt?: string;
	timeout?: number;
	statusMessage?: string;
};

export type HookDiagnosticsSnapshot = {
	sources: HookSourceRecord[];
	entries: HookEntryRecord[];
};

type ParsedHookGroup = {
	event: HookEventName;
	matcher?: string;
	schemaKind: HookEntryRecord['schemaKind'];
	handlers: Array<{
		type: string;
		command?: string;
		bash?: string;
		powershell?: string;
		prompt?: string;
		timeout?: number;
		statusMessage?: string;
	}>;
};

function getWorkspaceRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function listHookDiagnostics(
	_configPath: string | undefined = undefined,
	homeDir: string = os.homedir(),
	workspaceRoot: string | undefined = getWorkspaceRoot(),
): HookDiagnosticsSnapshot {
	const configPath = _configPath ?? resolveCopilotPaths(homeDir).configPath;
	const sources: HookSourceRecord[] = [];
	const entries: HookEntryRecord[] = [];

	for (const sourcePath of collectWorkspaceHookPaths(workspaceRoot)) {
		const sourceId = `workspace:${sourcePath}`;
		const groups = parseHooksJson(sourcePath);
		sources.push({
			id: sourceId,
			kind: 'workspace',
			label: 'Workspace Hooks',
			path: sourcePath,
			exists: true,
			entryCount: countHookHandlers(groups.groups),
		});
		entries.push(
			...toHookEntries(sourceId, 'Workspace Hooks', sourcePath, groups.groups),
		);
	}

	for (const sourcePath of collectPluginHookPaths(configPath)) {
		const sourceId = `plugin:${sourcePath}`;
		const groups = parseHooksJson(sourcePath);
		sources.push({
			id: sourceId,
			kind: 'plugin',
			label: 'Plugin Hooks',
			path: sourcePath,
			exists: true,
			entryCount: countHookHandlers(groups.groups),
		});
		entries.push(
			...toHookEntries(sourceId, 'Plugin Hooks', sourcePath, groups.groups),
		);
	}

	return { sources, entries };
}

export function createHooksJsonFile(targetPath: string): void {
	fs.mkdirSync(path.dirname(targetPath), { recursive: true });
	if (!fs.existsSync(targetPath)) {
		fs.writeFileSync(targetPath, `${JSON.stringify({ hooks: {} }, null, 2)}\n`, 'utf8');
	}
}

function collectWorkspaceHookPaths(workspaceRoot: string | undefined): string[] {
	if (!workspaceRoot) {
		return [];
	}
	const hooksDir = path.join(workspaceRoot, '.github', 'hooks');
	if (!fs.existsSync(hooksDir) || !fs.statSync(hooksDir).isDirectory()) {
		return [];
	}
	return fs.readdirSync(hooksDir, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.toLocaleLowerCase().endsWith('.json'))
		.map((entry) => path.join(hooksDir, entry.name))
		.sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
}

function collectPluginHookPaths(configPath: string): string[] {
	const results: string[] = [];
	const visit = (currentDir: string): void => {
		if (!fs.existsSync(currentDir) || !fs.statSync(currentDir).isDirectory()) {
			return;
		}
		for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
			const fullPath = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				visit(fullPath);
				continue;
			}
			if (entry.isFile() && entry.name === 'hooks.json') {
				results.push(fullPath);
			}
		}
	};
	for (const plugin of listInstalledPluginsFromConfig(configPath)) {
		visit(plugin.pluginRoot);
	}
	return results.sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
}

function countHookHandlers(groups: ParsedHookGroup[]): number {
	return groups.reduce((total, group) => total + group.handlers.length, 0);
}

function toHookEntries(
	sourceId: string,
	sourceLabel: HookSourceRecord['label'],
	sourcePath: string,
	groups: ParsedHookGroup[],
): HookEntryRecord[] {
	return groups.flatMap((group, groupIndex) =>
		group.handlers.map((handler, handlerIndex) => ({
			id: `${sourceId}:${group.event}:${groupIndex}:${handlerIndex}`,
			sourceId,
			sourceLabel,
			sourcePath,
			event: group.event,
			matcher: group.matcher,
			handlerType: handler.type,
			schemaKind: group.schemaKind,
			command: handler.command,
			bash: handler.bash,
			powershell: handler.powershell,
			prompt: handler.prompt,
			timeout: handler.timeout,
			statusMessage: handler.statusMessage,
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
			version?: number;
			hooks?: Record<string, unknown>;
		};
		const groups: ParsedHookGroup[] = [];
		for (const [event, rawEntries] of Object.entries(parsed.hooks ?? {})) {
			if (!Array.isArray(rawEntries)) {
				continue;
			}
			for (const rawEntry of rawEntries) {
				const groupsForEntry = parseHookEntry(event, rawEntry, parsed.version);
				groups.push(...groupsForEntry);
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

function parseHookEntry(
	event: HookEventName,
	rawEntry: unknown,
	version: number | undefined,
): ParsedHookGroup[] {
	if (!rawEntry || typeof rawEntry !== 'object') {
		return [];
	}
	const entry = rawEntry as Record<string, unknown>;

	if (typeof entry.type === 'string') {
		return [
			{
				event,
				matcher: typeof entry.matcher === 'string' ? entry.matcher : undefined,
				schemaKind: version === 1 ? 'copilot-cli' : 'flat',
				handlers: [normalizeDirectHandler(entry)],
			},
		];
	}

	if (Array.isArray(entry.hooks)) {
		return [
			{
				event,
				matcher: typeof entry.matcher === 'string' ? entry.matcher : undefined,
				schemaKind: 'nested',
				handlers: entry.hooks
					.filter((handler): handler is Record<string, unknown> => !!handler && typeof handler === 'object')
					.map((handler) => normalizeNestedHandler(handler)),
			},
		];
	}

	return [];
}

function normalizeDirectHandler(entry: Record<string, unknown>): ParsedHookGroup['handlers'][number] {
	const bash = typeof entry.bash === 'string' ? entry.bash : undefined;
	const powershell = typeof entry.powershell === 'string' ? entry.powershell : undefined;
	const prompt = typeof entry.prompt === 'string' ? entry.prompt : undefined;
	return {
		type: typeof entry.type === 'string' ? entry.type : 'unknown',
		command:
			powershell
			?? bash
			?? (typeof entry.command === 'string' ? entry.command : undefined)
			?? prompt,
		bash,
		powershell,
		prompt,
		timeout: readTimeout(entry.timeoutSec ?? entry.timeout),
		statusMessage:
			typeof entry.statusMessage === 'string'
				? entry.statusMessage
				: undefined,
	};
}

function normalizeNestedHandler(handler: Record<string, unknown>): ParsedHookGroup['handlers'][number] {
	return {
		type: typeof handler.type === 'string' ? handler.type : 'unknown',
		command: typeof handler.command === 'string' ? handler.command : undefined,
		timeout: readTimeout(handler.timeout),
		statusMessage:
			typeof handler.statusMessage === 'string'
				? handler.statusMessage
				: undefined,
	};
}

function readTimeout(rawValue: unknown): number | undefined {
	if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
		return rawValue;
	}
	if (typeof rawValue === 'string') {
		const parsed = Number(rawValue);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

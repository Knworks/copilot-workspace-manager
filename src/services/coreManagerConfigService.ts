import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';
import { resolveCopilotPaths } from './workspaceStatus';

export type HookEventName =
	| 'SessionStart'
	| 'PreToolUse'
	| 'PermissionRequest'
	| 'PostToolUse'
	| 'UserPromptSubmit'
	| 'Stop';

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
	command?: string;
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
	_configPath: string = resolveCopilotPaths().configPath,
	homeDir: string = os.homedir(),
	workspaceRoot: string | undefined = getWorkspaceRoot(),
): HookDiagnosticsSnapshot {
	const { copilotDir } = resolveCopilotPaths(homeDir);
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

	for (const sourcePath of collectPluginHookPaths(path.join(copilotDir, 'installed-plugins'))) {
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

function collectPluginHookPaths(installedPluginsDir: string): string[] {
	if (!fs.existsSync(installedPluginsDir) || !fs.statSync(installedPluginsDir).isDirectory()) {
		return [];
	}
	const results: string[] = [];
	const visit = (currentDir: string): void => {
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
	visit(installedPluginsDir);
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
			command: handler.command,
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

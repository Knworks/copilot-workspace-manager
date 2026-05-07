import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';
import { readSkillMetadata } from './skillConfigService';
import { resolveCopilotPaths } from './workspaceStatus';

export type PluginInstallKind = 'Marketplace' | 'Direct' | 'Unknown';
export type PluginState = 'Enabled' | 'Unknown';
export type PluginComponentStatus = 'Readonly' | 'Conflict' | 'Overridden';
export type PluginDiagnosticSeverity = 'info' | 'warning' | 'error';

export type PluginAgentRecord = {
	id: string;
	name: string;
	description: string;
	relativePath: string;
	status: PluginComponentStatus;
};

export type PluginSkillRecord = {
	name: string;
	description: string;
	relativePath: string;
	status: PluginComponentStatus;
};

export type PluginCommandRecord = {
	name: string;
	description: string;
	relativePath: string;
	status: PluginComponentStatus;
};

export type PluginHookRecord = {
	event: string;
	count: number;
	source: string;
	status: PluginComponentStatus;
};

export type PluginMcpRecord = {
	id: string;
	type: string;
	tools: string;
	source: string;
	status: PluginComponentStatus;
};

export type PluginLspRecord = {
	id: string;
	source: string;
	status: PluginComponentStatus;
};

export type PluginDiagnosticRecord = {
	severity: PluginDiagnosticSeverity;
	message: string;
};

export type PluginRecord = {
	id: string;
	name: string;
	description: string;
	version: string;
	author: string;
	license: string;
	homepage: string;
	repository: string;
	keywords: string[];
	category: string;
	tags: string[];
	state: PluginState;
	installKind: PluginInstallKind;
	pluginRoot: string;
	manifestPath?: string;
	manifestFound: boolean;
	agents: PluginAgentRecord[];
	skills: PluginSkillRecord[];
	commands: PluginCommandRecord[];
	hooks: PluginHookRecord[];
	mcpServers: PluginMcpRecord[];
	lspServers: PluginLspRecord[];
	diagnostics: PluginDiagnosticRecord[];
};

type PluginManifestShape = {
	name?: unknown;
	description?: unknown;
	version?: unknown;
	author?: unknown;
	license?: unknown;
	homepage?: unknown;
	repository?: unknown;
	keywords?: unknown;
	category?: unknown;
	tags?: unknown;
	agents?: unknown;
	skills?: unknown;
	commands?: unknown;
	hooks?: unknown;
	mcpServers?: unknown;
	lspServers?: unknown;
};

type PluginRootCandidate = {
	pluginRoot: string;
	installKind: PluginInstallKind;
	state: PluginState;
};

type ComponentSource = {
	relativeSource: string;
	fullPath?: string;
	inlineValue?: Record<string, unknown>;
};

const PLUGIN_MANIFEST_CANDIDATES = [
	path.join('.plugin', 'plugin.json'),
	'plugin.json',
	path.join('.github', 'plugin', 'plugin.json'),
	path.join('.claude-plugin', 'plugin.json'),
];

const DEFAULT_HOOK_CANDIDATES = ['hooks.json', path.join('hooks', 'hooks.json')];
const DEFAULT_MCP_CANDIDATES = ['.mcp.json', path.join('.github', 'mcp.json')];
const DEFAULT_LSP_CANDIDATES = ['lsp.json', path.join('.github', 'lsp.json')];

function getWorkspaceRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function listPluginDiagnostics(
	homeDir: string = os.homedir(),
	workspaceRoot: string | undefined = getWorkspaceRoot(),
): PluginRecord[] {
	const { copilotDir, mcpConfigPath } = resolveCopilotPaths(homeDir);
	const pluginRoots = collectPluginRoots(copilotDir);
	const agentConflicts = collectExistingAgentIds(homeDir, workspaceRoot);
	const skillConflicts = collectExistingSkillNames(homeDir, workspaceRoot);
	const mcpConflicts = collectExistingMcpIds(mcpConfigPath, workspaceRoot);
	return pluginRoots
		.map((candidate) => readPluginRecord(candidate, agentConflicts, skillConflicts, mcpConflicts))
		.sort((left, right) =>
			left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }) ||
			left.pluginRoot.localeCompare(right.pluginRoot, undefined, { numeric: true, sensitivity: 'base' }),
		);
}

function collectPluginRoots(copilotDir: string): PluginRootCandidate[] {
	const candidates: PluginRootCandidate[] = [];
	const primaryRoot = path.join(copilotDir, 'installed-plugins');
	const fallbackRoot = path.join(copilotDir, 'state', 'installed-plugins');
	candidates.push(...scanPluginRoots(primaryRoot, false));
	candidates.push(...scanPluginRoots(fallbackRoot, true));
	return dedupePluginRoots(candidates);
}

function scanPluginRoots(rootPath: string, isFallback: boolean): PluginRootCandidate[] {
	if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
		return [];
	}
	const results: PluginRootCandidate[] = [];
	for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			continue;
		}
		const fullPath = path.join(rootPath, entry.name);
		if (entry.name === '_direct') {
			for (const child of fs.readdirSync(fullPath, { withFileTypes: true })) {
				if (!child.isDirectory()) {
					continue;
				}
				results.push({
					pluginRoot: path.join(fullPath, child.name),
					installKind: 'Direct',
					state: isFallback ? 'Unknown' : 'Enabled',
				});
			}
			continue;
		}
		if (containsManifestCandidate(fullPath)) {
			results.push({
				pluginRoot: fullPath,
				installKind: isFallback ? 'Unknown' : 'Direct',
				state: isFallback ? 'Unknown' : 'Enabled',
			});
			continue;
		}
		let addedChild = false;
		for (const child of fs.readdirSync(fullPath, { withFileTypes: true })) {
			if (!child.isDirectory()) {
				continue;
			}
			addedChild = true;
			results.push({
				pluginRoot: path.join(fullPath, child.name),
				installKind: 'Marketplace',
				state: isFallback ? 'Unknown' : 'Enabled',
			});
		}
		if (isFallback && !addedChild) {
			results.push({
				pluginRoot: fullPath,
				installKind: 'Unknown',
				state: 'Unknown',
			});
		}
	}
	return results;
}

function dedupePluginRoots(candidates: PluginRootCandidate[]): PluginRootCandidate[] {
	const seen = new Set<string>();
	return candidates.filter((candidate) => {
		const key = path.resolve(candidate.pluginRoot).toLowerCase();
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

function containsManifestCandidate(pluginRoot: string): boolean {
	return PLUGIN_MANIFEST_CANDIDATES.some((relativePath) =>
		fs.existsSync(path.join(pluginRoot, relativePath)),
	);
}

function readPluginRecord(
	candidate: PluginRootCandidate,
	agentConflicts: Set<string>,
	skillConflicts: Set<string>,
	mcpConflicts: Set<string>,
): PluginRecord {
	const diagnostics: PluginDiagnosticRecord[] = [];
	const manifestPath = resolvePluginManifestPath(candidate.pluginRoot);
	if (!manifestPath) {
		diagnostics.push({ severity: 'error', message: 'Manifest not found' });
		return buildPluginRecord(candidate, diagnostics, undefined, undefined, agentConflicts, skillConflicts, mcpConflicts);
	}
	let manifest: PluginManifestShape | undefined;
	try {
		manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PluginManifestShape;
	} catch (error) {
		diagnostics.push({
			severity: 'error',
			message: `Manifest parse error: ${error instanceof Error ? error.message : String(error)}`,
		});
		return buildPluginRecord(candidate, diagnostics, manifestPath, undefined, agentConflicts, skillConflicts, mcpConflicts);
	}
	return buildPluginRecord(candidate, diagnostics, manifestPath, manifest, agentConflicts, skillConflicts, mcpConflicts);
}

function buildPluginRecord(
	candidate: PluginRootCandidate,
	diagnostics: PluginDiagnosticRecord[],
	manifestPath: string | undefined,
	manifest: PluginManifestShape | undefined,
	agentConflicts: Set<string>,
	skillConflicts: Set<string>,
	mcpConflicts: Set<string>,
): PluginRecord {
	const name = readNonEmptyString(manifest?.name) ?? path.basename(candidate.pluginRoot);
	if (!readNonEmptyString(manifest?.name)) {
		diagnostics.push({ severity: 'warning', message: 'Missing plugin name' });
	}
	if (candidate.installKind === 'Direct') {
		diagnostics.push({ severity: 'warning', message: 'Direct plugin install detected.' });
	}
	const agents = manifest
		? readPluginAgents(candidate.pluginRoot, manifest, agentConflicts, diagnostics)
		: [];
	const skills = manifest
		? readPluginSkills(candidate.pluginRoot, manifest, skillConflicts, diagnostics)
		: [];
	const commands = manifest
		? readPluginCommands(candidate.pluginRoot, manifest, diagnostics)
		: [];
	const hooks = manifest
		? readPluginHooks(candidate.pluginRoot, manifest, diagnostics)
		: [];
	const mcpServers = manifest
		? readPluginMcpServers(candidate.pluginRoot, manifest, mcpConflicts, diagnostics)
		: [];
	const lspServers = manifest
		? readPluginLspServers(candidate.pluginRoot, manifest, diagnostics)
		: [];
	if (
		agents.length > 0 ||
		skills.length > 0 ||
		commands.length > 0 ||
		hooks.length > 0 ||
		mcpServers.length > 0 ||
		lspServers.length > 0
	) {
		diagnostics.push({ severity: 'info', message: 'Plugin components are read-only.' });
	}
	return {
		id: candidate.pluginRoot,
		name,
		description: readNonEmptyString(manifest?.description) ?? '',
		version: readNonEmptyString(manifest?.version) ?? '',
		author: readAuthor(manifest?.author),
		license: readNonEmptyString(manifest?.license) ?? '',
		homepage: readNonEmptyString(manifest?.homepage) ?? '',
		repository: readRepository(manifest?.repository),
		keywords: readStringArray(manifest?.keywords),
		category: readNonEmptyString(manifest?.category) ?? '',
		tags: readStringArray(manifest?.tags),
		state: candidate.state,
		installKind: candidate.installKind,
		pluginRoot: candidate.pluginRoot,
		manifestPath,
		manifestFound: Boolean(manifestPath),
		agents,
		skills,
		commands,
		hooks,
		mcpServers,
		lspServers,
		diagnostics: dedupeDiagnostics(diagnostics),
	};
}

function resolvePluginManifestPath(pluginRoot: string): string | undefined {
	for (const relativePath of PLUGIN_MANIFEST_CANDIDATES) {
		const fullPath = path.join(pluginRoot, relativePath);
		if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
			return fullPath;
		}
	}
	return undefined;
}

function readPluginAgents(
	pluginRoot: string,
	manifest: PluginManifestShape,
	agentConflicts: Set<string>,
	diagnostics: PluginDiagnosticRecord[],
): PluginAgentRecord[] {
	const roots = resolvePathEntries(pluginRoot, manifest.agents, ['agents'], diagnostics, 'agents');
	return roots.flatMap((rootPath) =>
		collectMarkdownFiles(rootPath, ['.agent.md', '.md']).map((agentPath) => {
			const id = path.basename(agentPath).replace(/(\.agent)?\.md$/i, '');
			const frontmatter = readMarkdownFrontmatter(agentPath);
			const conflict = agentConflicts.has(id.toLowerCase());
			if (conflict) {
				diagnostics.push({ severity: 'warning', message: `Agent conflict: ${id}` });
			}
			return {
				id,
				name: frontmatter.name || id,
				description: frontmatter.description || '',
				relativePath: toRelativePath(pluginRoot, agentPath),
				status: conflict ? 'Conflict' : 'Readonly',
			};
		}),
	);
}

function readPluginSkills(
	pluginRoot: string,
	manifest: PluginManifestShape,
	skillConflicts: Set<string>,
	diagnostics: PluginDiagnosticRecord[],
): PluginSkillRecord[] {
	const roots = resolvePathEntries(pluginRoot, manifest.skills, ['skills'], diagnostics, 'skills');
	return roots.flatMap((rootPath) =>
		collectSkillMarkdownFiles(rootPath).map((skillPath) => {
			const metadata = readSkillMetadata(skillPath);
			const skillName = metadata.name || path.basename(path.dirname(skillPath));
			const conflict = skillConflicts.has(skillName.toLowerCase());
			if (conflict) {
				diagnostics.push({ severity: 'warning', message: `Skill conflict: ${skillName}` });
			}
			return {
				name: skillName,
				description: metadata.description,
				relativePath: toRelativePath(pluginRoot, skillPath),
				status: conflict ? 'Conflict' : 'Readonly',
			};
		}),
	);
}

function readPluginCommands(
	pluginRoot: string,
	manifest: PluginManifestShape,
	diagnostics: PluginDiagnosticRecord[],
): PluginCommandRecord[] {
	const roots = resolvePathEntries(pluginRoot, manifest.commands, [], diagnostics, 'commands');
	return roots.flatMap((rootPath) =>
		collectMarkdownFiles(rootPath, ['.md']).map((commandPath) => {
			const frontmatter = readMarkdownFrontmatter(commandPath);
			return {
				name: path.basename(commandPath, '.md'),
				description: frontmatter.description || '',
				relativePath: toRelativePath(pluginRoot, commandPath),
				status: 'Readonly',
			};
		}),
	);
}

function readPluginHooks(
	pluginRoot: string,
	manifest: PluginManifestShape,
	diagnostics: PluginDiagnosticRecord[],
): PluginHookRecord[] {
	const sources = resolveObjectSource(pluginRoot, manifest.hooks, DEFAULT_HOOK_CANDIDATES, diagnostics, 'hooks');
	return sources.flatMap((source) => {
		const hookObject = source.inlineValue ?? readJsonObject(source.fullPath, diagnostics, 'hooks');
		if (!hookObject) {
			return [];
		}
		const hooksContainer = readHooksContainer(hookObject);
		return Object.entries(hooksContainer).flatMap(([event, entries]) => {
			if (!Array.isArray(entries)) {
				return [];
			}
			return [{
				event,
				count: entries.length,
				source: source.relativeSource,
				status: 'Readonly' as PluginComponentStatus,
			}];
		});
	});
}

function readPluginMcpServers(
	pluginRoot: string,
	manifest: PluginManifestShape,
	mcpConflicts: Set<string>,
	diagnostics: PluginDiagnosticRecord[],
): PluginMcpRecord[] {
	const sources = resolveObjectSource(pluginRoot, manifest.mcpServers, DEFAULT_MCP_CANDIDATES, diagnostics, 'mcpServers');
	const records: PluginMcpRecord[] = sources.flatMap((source) => {
		const configObject = source.inlineValue ?? readJsonObject(source.fullPath, diagnostics, 'mcpServers');
		if (!configObject) {
			return [];
		}
		const definitions = readMcpDefinitions(configObject);
		if (hasSecretLikeValues(definitions)) {
			diagnostics.push({ severity: 'warning', message: 'Secret-like value masked' });
		}
		return Object.entries(definitions).flatMap(([id, value]) => {
			if (!value || typeof value !== 'object' || Array.isArray(value)) {
				return [];
			}
			const type = readNonEmptyString((value as Record<string, unknown>).type)
				?? (readNonEmptyString((value as Record<string, unknown>).url) ? 'http' : 'local');
			const toolsValue = (value as Record<string, unknown>).tools;
			const overridden = mcpConflicts.has(id.toLowerCase());
			if (overridden) {
				diagnostics.push({ severity: 'warning', message: `MCP override: ${id}` });
			}
			return [{
				id,
				type,
				tools: formatTools(toolsValue),
				source: source.relativeSource,
				status: overridden ? 'Overridden' as PluginComponentStatus : 'Readonly' as PluginComponentStatus,
			}];
		});
	});
	return records.sort((left, right) => left.id.localeCompare(right.id, undefined, { sensitivity: 'base' }));
}

function readPluginLspServers(
	pluginRoot: string,
	manifest: PluginManifestShape,
	diagnostics: PluginDiagnosticRecord[],
): PluginLspRecord[] {
	const sources = resolveObjectSource(pluginRoot, manifest.lspServers, DEFAULT_LSP_CANDIDATES, diagnostics, 'lspServers');
	return sources.flatMap((source) => {
		const configObject = source.inlineValue ?? readJsonObject(source.fullPath, diagnostics, 'lspServers');
		if (!configObject) {
			return [];
		}
		const definitions = readObjectDefinitions(configObject, ['lspServers', 'servers']);
		return Object.entries(definitions).flatMap(([id, value]) =>
			value && typeof value === 'object' && !Array.isArray(value)
				? [{
					id,
					source: source.relativeSource,
					status: 'Readonly' as PluginComponentStatus,
				}]
				: [],
		);
	});
}

function resolvePathEntries(
	pluginRoot: string,
	value: unknown,
	defaultPaths: string[],
	diagnostics: PluginDiagnosticRecord[],
	fieldName: string,
): string[] {
	const configuredPaths = normalizePathValue(value);
	const relativePaths = configuredPaths.length > 0 ? configuredPaths : defaultPaths;
	return relativePaths
		.map((relativePath) => path.resolve(pluginRoot, relativePath))
		.filter((fullPath, index, paths) => paths.indexOf(fullPath) === index)
		.filter((fullPath) => {
			if (fs.existsSync(fullPath)) {
				return true;
			}
			if (configuredPaths.length > 0 || defaultPaths.length === 0) {
				diagnostics.push({
					severity: 'warning',
					message: `Component path not found: ${fieldName} -> ${toRelativePath(pluginRoot, fullPath)}`,
				});
			}
			return false;
		});
}

function resolveObjectSource(
	pluginRoot: string,
	value: unknown,
	defaultPaths: string[],
	diagnostics: PluginDiagnosticRecord[],
	fieldName: string,
): ComponentSource[] {
	if (typeof value === 'string' && value.trim()) {
		const fullPath = path.resolve(pluginRoot, value.trim());
		if (!fs.existsSync(fullPath)) {
			diagnostics.push({
				severity: 'warning',
				message: `Component path not found: ${fieldName} -> ${value.trim()}`,
			});
			return [];
		}
		return [{ relativeSource: toRelativePath(pluginRoot, fullPath), fullPath }];
	}
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return [{ relativeSource: 'plugin.json inline', inlineValue: value as Record<string, unknown> }];
	}
	return defaultPaths
		.map((relativePath): ComponentSource | undefined => {
			const fullPath = path.resolve(pluginRoot, relativePath);
			return fs.existsSync(fullPath) ? { relativeSource: relativePath, fullPath } : undefined;
		})
		.filter((source): source is ComponentSource => source !== undefined);
}

function normalizePathValue(value: unknown): string[] {
	if (typeof value === 'string' && value.trim()) {
		return [value.trim()];
	}
	if (Array.isArray(value)) {
		return value
			.filter((entry): entry is string => typeof entry === 'string')
			.map((entry) => entry.trim())
			.filter(Boolean);
	}
	return [];
}

function collectMarkdownFiles(rootPath: string, suffixes: string[]): string[] {
	if (!fs.existsSync(rootPath)) {
		return [];
	}
	if (fs.statSync(rootPath).isFile()) {
		return suffixes.some((suffix) => rootPath.toLowerCase().endsWith(suffix))
			? [rootPath]
			: [];
	}
	const results: string[] = [];
	const visit = (currentPath: string): void => {
		for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
			if (entry.name.startsWith('.')) {
				continue;
			}
			const fullPath = path.join(currentPath, entry.name);
			if (entry.isDirectory()) {
				visit(fullPath);
				continue;
			}
			if (entry.isFile() && suffixes.some((suffix) => entry.name.toLowerCase().endsWith(suffix))) {
				results.push(fullPath);
			}
		}
	};
	visit(rootPath);
	return results.sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
}

function collectSkillMarkdownFiles(rootPath: string): string[] {
	return collectMarkdownFiles(rootPath, ['skill.md']).filter((skillPath) =>
		path.basename(skillPath) === 'SKILL.md',
	);
}

function readMarkdownFrontmatter(filePath: string): Record<string, string> {
	const contents = fs.readFileSync(filePath, 'utf8');
	const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) {
		return {};
	}
	const result: Record<string, string> = {};
	for (const line of match[1].split(/\r?\n/)) {
		const item = line.match(/^([A-Za-z0-9_-]+):\s*(?:"([^"]*)"|'([^']*)'|(.+))\s*$/);
		if (!item) {
			continue;
		}
		result[item[1]] = (item[2] ?? item[3] ?? item[4] ?? '').trim();
	}
	return result;
}

function readJsonObject(
	filePath: string | undefined,
	diagnostics: PluginDiagnosticRecord[],
	fieldName: string,
): Record<string, unknown> | undefined {
	if (!filePath) {
		return undefined;
	}
	try {
		return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
	} catch (error) {
		diagnostics.push({
			severity: 'error',
			message: `${fieldName} parse error: ${error instanceof Error ? error.message : String(error)}`,
		});
		return undefined;
	}
}

function readHooksContainer(configObject: Record<string, unknown>): Record<string, unknown> {
	if (configObject.hooks && typeof configObject.hooks === 'object' && !Array.isArray(configObject.hooks)) {
		return configObject.hooks as Record<string, unknown>;
	}
	return configObject;
}

function readMcpDefinitions(configObject: Record<string, unknown>): Record<string, unknown> {
	return readObjectDefinitions(configObject, ['mcpServers', 'servers']);
}

function readObjectDefinitions(configObject: Record<string, unknown>, preferredKeys: string[]): Record<string, unknown> {
	for (const key of preferredKeys) {
		const value = configObject[key];
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			return value as Record<string, unknown>;
		}
	}
	return configObject;
}

function formatTools(value: unknown): string {
	if (Array.isArray(value)) {
		return value.map((entry) => String(entry)).join(', ') || '0';
	}
	if (typeof value === 'string' && value.trim()) {
		return value.trim();
	}
	return '*';
}

function hasSecretLikeValues(definitions: Record<string, unknown>): boolean {
	return Object.values(definitions).some((value) => {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return false;
		}
		const record = value as Record<string, unknown>;
		return containsSecretLikeObject(record.env) || containsSecretLikeObject(record.headers);
	});
}

function containsSecretLikeObject(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	return Object.values(value as Record<string, unknown>).some((item) =>
		typeof item === 'string' && item.trim().length > 0 && !item.includes('${'),
	);
}

function collectExistingAgentIds(homeDir: string, workspaceRoot: string | undefined): Set<string> {
	const results = new Set<string>();
	if (workspaceRoot) {
		for (const rootPath of [path.join(workspaceRoot, '.github', 'agents'), path.join(workspaceRoot, '.claude', 'agents')]) {
			for (const agentPath of collectMarkdownFiles(rootPath, ['.agent.md', '.md'])) {
				results.add(path.basename(agentPath).replace(/(\.agent)?\.md$/i, '').toLowerCase());
			}
		}
	}
	const { copilotDir } = resolveCopilotPaths(homeDir);
	for (const rootPath of [path.join(copilotDir, 'agents')]) {
		for (const agentPath of collectMarkdownFiles(rootPath, ['.agent.md', '.md'])) {
			results.add(path.basename(agentPath).replace(/(\.agent)?\.md$/i, '').toLowerCase());
		}
	}
	return results;
}

function collectExistingSkillNames(homeDir: string, workspaceRoot: string | undefined): Set<string> {
	const results = new Set<string>();
	const roots: string[] = [];
	if (workspaceRoot) {
		roots.push(
			path.join(workspaceRoot, '.github', 'skills'),
			path.join(workspaceRoot, '.agents', 'skills'),
			path.join(workspaceRoot, '.claude', 'skills'),
		);
	}
	const { copilotDir } = resolveCopilotPaths(homeDir);
	roots.push(path.join(copilotDir, 'skills'), path.join(homeDir, '.agents', 'skills'), path.join(homeDir, '.claude', 'skills'));
	for (const rootPath of roots) {
		for (const skillPath of collectSkillMarkdownFiles(rootPath)) {
			const metadata = readSkillMetadata(skillPath);
			results.add((metadata.name || path.basename(path.dirname(skillPath))).toLowerCase());
		}
	}
	return results;
}

function collectExistingMcpIds(mcpConfigPath: string, workspaceRoot: string | undefined): Set<string> {
	const results = new Set<string>();
	for (const configPath of [mcpConfigPath, workspaceRoot ? path.join(workspaceRoot, '.github', 'mcp.json') : undefined].filter(Boolean) as string[]) {
		if (!fs.existsSync(configPath)) {
			continue;
		}
		try {
			const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
			const definitions = readMcpDefinitions(parsed);
			for (const id of Object.keys(definitions)) {
				results.add(id.toLowerCase());
			}
		} catch {
			// ignore
		}
	}
	return results;
}

function readNonEmptyString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
		.map((entry) => entry.trim());
}

function readAuthor(value: unknown): string {
	if (typeof value === 'string') {
		return value.trim();
	}
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return readNonEmptyString((value as Record<string, unknown>).name) ?? '';
	}
	return '';
}

function readRepository(value: unknown): string {
	if (typeof value === 'string') {
		return value.trim();
	}
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return readNonEmptyString((value as Record<string, unknown>).url)
			?? readNonEmptyString((value as Record<string, unknown>).repository)
			?? '';
	}
	return '';
}

function toRelativePath(rootPath: string, targetPath: string): string {
	const relativePath = path.relative(rootPath, targetPath);
	return relativePath || path.basename(targetPath);
}

function dedupeDiagnostics(diagnostics: PluginDiagnosticRecord[]): PluginDiagnosticRecord[] {
	const seen = new Set<string>();
	return diagnostics.filter((entry) => {
		const key = `${entry.severity}:${entry.message}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

import fs from 'fs';
import path from 'path';
import { resolveCopilotPaths } from './workspaceStatus';

export type ResolvedPluginInstallKind = 'Marketplace' | 'Direct' | 'Unknown';

export type InstalledPluginDescriptor = {
	pluginRoot: string;
	pluginSpec: string;
	installKind: ResolvedPluginInstallKind;
	enabled: boolean;
	manifestPath?: string;
};

type RecordLike = Record<string, unknown>;

type InstalledPluginShape = {
	name?: unknown;
	marketplace?: unknown;
	cache_path?: unknown;
	enabled?: unknown;
	source?: unknown;
};

const PLUGIN_MANIFEST_CANDIDATES = [
	path.join('.plugin', 'plugin.json'),
	'plugin.json',
	path.join('.github', 'plugin', 'plugin.json'),
	path.join('.claude-plugin', 'plugin.json'),
];

export function listInstalledPluginsFromConfig(configPath: string): InstalledPluginDescriptor[] {
	const settingsPath = path.join(path.dirname(configPath), 'settings.json');
	const config = readJsonObject(configPath);
	const settings = readJsonObject(settingsPath);
	const installedPlugins = Array.isArray(config.installedPlugins) ? config.installedPlugins : [];
	const enabledPlugins = isRecordLike(settings.enabledPlugins) ? settings.enabledPlugins : {};
	const seenRoots = new Set<string>();

	return installedPlugins
		.filter((entry): entry is InstalledPluginShape => isRecordLike(entry))
		.map((entry): InstalledPluginDescriptor | undefined => {
			const pluginRoot = readNonEmptyString(entry.cache_path);
			if (!pluginRoot) {
				return undefined;
			}
			const resolvedRoot = path.resolve(pluginRoot);
			const pluginSpec = resolvePluginSpec(entry, resolvedRoot);
			const overrideEnabled = readBoolean(enabledPlugins[pluginSpec]);
			const installedEnabled = readBoolean(entry.enabled);
			const descriptor: InstalledPluginDescriptor = {
				pluginRoot: resolvedRoot,
				pluginSpec,
				installKind: resolveInstallKind(entry),
				enabled: overrideEnabled ?? installedEnabled ?? false,
				manifestPath: resolvePluginManifestPath(resolvedRoot),
			};
			return descriptor;
		})
		.filter((entry): entry is InstalledPluginDescriptor => Boolean(entry))
		.filter((entry) => {
			const key = entry.pluginRoot.toLowerCase();
			if (seenRoots.has(key)) {
				return false;
			}
			seenRoots.add(key);
			return true;
		});
}

export function setPluginEnabled(configPath: string, pluginSpec: string, enabled: boolean): void {
	const settingsPath = path.join(path.dirname(configPath), 'settings.json');
	const settings = readJsonObject(settingsPath);
	const enabledPlugins = isRecordLike(settings.enabledPlugins) ? { ...settings.enabledPlugins } : {};
	enabledPlugins[pluginSpec] = enabled;
	settings.enabledPlugins = Object.fromEntries(
		Object.entries(enabledPlugins).sort((left, right) =>
			left[0].localeCompare(right[0], undefined, { numeric: true, sensitivity: 'base' }),
		),
	);
	writeJsonObject(settingsPath, settings);
}

export function listInstalledPlugins(homeDir?: string): InstalledPluginDescriptor[] {
	return listInstalledPluginsFromConfig(resolveCopilotPaths(homeDir).configPath);
}

export function resolvePluginManifestPath(pluginRoot: string): string | undefined {
	for (const relativePath of PLUGIN_MANIFEST_CANDIDATES) {
		const fullPath = path.join(pluginRoot, relativePath);
		if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
			return fullPath;
		}
	}
	return undefined;
}

function resolvePluginSpec(entry: InstalledPluginShape, pluginRoot: string): string {
	const source = isRecordLike(entry.source) ? entry.source : undefined;
	const sourcePath = readNonEmptyString(source?.path);
	if (sourcePath) {
		return sourcePath;
	}
	const repository =
		readNonEmptyString(source?.repository) ??
		readNonEmptyString(source?.repo) ??
		readNonEmptyString(source?.github);
	const subdirectory =
		readNonEmptyString(source?.subdirectory) ??
		readNonEmptyString(source?.directory);
	if (repository && subdirectory) {
		return `${repository}:${subdirectory}`;
	}
	if (repository) {
		return repository;
	}
	const gitUrl =
		readNonEmptyString(source?.git) ??
		readNonEmptyString(source?.gitUrl) ??
		readNonEmptyString(source?.url);
	if (gitUrl) {
		return gitUrl;
	}
	const name = readNonEmptyString(entry.name);
	const marketplace =
		readNonEmptyString(entry.marketplace) ??
		readNonEmptyString(source?.marketplace);
	if (name && marketplace) {
		return `${name}@${marketplace}`;
	}
	return name ?? pluginRoot;
}

function resolveInstallKind(entry: InstalledPluginShape): ResolvedPluginInstallKind {
	const source = isRecordLike(entry.source) ? entry.source : undefined;
	if (readNonEmptyString(entry.marketplace) || readNonEmptyString(source?.marketplace)) {
		return 'Marketplace';
	}
	if (
		readNonEmptyString(source?.path) ||
		readNonEmptyString(source?.repository) ||
		readNonEmptyString(source?.repo) ||
		readNonEmptyString(source?.github) ||
		readNonEmptyString(source?.git) ||
		readNonEmptyString(source?.gitUrl) ||
		readNonEmptyString(source?.url)
	) {
		return 'Direct';
	}
	return 'Unknown';
}

function readJsonObject(filePath: string): RecordLike {
	if (!fs.existsSync(filePath)) {
		return {};
	}
	try {
		const parsed = JSON.parse(stripJsonComments(fs.readFileSync(filePath, 'utf8'))) as unknown;
		return isRecordLike(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function writeJsonObject(filePath: string, value: RecordLike): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function isRecordLike(value: unknown): value is RecordLike {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

function stripJsonComments(contents: string): string {
	return contents
		.replace(/^\uFEFF/, '')
		.split(/\r?\n/)
		.filter((line) => !line.trimStart().startsWith('//'))
		.join('\n');
}

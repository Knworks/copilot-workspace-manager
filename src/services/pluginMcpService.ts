import fs from 'fs';
import path from 'path';
import { listInstalledPluginsFromConfig } from './pluginConfigService';

export type PluginMcpDefinition = {
	id: string;
	entryId: string;
	pluginName: string;
	pluginRoot: string;
	value: Record<string, unknown>;
};

type PluginManifestShape = {
	name?: unknown;
	mcpServers?: unknown;
};

const DEFAULT_PLUGIN_MCP_CANDIDATES = [
	'.mcp.json',
	'mcp.json',
	'mcp-config.json',
];

export function listPluginMcpDefinitions(configPath: string): PluginMcpDefinition[] {
	return listInstalledPluginsFromConfig(configPath).flatMap((plugin) =>
		plugin.manifestPath ? readPluginMcpDefinitions(plugin.pluginRoot, plugin.manifestPath) : [],
	);
}

function readPluginMcpDefinitions(pluginRoot: string, manifestPath: string): PluginMcpDefinition[] {
	try {
		const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PluginManifestShape;
		const pluginName = typeof parsed.name === 'string' && parsed.name.trim()
			? parsed.name.trim()
			: path.basename(pluginRoot);

		if (typeof parsed.mcpServers === 'string' && parsed.mcpServers.trim()) {
			return readDefinitionsFromConfigFile(pluginRoot, pluginName, path.resolve(pluginRoot, parsed.mcpServers.trim()));
		}
		if (parsed.mcpServers && typeof parsed.mcpServers === 'object' && !Array.isArray(parsed.mcpServers)) {
			return toPluginDefinitions(
				pluginRoot,
				pluginName,
				parsed.mcpServers as Record<string, unknown>,
			);
		}

		const candidates = DEFAULT_PLUGIN_MCP_CANDIDATES
			.map((relativePath) => path.resolve(pluginRoot, relativePath))
			.filter((candidatePath, index, paths) => paths.indexOf(candidatePath) === index)
			.filter((candidatePath) => fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile());
		return candidates.flatMap((candidatePath) =>
			readDefinitionsFromConfigFile(pluginRoot, pluginName, candidatePath),
		);
	} catch {
		return [];
	}
}

function readDefinitionsFromConfigFile(
	pluginRoot: string,
	pluginName: string,
	configPath: string,
): PluginMcpDefinition[] {
	try {
		const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
			mcpServers?: Record<string, unknown>;
			servers?: Record<string, unknown>;
		};
		const definitions = parsed.mcpServers ?? parsed.servers ?? parsed;
		if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) {
			return [];
		}
		return toPluginDefinitions(pluginRoot, pluginName, definitions as Record<string, unknown>);
	} catch {
		return [];
	}
}

function toPluginDefinitions(
	pluginRoot: string,
	pluginName: string,
	definitions: Record<string, unknown>,
): PluginMcpDefinition[] {
	return Object.entries(definitions)
		.filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
		.map(([id, value]) => ({
			id,
			entryId: `plugin:${pluginRoot}:${id}`,
			pluginName,
			pluginRoot,
			value: value as Record<string, unknown>,
		}));
}

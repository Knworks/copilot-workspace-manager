import fs from 'fs';
import path from 'path';
import { listPluginMcpDefinitions } from './pluginMcpService';

export type McpServer = {
	id: string;
	entryId?: string;
	enabled: boolean;
	headerLineIndex: number;
	configPath?: string;
	readOnly?: boolean;
	sourceLabel?: string;
};

type McpConfigShape = {
	servers?: Record<string, unknown>;
	mcpServers?: Record<string, unknown>;
};

/**
 * Reads enabled and disabled MCP entries from their respective config files and
 * returns a single A-Z sorted list for UI consumers.
 */
export function readMcpServers(configPath: string, disabledConfigPath?: string): McpServer[] {
	try {
		const enabledServers = readServersFromConfig(configPath, true);
		const disabledServers = disabledConfigPath
			? readServersFromConfig(disabledConfigPath, false)
			: [];
		const pluginServers = listPluginMcpDefinitions(path.join(path.dirname(configPath), 'config.json')).map((definition, index) => ({
			id: definition.id,
			entryId: definition.entryId,
			enabled: true,
			headerLineIndex: index,
			readOnly: true,
			sourceLabel: 'Plugin MCP',
		}));
		return sortMcpServersForDisplay([...enabledServers, ...disabledServers], pluginServers);
	} catch {
		return [];
	}
}

/**
 * Parses one MCP config file and marks all entries with the provided enabled state.
 */
export function parseMcpServers(contents: string, enabled: boolean): McpServer[] {
	const parsed = JSON.parse(contents) as McpConfigShape;
	const servers = parsed.servers ?? parsed.mcpServers ?? {};
	return Object.keys(servers).map((id, index) => ({
		id,
		entryId: id,
		enabled,
		headerLineIndex: index,
	}));
}

/**
 * Moves one MCP entry between the enabled and disabled config files.
 */
export function toggleMcpServer(
	configPath: string,
	disabledConfigPath: string,
	serverId: string,
): boolean {
	try {
		const enabledConfig = readConfig(configPath);
		const disabledConfig = readConfig(disabledConfigPath);
		const enabledServers = { ...(enabledConfig.mcpServers ?? enabledConfig.servers ?? {}) };
		const disabledServers = { ...(disabledConfig.mcpServers ?? disabledConfig.servers ?? {}) };
		const currentEnabled = asServerRecord(enabledServers[serverId]);
		const currentDisabled = asServerRecord(disabledServers[serverId]);
		if (currentEnabled) {
			delete enabledServers[serverId];
			disabledServers[serverId] = stripDisabledField(currentEnabled);
		} else if (currentDisabled) {
			delete disabledServers[serverId];
			enabledServers[serverId] = stripDisabledField(currentDisabled);
		} else {
			return false;
		}
		writeConfig(configPath, { mcpServers: enabledServers });
		writeConfig(disabledConfigPath, { mcpServers: disabledServers });
		return true;
	} catch {
		return false;
	}
}

export function getMcpConfigPath(copilotDir: string): string {
	return path.join(copilotDir, 'mcp-config.json');
}

export function getDisabledMcpConfigPath(copilotDir: string): string {
	return path.join(copilotDir, '.copilot-workspace-manager', 'mcp-config.disabled.json');
}

export function sortMcpServersById<T extends { id: string }>(servers: T[]): T[] {
	return [...servers].sort((left, right) => left.id.localeCompare(right.id, undefined, { sensitivity: 'base' }));
}

export function sortMcpServersForDisplay<T extends { id: string }>(
	regularServers: T[],
	pluginServers: T[],
): T[] {
	return [
		...sortMcpServersById(regularServers),
		...sortMcpServersById(pluginServers),
	];
}

function readServersFromConfig(configPath: string, enabled: boolean): McpServer[] {
	if (!fs.existsSync(configPath)) {
		return [];
	}
	const contents = fs.readFileSync(configPath, 'utf8');
	return parseMcpServers(contents, enabled).map((server) => ({
		...server,
		configPath,
	}));
}

function readConfig(configPath: string): { mcpServers?: Record<string, Record<string, unknown>>; servers?: Record<string, Record<string, unknown>> } {
	if (!fs.existsSync(configPath)) {
		return {};
	}
	return JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
		mcpServers?: Record<string, Record<string, unknown>>;
		servers?: Record<string, Record<string, unknown>>;
	};
}

function writeConfig(
	configPath: string,
	config: { mcpServers?: Record<string, Record<string, unknown>> },
): void {
	fs.mkdirSync(path.dirname(configPath), { recursive: true });
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

function asServerRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value)
		? { ...(value as Record<string, unknown>) }
		: undefined;
}

function stripDisabledField(value: Record<string, unknown>): Record<string, unknown> {
	const { disabled: _disabled, ...rest } = value;
	return rest;
}

import fs from 'fs';
import path from 'path';

export type McpServer = {
	id: string;
	enabled: boolean;
	headerLineIndex: number;
	configPath?: string;
};

export function readMcpServers(configPath: string): McpServer[] {
	try {
		if (!fs.existsSync(configPath)) {
			return [];
		}
		const contents = fs.readFileSync(configPath, 'utf8');
		return parseMcpServers(contents);
	} catch {
		return [];
	}
}

export function parseMcpServers(contents: string): McpServer[] {
	const parsed = JSON.parse(contents) as { servers?: Record<string, unknown>; mcpServers?: Record<string, unknown> };
	const servers = parsed.servers ?? parsed.mcpServers ?? {};
	return Object.entries(servers).map(([id, value], index) => ({
		id,
		enabled: !isDisabledServer(value),
		headerLineIndex: index,
	}));
}

export function toggleMcpServer(configPath: string, serverId: string): boolean {
	try {
		const parsed = fs.existsSync(configPath)
			? JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
				mcpServers?: Record<string, Record<string, unknown>>;
				servers?: Record<string, Record<string, unknown>>;
			}
			: {};
		const key = parsed.mcpServers ? 'mcpServers' : 'servers';
		const servers = parsed[key] ?? {};
		const current = servers[serverId];
		if (!current || typeof current !== 'object') {
			return false;
		}
		servers[serverId] = {
			...current,
			disabled: !isDisabledServer(current),
		};
		parsed[key] = servers;
		fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), 'utf8');
		return true;
	} catch {
		return false;
	}
}

export function getMcpConfigPath(copilotDir: string): string {
	return path.join(copilotDir, 'mcp-config.json');
}

function isDisabledServer(value: unknown): boolean {
	return Boolean(
		value &&
		typeof value === 'object' &&
		'disabled' in value &&
		(value as { disabled?: unknown }).disabled === true,
	);
}

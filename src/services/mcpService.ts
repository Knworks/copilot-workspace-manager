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
	return Object.keys(servers).map((id, index) => ({
		id,
		enabled: true,
		headerLineIndex: index,
	}));
}

export function toggleMcpServer(configPath: string, serverId: string): boolean {
	void configPath;
	void serverId;
	return false;
}

export function getMcpConfigPath(copilotDir: string): string {
	return path.join(copilotDir, 'mcp-config.json');
}

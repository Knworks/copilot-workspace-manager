import fs from 'fs';
import path from 'path';
import { AgentLocation, getAgentLocations } from './agentLocations';
import { resolveCopilotPaths } from './workspaceStatus';

export type AgentManagerRecord = {
	id: string;
	name: string;
	description: string;
	model: string;
	tools: string;
	mcpServers: string;
	agentPath: string;
	location: AgentLocation;
	readonly: boolean;
};

const INHERITED = '継承';

export function listAgentManagerRecords(
	_configPath: string,
	locations: AgentLocation[] = getAgentLocations(),
): AgentManagerRecord[] {
	return locations.flatMap((location) =>
		listAgentFiles(location.rootPath).map((agentPath) => {
			const frontmatter = readAgentFrontmatter(agentPath);
			const id = path.basename(agentPath).replace(/\.agent\.md$/i, '');
			const name = frontmatter.name ?? id;
			return {
				id: `${location.kind}:${agentPath}`,
				name,
				description: frontmatter.description ?? '',
				model: frontmatter.model ?? INHERITED,
				tools: frontmatter.tools ?? INHERITED,
				mcpServers: frontmatter['mcp-servers'] ?? INHERITED,
				agentPath,
				location,
				readonly: location.kind === 'plugin',
			};
		}),
	);
}

export function disableAgentByName(copilotDir: string, configPath: string, agentName: string): void {
	void copilotDir;
	void configPath;
	void agentName;
}

export function enableAgentByName(
	copilotDir: string,
	configPath: string,
	agentName: string,
): { overwritten: boolean } {
	void copilotDir;
	void configPath;
	void agentName;
	return { overwritten: false };
}

export function resolveAgentManagerPaths(): { copilotDir: string; configPath: string } {
	return resolveCopilotPaths();
}

function listAgentFiles(rootPath: string): string[] {
	if (!fs.existsSync(rootPath)) {
		return [];
	}
	return fs.readdirSync(rootPath, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.agent.md'))
		.map((entry) => path.join(rootPath, entry.name))
		.sort((left, right) =>
			path.basename(left).localeCompare(path.basename(right), undefined, {
				numeric: true,
				sensitivity: 'base',
			}),
		);
}

function readAgentFrontmatter(agentPath: string): Record<string, string> {
	if (!fs.existsSync(agentPath)) {
		return {};
	}
	const contents = fs.readFileSync(agentPath, 'utf8');
	const result: Record<string, string> = {};
	const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) {
		return result;
	}
	for (const line of match[1].split(/\r?\n/)) {
		const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (!item) {
			continue;
		}
		const value = item[2].trim().replace(/^["']|["']$/g, '');
		if (value) {
			result[item[1]] = value;
		}
	}
	return result;
}

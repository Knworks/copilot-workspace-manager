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
	userInvocable: boolean;
	disableModelInvocation: boolean;
	previewContent: string;
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
		listAgentFiles(location.rootPath, location.kind === 'plugin').map((agentPath) => {
			const frontmatter = readAgentFrontmatter(agentPath);
			const id = path.basename(agentPath).replace(/(\.agent)?\.md$/i, '');
			const name = frontmatter.name ?? id;
			return {
				id: `${location.kind}:${agentPath}`,
				name,
				description: frontmatter.description ?? '',
				model: frontmatter.model ?? INHERITED,
				tools: frontmatter.tools ?? INHERITED,
				mcpServers: readMcpServersFrontmatter(frontmatter) ?? INHERITED,
				userInvocable: readBooleanFrontmatter(frontmatter['user-invocable'], true),
				disableModelInvocation: readBooleanFrontmatter(
					frontmatter['disable-model-invocation'],
					false,
				),
				previewContent: extractAgentPreviewContent(fs.readFileSync(agentPath, 'utf8')),
				agentPath,
				location,
				readonly: location.kind === 'plugin',
			};
		}),
	);
}

export function setAgentFrontmatterToggle(
	agentPath: string,
	key: 'user-invocable' | 'disable-model-invocation',
	value: boolean,
): void {
	if (!fs.existsSync(agentPath)) {
		return;
	}
	const contents = fs.readFileSync(agentPath, 'utf8');
	const nextContents = upsertFrontmatterValue(agentPath, contents, key, value ? 'true' : 'false');
	fs.writeFileSync(agentPath, nextContents, 'utf8');
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

function listAgentFiles(rootPath: string, allowPlainMarkdown = false): string[] {
	if (!fs.existsSync(rootPath)) {
		return [];
	}
	return fs.readdirSync(rootPath, { withFileTypes: true })
		.filter((entry) => {
			if (!entry.isFile()) {
				return false;
			}
			const lowerName = entry.name.toLowerCase();
			if (lowerName.endsWith('.agent.md')) {
				return true;
			}
			return allowPlainMarkdown && lowerName.endsWith('.md');
		})
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
	let currentNestedRoot: string | undefined;
	for (const line of match[1].split(/\r?\n/)) {
		const nestedItem = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*(.*)$/);
		if (nestedItem && currentNestedRoot) {
			const nestedValue = nestedItem[2].trim().replace(/^["']|["']$/g, '');
			result[`${currentNestedRoot}.${nestedItem[1]}`] = nestedValue || nestedItem[1];
			continue;
		}
		const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (!item) {
			continue;
		}
		const value = item[2].trim().replace(/^["']|["']$/g, '');
		currentNestedRoot = value ? undefined : item[1];
		if (value) {
			result[item[1]] = value;
		}
	}
	return result;
}

function readBooleanFrontmatter(value: string | undefined, defaultValue: boolean): boolean {
	if (value === undefined) {
		return defaultValue;
	}
	return value.toLocaleLowerCase() === 'true';
}

function readMcpServersFrontmatter(frontmatter: Record<string, string>): string | undefined {
	const directValue = frontmatter['mcp-servers'];
	if (directValue) {
		return directValue;
	}
	const nestedKeys = Object.keys(frontmatter)
		.filter((key) => key.startsWith('mcp-servers.'))
		.map((key) => key.slice('mcp-servers.'.length))
		.filter(Boolean)
		.filter((value, index, values) => values.indexOf(value) === index);
	return nestedKeys.length ? nestedKeys.join(', ') : undefined;
}

function upsertFrontmatterValue(
	agentPath: string,
	contents: string,
	key: string,
	value: string,
): string {
	const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) {
		const fileName = path.basename(agentPath).replace(/\.agent\.md$/i, '');
		const frontmatter = [
			'---',
			`name: "${fileName}"`,
			`${key}: ${value}`,
			'---',
			'',
		].join('\n');
		return `${frontmatter}${contents}`;
	}

	const lines = match[1].split(/\r?\n/);
	let updated = false;
	const nextLines = lines.map((line) => {
		if (!line.match(new RegExp(`^${escapeRegExp(key)}\\s*:`))) {
			return line;
		}
		updated = true;
		return `${key}: ${value}`;
	});
	if (!updated) {
		nextLines.push(`${key}: ${value}`);
	}
	const replacement = `---\n${nextLines.join('\n')}\n---`;
	return `${contents.slice(0, match.index)}${replacement}${contents.slice((match.index ?? 0) + match[0].length)}`;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractAgentPreviewContent(contents: string): string {
	const match = contents.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	return match ? contents.slice(match[0].length) : contents;
}

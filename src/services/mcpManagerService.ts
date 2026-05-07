import fs from 'fs';
import path from 'path';
import { sortMcpServersById } from './mcpService';

export type McpServerType = 'local' | 'stdio' | 'http' | 'sse';
export type McpFilterMapping = 'none' | 'markdown' | 'hidden_characters';

export type McpListEntry = {
	value: string;
};

export type McpKeyValueEntry = {
	key: string;
	value: string;
};

export type McpFormModel = {
	id: string;
	type: McpServerType;
	command: string;
	args: string[];
	tools: string[];
	env: McpKeyValueEntry[];
	cwd: string;
	url: string;
	headers: McpKeyValueEntry[];
	timeout?: number;
	oauthClientId: string;
	oauthPublicClient: boolean;
	oidc: boolean;
	filterMapping?: McpFilterMapping;
	enabled: boolean;
};

export type McpValidationResult = {
	ok: boolean;
	errors: string[];
};

type McpConfigShape = {
	mcpServers?: Record<string, Record<string, unknown>>;
	servers?: Record<string, Record<string, unknown>>;
};

const LOCAL_TYPES: McpServerType[] = ['local', 'stdio'];
const REMOTE_TYPES: McpServerType[] = ['http', 'sse'];
const MCP_TYPES = new Set<McpServerType>([...LOCAL_TYPES, ...REMOTE_TYPES]);
const FILTER_MAPPINGS = new Set<McpFilterMapping>([
	'none',
	'markdown',
	'hidden_characters',
]);

/**
 * Lists MCP entries from both enabled and disabled config files as one A-Z sorted collection.
 */
export function listMcpFormModels(configPath: string, disabledConfigPath?: string): McpFormModel[] {
	const enabledModels = readModelsFromConfig(configPath, true);
	const disabledModels = disabledConfigPath ? readModelsFromConfig(disabledConfigPath, false) : [];
	return sortMcpServersById([...enabledModels, ...disabledModels]);
}

export function validateMcpModel(
	model: McpFormModel,
	existingIds: string[],
	previousId?: string,
): McpValidationResult {
	const errors: string[] = [];

	if (!model.id.trim()) {
		errors.push('serverNameRequired');
	}
	if (existingIds.includes(model.id) && model.id !== previousId) {
		errors.push('serverNameDuplicate');
	}
	if (!MCP_TYPES.has(model.type)) {
		errors.push('typeInvalid');
	}
	if (isLocalType(model.type) && !model.command.trim()) {
		errors.push('commandRequired');
	}
	if (isRemoteType(model.type) && !model.url.trim()) {
		errors.push('urlRequired');
	}
	if (model.timeout !== undefined && (!Number.isFinite(model.timeout) || model.timeout < 0)) {
		errors.push('timeoutInvalid');
	}
	if (model.filterMapping && !FILTER_MAPPINGS.has(model.filterMapping)) {
		errors.push('filterMappingInvalid');
	}

	for (const entry of model.env) {
		if (!entry.key.trim() && !entry.value.trim()) {
			continue;
		}
		if (!entry.key.trim()) {
			errors.push('envKeyRequired');
		}
	}
	for (const entry of model.headers) {
		if (!entry.key.trim() && !entry.value.trim()) {
			continue;
		}
		if (!entry.key.trim()) {
			errors.push('headersKeyRequired');
		}
	}

	return { ok: errors.length === 0, errors };
}

export function saveMcpServer(
	configPath: string,
	disabledConfigPath: string,
	model: McpFormModel,
	previousId?: string,
): McpValidationResult {
	const parsed = readConfig(configPath);
	const disabledParsed = readConfig(disabledConfigPath);
	const servers = { ...(parsed.mcpServers ?? parsed.servers ?? {}) };
	const disabledServers = { ...(disabledParsed.mcpServers ?? disabledParsed.servers ?? {}) };
	const validation = validateMcpModel(
		model,
		Array.from(new Set([...Object.keys(servers), ...Object.keys(disabledServers)])),
		previousId,
	);
	if (!validation.ok) {
		return validation;
	}

	if (previousId) {
		delete servers[previousId];
		delete disabledServers[previousId];
	}
	delete servers[model.id];
	delete disabledServers[model.id];

	const targetServers = model.enabled ? servers : disabledServers;
	targetServers[model.id] = fromModel(model);

	parsed.mcpServers = servers;
	disabledParsed.mcpServers = disabledServers;
	delete parsed.servers;
	delete disabledParsed.servers;
	writeConfig(configPath, parsed);
	writeConfig(disabledConfigPath, disabledParsed);
	return validation;
}

/**
 * Deletes one MCP entry from both enabled and disabled config files.
 */
export function deleteMcpServer(configPath: string, disabledConfigPath: string, serverId: string): boolean {
	const parsed = readConfig(configPath);
	const disabledParsed = readConfig(disabledConfigPath);
	const servers = { ...(parsed.mcpServers ?? parsed.servers ?? {}) };
	const disabledServers = { ...(disabledParsed.mcpServers ?? disabledParsed.servers ?? {}) };
	const existed = serverId in servers || serverId in disabledServers;
	if (!existed) {
		return false;
	}
	delete servers[serverId];
	delete disabledServers[serverId];
	parsed.mcpServers = servers;
	disabledParsed.mcpServers = disabledServers;
	delete parsed.servers;
	delete disabledParsed.servers;
	writeConfig(configPath, parsed);
	writeConfig(disabledConfigPath, disabledParsed);
	return true;
}

function toModel(id: string, value: Record<string, unknown>): McpFormModel {
	const type = readType(value);
	return {
		id,
		type,
		command: typeof value.command === 'string' ? value.command : '',
		args: readStringArray(value.args),
		tools: readStringArray(Array.isArray(value.tools) ? value.tools : value.enabledTools),
		env: readKeyValueEntries(value.env),
		cwd: typeof value.cwd === 'string' ? value.cwd : '',
		url: typeof value.url === 'string' ? value.url : '',
		headers: readKeyValueEntries(value.headers),
		timeout: readTimeout(value),
		oauthClientId: typeof value.oauthClientId === 'string' ? value.oauthClientId : '',
		oauthPublicClient: typeof value.oauthPublicClient === 'boolean' ? value.oauthPublicClient : true,
		oidc: value.oidc === true,
		filterMapping: readFilterMapping(value.filterMapping),
		enabled: true,
	};
}

function fromModel(model: McpFormModel): Record<string, unknown> {
	const tools = model.tools.length > 0 ? model.tools : ['*'];
	const next: Record<string, unknown> = {
		type: model.type,
		tools,
	};

	if (isLocalType(model.type)) {
		next.command = model.command;
		next.args = model.args;
		const env = toKeyValueObject(model.env);
		if (env) {
			next.env = env;
		}
		if (model.cwd.trim()) {
			next.cwd = model.cwd.trim();
		}
	} else {
		next.url = model.url.trim();
		const headers = toKeyValueObject(model.headers);
		if (headers) {
			next.headers = headers;
		}
		if (model.oauthClientId.trim()) {
			next.oauthClientId = model.oauthClientId.trim();
		}
		if (model.oauthPublicClient === false) {
			next.oauthPublicClient = false;
		}
	}

	if (model.timeout !== undefined) {
		next.timeout = model.timeout;
	}
	if (model.oidc) {
		next.oidc = true;
	}
	if (model.filterMapping) {
		next.filterMapping = model.filterMapping;
	}

	return next;
}

function readConfig(configPath: string): McpConfigShape {
	if (!fs.existsSync(configPath)) {
		return {};
	}
	try {
		return JSON.parse(fs.readFileSync(configPath, 'utf8')) as McpConfigShape;
	} catch {
		return {};
	}
}

function writeConfig(configPath: string, config: McpConfigShape): void {
	fs.mkdirSync(path.dirname(configPath), { recursive: true });
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

function readModelsFromConfig(configPath: string, enabled: boolean): McpFormModel[] {
	const parsed = readConfig(configPath);
	const servers = parsed.mcpServers ?? parsed.servers ?? {};
	return Object.entries(servers).map(([id, value]) => ({
		...toModel(id, value),
		enabled,
	}));
}

function readType(value: Record<string, unknown>): McpServerType {
	if (typeof value.type === 'string' && MCP_TYPES.has(value.type as McpServerType)) {
		return value.type as McpServerType;
	}
	return typeof value.url === 'string' && value.url.trim() ? 'http' : 'local';
}

function readStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readKeyValueEntries(value: unknown): McpKeyValueEntry[] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return [];
	}
	return Object.entries(value as Record<string, unknown>)
		.filter(([, entryValue]) => typeof entryValue === 'string')
		.map(([key, entryValue]) => ({ key, value: entryValue as string }));
}

function toKeyValueObject(entries: McpKeyValueEntry[]): Record<string, string> | undefined {
	const filtered = entries
		.map((entry) => ({ key: entry.key.trim(), value: entry.value }))
		.filter((entry) => entry.key);
	return filtered.length > 0 ? Object.fromEntries(filtered.map((entry) => [entry.key, entry.value])) : undefined;
}

function readTimeout(value: Record<string, unknown>): number | undefined {
	if (typeof value.timeout === 'number') {
		return value.timeout;
	}
	return typeof value.toolTimeoutSec === 'number' ? value.toolTimeoutSec : undefined;
}

function readFilterMapping(value: unknown): McpFilterMapping | undefined {
	return typeof value === 'string' && FILTER_MAPPINGS.has(value as McpFilterMapping)
		? value as McpFilterMapping
		: undefined;
}

function isLocalType(type: McpServerType): boolean {
	return LOCAL_TYPES.includes(type);
}

function isRemoteType(type: McpServerType): boolean {
	return REMOTE_TYPES.includes(type);
}

import fs from 'fs';
import path from 'path';

export type McpTransport = 'stdio' | 'http';

export type McpEnvEntry = {
	key: string;
	value: string;
};

export type McpFormModel = {
	id: string;
	transport: McpTransport;
	command: string;
	args: string[];
	url: string;
	env: McpEnvEntry[];
	required?: boolean;
	startupTimeoutSec?: number;
	toolTimeoutSec?: number;
	enabledTools: string[];
	disabledTools: string[];
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

const MCP_ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function listMcpFormModels(configPath: string): McpFormModel[] {
	const parsed = readConfig(configPath);
	const servers = parsed.mcpServers ?? parsed.servers ?? {};
	return Object.entries(servers).map(([id, value]) => toModel(id, value));
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
	if (model.transport === 'stdio' && !model.command.trim()) {
		errors.push('commandRequired');
	}
	if (model.transport === 'http' && !model.url.trim()) {
		errors.push('urlRequired');
	}
	for (const timeout of [model.startupTimeoutSec, model.toolTimeoutSec]) {
		if (timeout !== undefined && (!Number.isFinite(timeout) || timeout < 0)) {
			errors.push('timeoutInvalid');
		}
	}
	if (model.enabledTools.length > 0 && model.disabledTools.length > 0) {
		errors.push('toolsMutuallyExclusive');
	}
	const seenEnvKeys = new Set<string>();
	for (const entry of model.env) {
		const key = entry.key.trim();
		const value = entry.value.trim();
		if (!key && !value) {
			continue;
		}
		if (!key) {
			errors.push('envKeyRequired');
			continue;
		}
		if (!MCP_ENV_KEY_PATTERN.test(key)) {
			errors.push('envKeyInvalid');
			continue;
		}
		if (seenEnvKeys.has(key)) {
			errors.push('envKeyDuplicate');
			continue;
		}
		seenEnvKeys.add(key);
	}
	return { ok: errors.length === 0, errors };
}

export function saveMcpServer(
	configPath: string,
	model: McpFormModel,
	previousId?: string,
): McpValidationResult {
	const parsed = readConfig(configPath);
	const servers = { ...(parsed.mcpServers ?? parsed.servers ?? {}) };
	const validation = validateMcpModel(model, Object.keys(servers), previousId);
	if (!validation.ok) {
		return validation;
	}
	if (previousId && previousId !== model.id) {
		delete servers[previousId];
	}
	servers[model.id] = fromModel(model);
	parsed.mcpServers = servers;
	delete parsed.servers;
	writeConfig(configPath, parsed);
	return validation;
}

export function deleteMcpServer(configPath: string, serverId: string): boolean {
	const parsed = readConfig(configPath);
	const servers = { ...(parsed.mcpServers ?? parsed.servers ?? {}) };
	if (!(serverId in servers)) {
		return false;
	}
	delete servers[serverId];
	parsed.mcpServers = servers;
	delete parsed.servers;
	writeConfig(configPath, parsed);
	return true;
}

function toModel(id: string, value: Record<string, unknown>): McpFormModel {
	const url = typeof value.url === 'string' ? value.url : '';
	const command = typeof value.command === 'string' ? value.command : '';
	const type = typeof value.type === 'string' ? value.type : '';
	return {
		id,
		transport: url || type === 'http' || type === 'sse' ? 'http' : 'stdio',
		command,
		args: Array.isArray(value.args) ? value.args.filter((item): item is string => typeof item === 'string') : [],
		url,
		env: Object.entries(
			value.env && typeof value.env === 'object' && !Array.isArray(value.env)
				? value.env as Record<string, unknown>
				: {},
		)
			.filter(([, envValue]) => typeof envValue === 'string')
			.map(([key, envValue]) => ({ key, value: envValue as string })),
		required: typeof value.required === 'boolean' ? value.required : undefined,
		startupTimeoutSec: typeof value.startupTimeoutSec === 'number' ? value.startupTimeoutSec : undefined,
		toolTimeoutSec: typeof value.toolTimeoutSec === 'number' ? value.toolTimeoutSec : undefined,
		enabledTools: Array.isArray(value.enabledTools)
			? value.enabledTools.filter((item): item is string => typeof item === 'string')
			: [],
		disabledTools: Array.isArray(value.disabledTools)
			? value.disabledTools.filter((item): item is string => typeof item === 'string')
			: [],
		enabled: value.disabled !== true,
	};
}

function fromModel(model: McpFormModel): Record<string, unknown> {
	const next: Record<string, unknown> = {
		disabled: !model.enabled,
	};
	if (model.transport === 'stdio') {
		next.type = 'stdio';
		next.command = model.command;
		if (model.args.length > 0) {
			next.args = model.args;
		}
	} else {
		next.type = 'http';
		next.url = model.url;
	}
	if (model.env.length > 0) {
		next.env = Object.fromEntries(
			model.env.filter((entry) => entry.key.trim()).map((entry) => [entry.key.trim(), entry.value]),
		);
	}
	if (model.required !== undefined) {
		next.required = model.required;
	}
	if (model.startupTimeoutSec !== undefined) {
		next.startupTimeoutSec = model.startupTimeoutSec;
	}
	if (model.toolTimeoutSec !== undefined) {
		next.toolTimeoutSec = model.toolTimeoutSec;
	}
	if (model.enabledTools.length > 0) {
		next.enabledTools = model.enabledTools;
	}
	if (model.disabledTools.length > 0) {
		next.disabledTools = model.disabledTools;
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

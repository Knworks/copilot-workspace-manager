import * as assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	deleteMcpServer,
	listMcpFormModels,
	saveMcpServer,
	validateMcpModel,
} from '../services/mcpManagerService';

function withTempDir(run: (root: string) => void): void {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-manager-'));
	try {
		run(tempDir);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

suite('MCP manager service', () => {
	test('listMcpFormModels reads local and remote server models', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'mcp-config.json');
			const disabledConfigPath = path.join(root, '.copilot-workspace-manager', 'mcp-config.disabled.json');
			fs.mkdirSync(path.dirname(disabledConfigPath), { recursive: true });
			fs.writeFileSync(
				configPath,
				JSON.stringify(
					{
						mcpServers: {
							playwright: {
								type: 'local',
								command: 'npx',
								args: ['@playwright/mcp@latest'],
								tools: ['*'],
								cwd: '/workspace',
							},
						},
					},
					null,
					2,
				),
				'utf8',
			);
			fs.writeFileSync(
				disabledConfigPath,
				JSON.stringify(
					{
						mcpServers: {
							context7: {
								type: 'sse',
								url: 'https://example.test/sse',
								headers: {
									CONTEXT7_API_KEY: '\${CONTEXT7_API_KEY}',
								},
								tools: ['resolve-library-id'],
							},
						},
					},
					null,
					2,
				),
				'utf8',
			);

			const models = listMcpFormModels(configPath, disabledConfigPath);

			assert.strictEqual(models.length, 2);
			assert.strictEqual(models[0].type, 'sse');
			assert.strictEqual(models[0].enabled, false);
			assert.strictEqual(models[0].headers[0]?.key, 'CONTEXT7_API_KEY');
			assert.strictEqual(models[1].type, 'local');
			assert.deepStrictEqual(models[1].args, ['@playwright/mcp@latest']);
			assert.strictEqual(models[1].cwd, '/workspace');
		});
	});

	test('saveMcpServer writes local server entries in Copilot format', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'mcp-config.json');
			const disabledConfigPath = path.join(root, '.copilot-workspace-manager', 'mcp-config.disabled.json');

			const result = saveMcpServer(configPath, disabledConfigPath, {
				id: 'playwright',
				type: 'local',
				command: 'npx',
				args: ['@playwright/mcp@latest'],
				tools: ['*'],
				env: [{ key: 'DEBUG', value: '1' }],
				cwd: '/workspace',
				url: '',
				headers: [],
				timeout: 15000,
				oauthClientId: '',
				oauthPublicClient: true,
				oidc: false,
				filterMapping: undefined,
				enabled: true,
			});

			assert.strictEqual(result.ok, true);
			const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
				mcpServers: Record<string, Record<string, unknown>>;
			};
			assert.strictEqual(saved.mcpServers.playwright.type, 'local');
			assert.deepStrictEqual(saved.mcpServers.playwright.args, ['@playwright/mcp@latest']);
			assert.deepStrictEqual(saved.mcpServers.playwright.tools, ['*']);
			assert.strictEqual(saved.mcpServers.playwright.cwd, '/workspace');
			assert.deepStrictEqual(saved.mcpServers.playwright.env, { DEBUG: '1' });
			assert.strictEqual(saved.mcpServers.playwright.timeout, 15000);
		});
	});

	test('saveMcpServer writes wildcard tools when no tool entries are provided', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'mcp-config.json');
			const disabledConfigPath = path.join(root, '.copilot-workspace-manager', 'mcp-config.disabled.json');

			const result = saveMcpServer(configPath, disabledConfigPath, {
				id: 'playwright',
				type: 'stdio',
				command: 'npx',
				args: ['@playwright/mcp@latest'],
				tools: [],
				env: [],
				cwd: '',
				url: '',
				headers: [],
				timeout: undefined,
				oauthClientId: '',
				oauthPublicClient: true,
				oidc: false,
				filterMapping: undefined,
				enabled: true,
			});

			assert.strictEqual(result.ok, true);
			const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
				mcpServers: Record<string, Record<string, unknown>>;
			};
			assert.deepStrictEqual(saved.mcpServers.playwright.tools, ['*']);
		});
	});

	test('saveMcpServer writes empty args array when local or stdio args are omitted', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'mcp-config.json');
			const disabledConfigPath = path.join(root, '.copilot-workspace-manager', 'mcp-config.disabled.json');

			const result = saveMcpServer(configPath, disabledConfigPath, {
				id: 'playwright',
				type: 'local',
				command: 'npx',
				args: [],
				tools: ['*'],
				env: [],
				cwd: '',
				url: '',
				headers: [],
				timeout: undefined,
				oauthClientId: '',
				oauthPublicClient: true,
				oidc: false,
				filterMapping: undefined,
				enabled: true,
			});

			assert.strictEqual(result.ok, true);
			const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
				mcpServers: Record<string, Record<string, unknown>>;
			};
			assert.deepStrictEqual(saved.mcpServers.playwright.args, []);
		});
	});

	test('saveMcpServer writes disabled remote entries to workspace manager file', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'mcp-config.json');
			const disabledConfigPath = path.join(root, '.copilot-workspace-manager', 'mcp-config.disabled.json');

			const result = saveMcpServer(configPath, disabledConfigPath, {
				id: 'context7',
				type: 'http',
				command: '',
				args: [],
				tools: ['*'],
				env: [],
				cwd: '',
				url: 'https://mcp.context7.com/mcp',
				headers: [{ key: 'CONTEXT7_API_KEY', value: '\${CONTEXT7_API_KEY}' }],
				timeout: 5000,
				oauthClientId: 'client-id',
				oauthPublicClient: false,
				oidc: true,
				filterMapping: 'markdown',
				enabled: false,
			});

			assert.strictEqual(result.ok, true);
			const saved = JSON.parse(fs.readFileSync(disabledConfigPath, 'utf8')) as {
				mcpServers: Record<string, Record<string, unknown>>;
			};
			assert.strictEqual(saved.mcpServers.context7.type, 'http');
			assert.strictEqual(saved.mcpServers.context7.url, 'https://mcp.context7.com/mcp');
			assert.deepStrictEqual(saved.mcpServers.context7.tools, ['*']);
			assert.deepStrictEqual(saved.mcpServers.context7.headers, { CONTEXT7_API_KEY: '\${CONTEXT7_API_KEY}' });
			assert.strictEqual(saved.mcpServers.context7.oauthPublicClient, false);
			assert.strictEqual(saved.mcpServers.context7.oidc, true);
			assert.strictEqual(saved.mcpServers.context7.filterMapping, 'markdown');
		});
	});

	test('saveMcpServer removes irrelevant fields when switching from local to remote', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'mcp-config.json');
			const disabledConfigPath = path.join(root, '.copilot-workspace-manager', 'mcp-config.disabled.json');
			saveMcpServer(configPath, disabledConfigPath, {
				id: 'server',
				type: 'local',
				command: 'npx',
				args: ['tool'],
				tools: ['*'],
				env: [{ key: 'DEBUG', value: '1' }],
				cwd: '/workspace',
				url: '',
				headers: [],
				timeout: undefined,
				oauthClientId: '',
				oauthPublicClient: true,
				oidc: false,
				filterMapping: undefined,
				enabled: true,
			});

			saveMcpServer(configPath, disabledConfigPath, {
				id: 'server',
				type: 'sse',
				command: 'should-not-save',
				args: ['should-not-save'],
				tools: ['lookup'],
				env: [{ key: 'DEBUG', value: '1' }],
				cwd: '/workspace',
				url: 'https://example.test/sse',
				headers: [{ key: 'AUTH', value: 'token' }],
				timeout: 1000,
				oauthClientId: '',
				oauthPublicClient: true,
				oidc: false,
				filterMapping: undefined,
				enabled: true,
			}, 'server');

			const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
				mcpServers: Record<string, Record<string, unknown>>;
			};
			assert.strictEqual(saved.mcpServers.server.type, 'sse');
			assert.ok(!('command' in saved.mcpServers.server));
			assert.ok(!('args' in saved.mcpServers.server));
			assert.ok(!('env' in saved.mcpServers.server));
			assert.ok(!('cwd' in saved.mcpServers.server));
			assert.strictEqual(saved.mcpServers.server.url, 'https://example.test/sse');
		});
	});

	test('deleteMcpServer removes target JSON entry', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'mcp-config.json');
			const disabledConfigPath = path.join(root, '.copilot-workspace-manager', 'mcp-config.disabled.json');
			fs.mkdirSync(path.dirname(disabledConfigPath), { recursive: true });
			fs.writeFileSync(
				configPath,
				JSON.stringify(
					{
						mcpServers: {
							a: { type: 'local', command: 'a', args: ['1'], tools: ['*'] },
							b: { type: 'stdio', command: 'b', args: ['1'], tools: ['*'] },
						},
					},
					null,
					2,
				),
				'utf8',
			);
			fs.writeFileSync(
				disabledConfigPath,
				JSON.stringify(
					{
						mcpServers: {
							c: { type: 'http', url: 'https://example.test', tools: ['*'] },
						},
					},
					null,
					2,
				),
				'utf8',
			);

			assert.strictEqual(deleteMcpServer(configPath, disabledConfigPath, 'a'), true);
			assert.strictEqual(deleteMcpServer(configPath, disabledConfigPath, 'c'), true);
			const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { mcpServers: Record<string, unknown> };
			const savedDisabled = JSON.parse(fs.readFileSync(disabledConfigPath, 'utf8')) as { mcpServers: Record<string, unknown> };
			assert.ok(!('a' in saved.mcpServers));
			assert.ok('b' in saved.mcpServers);
			assert.ok(!('c' in savedDisabled.mcpServers));
		});
	});

	test('validateMcpModel rejects invalid type and shared field errors', () => {
		const result = validateMcpModel({
			id: 'github',
			type: 'ftp' as 'local',
			command: '',
			args: [],
			tools: [],
			env: [],
			cwd: '',
			url: '',
			headers: [],
			timeout: -1,
			oauthClientId: '',
			oauthPublicClient: true,
			oidc: false,
			filterMapping: 'invalid' as 'none',
			enabled: true,
		}, []);

		assert.strictEqual(result.ok, false);
		assert.ok(result.errors.includes('typeInvalid'));
		assert.ok(result.errors.includes('timeoutInvalid'));
		assert.ok(result.errors.includes('filterMappingInvalid'));
	});
});

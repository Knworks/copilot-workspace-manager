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
	test('listMcpFormModels reads JSON stdio and http servers', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'mcp-config.json');
			const disabledConfigPath = path.join(root, '.copilot-workspace-manager', 'mcp-config.disabled.json');
			fs.mkdirSync(path.dirname(disabledConfigPath), { recursive: true });
			fs.writeFileSync(
				configPath,
				JSON.stringify(
					{
						mcpServers: {
							github: {
								type: 'stdio',
								command: 'gh',
								args: ['api', 'repos'],
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
							remote: {
								type: 'http',
								url: 'https://example.test/mcp',
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
			assert.strictEqual(models[0].transport, 'stdio');
			assert.deepStrictEqual(models[0].args, ['api', 'repos']);
			assert.strictEqual(models[1].transport, 'http');
			assert.strictEqual(models[1].enabled, false);
		});
	});

	test('saveMcpServer writes JSON server entries', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'mcp-config.json');
			const disabledConfigPath = path.join(root, '.copilot-workspace-manager', 'mcp-config.disabled.json');

			const result = saveMcpServer(configPath, disabledConfigPath, {
				id: 'context7',
				transport: 'stdio',
				command: 'npx',
				args: ['-y'],
				url: '',
				env: [{ key: 'API_KEY', value: 'secret' }],
				enabledTools: [],
				disabledTools: [],
				enabled: true,
			});

			assert.strictEqual(result.ok, true);
			const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
				mcpServers: Record<string, { command?: string; env?: Record<string, string> }>;
			};
			assert.strictEqual(saved.mcpServers.context7.command, 'npx');
			assert.strictEqual(saved.mcpServers.context7.env?.API_KEY, 'secret');
		});
	});

	test('saveMcpServer writes disabled entries to workspace manager file', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'mcp-config.json');
			const disabledConfigPath = path.join(root, '.copilot-workspace-manager', 'mcp-config.disabled.json');

			const result = saveMcpServer(configPath, disabledConfigPath, {
				id: 'remote',
				transport: 'http',
				command: '',
				args: [],
				url: 'https://example.test/mcp',
				env: [],
				enabledTools: [],
				disabledTools: [],
				enabled: false,
			});

			assert.strictEqual(result.ok, true);
			const saved = JSON.parse(fs.readFileSync(disabledConfigPath, 'utf8')) as {
				mcpServers: Record<string, { url?: string }>;
			};
			assert.strictEqual(saved.mcpServers.remote.url, 'https://example.test/mcp');
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
							a: { type: 'stdio', command: 'a' },
							b: { type: 'stdio', command: 'b' },
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
							c: { type: 'stdio', command: 'c' },
						},
					},
					null,
					2,
				),
				'utf8',
			);

			assert.strictEqual(deleteMcpServer(configPath, disabledConfigPath, 'a'), true);
			const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
				mcpServers: Record<string, unknown>;
			};
			assert.ok(!('a' in saved.mcpServers));
			assert.ok('b' in saved.mcpServers);
			assert.strictEqual(deleteMcpServer(configPath, disabledConfigPath, 'c'), true);
			const savedDisabled = JSON.parse(fs.readFileSync(disabledConfigPath, 'utf8')) as {
				mcpServers: Record<string, unknown>;
			};
			assert.ok(!('c' in savedDisabled.mcpServers));
		});
	});

	test('validateMcpModel rejects mutually exclusive tools', () => {
		const result = validateMcpModel({
			id: 'github',
			transport: 'stdio',
			command: 'gh',
			args: [],
			url: '',
			env: [],
			enabledTools: ['a'],
			disabledTools: ['b'],
			enabled: true,
		}, []);

		assert.strictEqual(result.ok, false);
		assert.ok(result.errors.includes('toolsMutuallyExclusive'));
	});
});

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
							remote: {
								type: 'http',
								url: 'https://example.test/mcp',
								disabled: true,
							},
						},
					},
					null,
					2,
				),
				'utf8',
			);

			const models = listMcpFormModels(configPath);

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

			const result = saveMcpServer(configPath, {
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

	test('deleteMcpServer removes target JSON entry', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'mcp-config.json');
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

			assert.strictEqual(deleteMcpServer(configPath, 'a'), true);
			const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
				mcpServers: Record<string, unknown>;
			};
			assert.ok(!('a' in saved.mcpServers));
			assert.ok('b' in saved.mcpServers);
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

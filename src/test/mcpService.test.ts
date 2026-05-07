import * as assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	getDisabledMcpConfigPath,
	getMcpConfigPath,
	parseMcpServers,
	readMcpServers,
	toggleMcpServer,
} from '../services/mcpService';

function withTempDir(run: (root: string) => void): void {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-service-'));
	try {
		run(tempDir);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

suite('MCP service', () => {
	test('parses JSON MCP servers in order', () => {
		const input = JSON.stringify({
			servers: {
				alpha: { type: 'stdio', command: 'a' },
				beta: { type: 'http', url: 'https://example.test' },
			},
		});
		const servers = parseMcpServers(input, true);
		assert.deepStrictEqual(
			servers.map((server) => server.id),
			['alpha', 'beta'],
		);
		assert.ok(servers.every((server) => server.enabled));
	});

	test('moves MCP entry between enabled and disabled config files', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'mcp-config.json');
			const disabledConfigPath = path.join(root, '.copilot-workspace-manager', 'mcp-config.disabled.json');
			fs.mkdirSync(path.dirname(disabledConfigPath), { recursive: true });
			fs.writeFileSync(
				configPath,
				JSON.stringify({
					mcpServers: {
						alpha: { type: 'stdio', command: 'a' },
					},
				}, null, 2),
				'utf8',
			);

			assert.strictEqual(toggleMcpServer(configPath, disabledConfigPath, 'alpha'), true);

			const enabledAfterDisable = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { mcpServers: Record<string, unknown> };
			const disabledAfterDisable = JSON.parse(fs.readFileSync(disabledConfigPath, 'utf8')) as { mcpServers: Record<string, unknown> };
			assert.deepStrictEqual(Object.keys(enabledAfterDisable.mcpServers), []);
			assert.deepStrictEqual(Object.keys(disabledAfterDisable.mcpServers), ['alpha']);

			assert.strictEqual(toggleMcpServer(configPath, disabledConfigPath, 'alpha'), true);

			const enabledAfterEnable = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { mcpServers: Record<string, unknown> };
			const disabledAfterEnable = JSON.parse(fs.readFileSync(disabledConfigPath, 'utf8')) as { mcpServers: Record<string, unknown> };
			assert.deepStrictEqual(Object.keys(enabledAfterEnable.mcpServers), ['alpha']);
			assert.deepStrictEqual(Object.keys(disabledAfterEnable.mcpServers), []);
		});
	});

	test('reads enabled and disabled MCP servers in case-insensitive A-Z order', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'mcp-config.json');
			const disabledConfigPath = path.join(root, '.copilot-workspace-manager', 'mcp-config.disabled.json');
			fs.mkdirSync(path.dirname(disabledConfigPath), { recursive: true });
			fs.writeFileSync(
				configPath,
				JSON.stringify({
					mcpServers: {
						zeta: { type: 'stdio', command: 'z' },
						Alpha: { type: 'stdio', command: 'a' },
					},
				}, null, 2),
				'utf8',
			);
			fs.writeFileSync(
				disabledConfigPath,
				JSON.stringify({
					mcpServers: {
						beta: { type: 'stdio', command: 'b' },
					},
				}, null, 2),
				'utf8',
			);

			const servers = readMcpServers(configPath, disabledConfigPath);
			assert.deepStrictEqual(servers.map((server) => `${server.id}:${server.enabled}`), ['Alpha:true', 'beta:false', 'zeta:true']);
		});
	});

	test('reads plugin MCP servers after regular entries and marks them readonly', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'mcp-config.json');
			const disabledConfigPath = path.join(root, '.copilot-workspace-manager', 'mcp-config.disabled.json');
			const pluginRoot = path.join(root, 'installed-plugins', 'marketplace', 'plugin-a');
			fs.mkdirSync(path.dirname(disabledConfigPath), { recursive: true });
			fs.mkdirSync(pluginRoot, { recursive: true });
			fs.writeFileSync(
				configPath,
				JSON.stringify({
					mcpServers: {
						alpha: { type: 'stdio', command: 'a' },
					},
				}, null, 2),
				'utf8',
			);
			fs.writeFileSync(
				path.join(pluginRoot, 'plugin.json'),
				JSON.stringify({
					name: 'plugin-a',
					mcpServers: {
						zeta: { type: 'http', url: 'https://example.test/zeta' },
						beta: { type: 'http', url: 'https://example.test/beta' },
					},
				}, null, 2),
				'utf8',
			);

			const servers = readMcpServers(configPath, disabledConfigPath);
			assert.deepStrictEqual(
				servers.map((server) => `${server.id}:${server.sourceLabel ?? 'regular'}`),
				['alpha:regular', 'beta:Plugin MCP', 'zeta:Plugin MCP'],
			);
			assert.strictEqual(servers[1].readOnly, true);
			assert.ok(servers[1].entryId?.startsWith('plugin:'));
		});
	});

	test('reads plugin MCP config from default candidate file when manifest omits mcpServers', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'mcp-config.json');
			const disabledConfigPath = path.join(root, '.copilot-workspace-manager', 'mcp-config.disabled.json');
			const pluginRoot = path.join(root, 'installed-plugins', '_direct', 'plugin-b');
			fs.mkdirSync(path.dirname(disabledConfigPath), { recursive: true });
			fs.mkdirSync(pluginRoot, { recursive: true });
			fs.writeFileSync(path.join(configPath), JSON.stringify({ mcpServers: {} }, null, 2), 'utf8');
			fs.writeFileSync(
				path.join(pluginRoot, 'plugin.json'),
				JSON.stringify({ name: 'plugin-b' }, null, 2),
				'utf8',
			);
			fs.writeFileSync(
				path.join(pluginRoot, '.mcp.json'),
				JSON.stringify({
					mcpServers: {
						gamma: { type: 'stdio', command: 'g' },
					},
				}, null, 2),
				'utf8',
			);

			const servers = readMcpServers(configPath, disabledConfigPath);
			assert.strictEqual(servers[0].id, 'gamma');
			assert.strictEqual(servers[0].sourceLabel, 'Plugin MCP');
		});
	});

	test('uses Copilot user MCP config file name', () => {
		assert.strictEqual(
			getMcpConfigPath(path.join('home', '.copilot')),
			path.join('home', '.copilot', 'mcp-config.json'),
		);
	});

	test('uses workspace manager disabled MCP config file name', () => {
		assert.strictEqual(
			getDisabledMcpConfigPath(path.join('home', '.copilot')),
			path.join('home', '.copilot', '.copilot-workspace-manager', 'mcp-config.disabled.json'),
		);
	});
});

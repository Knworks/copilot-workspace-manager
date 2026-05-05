import * as assert from 'assert';
import path from 'path';
import { getMcpConfigPath, parseMcpServers, toggleMcpServer } from '../services/mcpService';

suite('MCP service', () => {
	test('parses JSON MCP servers in order', () => {
		const input = JSON.stringify({
			servers: {
				alpha: { type: 'stdio', command: 'a' },
				beta: { type: 'http', url: 'https://example.test' },
			},
		});
		const servers = parseMcpServers(input);
		assert.deepStrictEqual(
			servers.map((server) => server.id),
			['alpha', 'beta'],
		);
		assert.ok(servers.every((server) => server.enabled));
	});

	test('returns false for deprecated TOML toggle operation', () => {
		assert.strictEqual(toggleMcpServer('mcp-config.json', 'alpha'), false);
	});

	test('uses Copilot user MCP config file name', () => {
		assert.strictEqual(
			getMcpConfigPath(path.join('home', '.copilot')),
			path.join('home', '.copilot', 'mcp-config.json'),
		);
	});
});

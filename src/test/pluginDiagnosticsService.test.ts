import * as assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { listPluginDiagnostics } from '../services/pluginDiagnosticsService';

function withTempDir(run: (root: string) => void): void {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-diag-'));
	try {
		run(tempDir);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

suite('Plugin diagnostics service', () => {
	test('lists installed plugins and detects provided components and conflicts', () => {
		withTempDir((root) => {
			const homeDir = path.join(root, 'home');
			const workspaceRoot = path.join(root, 'workspace');
			const pluginRoot = path.join(
				homeDir,
				'.copilot',
				'installed-plugins',
				'_direct',
				'test-plugin',
			);
			fs.mkdirSync(path.join(pluginRoot, '.plugin'), { recursive: true });
			fs.mkdirSync(path.join(pluginRoot, 'agents'), { recursive: true });
			fs.mkdirSync(path.join(pluginRoot, 'skills', 'review-helper'), { recursive: true });
			fs.mkdirSync(path.join(pluginRoot, 'commands'), { recursive: true });
			fs.mkdirSync(path.join(workspaceRoot, '.github', 'agents'), { recursive: true });
			fs.mkdirSync(path.join(workspaceRoot, '.github', 'skills', 'review-helper'), { recursive: true });
			fs.mkdirSync(path.join(homeDir, '.copilot'), { recursive: true });
			fs.writeFileSync(
				path.join(pluginRoot, '.plugin', 'plugin.json'),
				JSON.stringify(
					{
						name: 'test-basic-plugin',
						description: 'Test plugin for Copilot Workspace Manager.',
						version: '1.0.0',
						author: { name: 'Kaz' },
						commands: 'commands',
						lspServers: {
							tsserver: {
								command: 'typescript-language-server',
							},
						},
						keywords: ['review'],
						category: 'tools',
						tags: ['test'],
					},
					null,
					2,
				),
				'utf8',
			);
			fs.writeFileSync(
				path.join(pluginRoot, 'agents', 'reviewer.agent.md'),
				'---\nname: reviewer\ndescription: Reviews source code.\n---\n',
				'utf8',
			);
			fs.writeFileSync(
				path.join(pluginRoot, 'skills', 'review-helper', 'SKILL.md'),
				'---\nname: review-helper\ndescription: Helps review implementation quality.\n---\n',
				'utf8',
			);
			fs.writeFileSync(
				path.join(pluginRoot, 'commands', 'release-note.md'),
				'---\ndescription: Creates release notes.\n---\n',
				'utf8',
			);
			fs.writeFileSync(
				path.join(pluginRoot, 'hooks.json'),
				JSON.stringify(
					{
						version: 1,
						hooks: {
							sessionStart: [{ type: 'command', powershell: 'Write-Output start' }],
							userPromptSubmitted: [{ type: 'command', powershell: 'Write-Output prompt' }],
						},
					},
					null,
					2,
				),
				'utf8',
			);
			fs.writeFileSync(
				path.join(pluginRoot, '.mcp.json'),
				JSON.stringify(
					{
						mcpServers: {
							alpha: { type: 'stdio', tools: ['*'] },
						},
					},
					null,
					2,
				),
				'utf8',
			);
			fs.writeFileSync(
				path.join(workspaceRoot, '.github', 'agents', 'reviewer.agent.md'),
				'---\nname: reviewer\n---\n',
				'utf8',
			);
			fs.writeFileSync(
				path.join(workspaceRoot, '.github', 'skills', 'review-helper', 'SKILL.md'),
				'---\nname: review-helper\n---\n',
				'utf8',
			);
			fs.writeFileSync(
				path.join(homeDir, '.copilot', 'mcp-config.json'),
				JSON.stringify(
					{
						mcpServers: {
							alpha: { type: 'stdio', tools: ['*'] },
						},
					},
					null,
					2,
				),
				'utf8',
			);

			const plugins = listPluginDiagnostics(homeDir, workspaceRoot);

			assert.strictEqual(plugins.length, 1);
			assert.strictEqual(plugins[0].name, 'test-basic-plugin');
			assert.strictEqual(plugins[0].installKind, 'Direct');
			assert.strictEqual(plugins[0].state, 'Enabled');
			assert.strictEqual(plugins[0].agents.length, 1);
			assert.strictEqual(plugins[0].agents[0].status, 'Conflict');
			assert.strictEqual(plugins[0].skills.length, 1);
			assert.strictEqual(plugins[0].skills[0].status, 'Conflict');
			assert.strictEqual(plugins[0].commands.length, 1);
			assert.strictEqual(plugins[0].hooks.length, 2);
			assert.strictEqual(plugins[0].mcpServers.length, 1);
			assert.strictEqual(plugins[0].mcpServers[0].status, 'Overridden');
			assert.strictEqual(plugins[0].lspServers.length, 1);
			assert.ok(
				plugins[0].diagnostics.some((entry) => entry.message === 'Direct plugin install detected.'),
			);
			assert.ok(
				plugins[0].diagnostics.some((entry) => entry.message === 'Plugin components are read-only.'),
			);
			assert.ok(
				plugins[0].diagnostics.some((entry) => entry.message === 'Agent conflict: reviewer'),
			);
			assert.ok(
				plugins[0].diagnostics.some((entry) => entry.message === 'Skill conflict: review-helper'),
			);
			assert.ok(
				plugins[0].diagnostics.some((entry) => entry.message === 'MCP override: alpha'),
			);
		});
	});

	test('uses fallback installed-plugins path and reports manifest errors', () => {
		withTempDir((root) => {
			const homeDir = path.join(root, 'home');
			const pluginRoot = path.join(
				homeDir,
				'.copilot',
				'state',
				'installed-plugins',
				'legacy-plugin',
			);
			fs.mkdirSync(pluginRoot, { recursive: true });

			const plugins = listPluginDiagnostics(homeDir, undefined);

			assert.strictEqual(plugins.length, 1);
			assert.strictEqual(plugins[0].state, 'Unknown');
			assert.ok(
				plugins[0].diagnostics.some((entry) => entry.message === 'Manifest not found'),
			);
		});
	});
});

import * as assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	disableAgentByName,
	enableAgentByName,
	listAgentManagerRecords,
} from '../services/agentManagerService';
import { AgentLocation } from '../services/agentLocations';

function withTempDir(run: (root: string) => void): void {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-manager-'));
	try {
		run(tempDir);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

suite('Agent manager service', () => {
	test('listAgentManagerRecords reads .agent.md frontmatter details', () => {
		withTempDir((root) => {
			const agentsDir = path.join(root, '.github', 'agents');
			fs.mkdirSync(agentsDir, { recursive: true });
			fs.writeFileSync(
				path.join(agentsDir, 'reviewer.agent.md'),
				[
					'---',
					'name: reviewer',
					'description: Reviews code',
					'model: gpt-5.4',
					'tools: read, edit',
					'mcp-servers: github',
					'---',
					'Review instructions.',
				].join('\n'),
				'utf8',
			);
			const location: AgentLocation = {
				kind: 'project',
				label: 'Workspace Agents',
				rootPath: agentsDir,
				priority: 1,
			};

			const records = listAgentManagerRecords('', [location]);

			assert.strictEqual(records.length, 1);
			assert.strictEqual(records[0].name, 'reviewer');
			assert.strictEqual(records[0].description, 'Reviews code');
			assert.strictEqual(records[0].model, 'gpt-5.4');
			assert.strictEqual(records[0].tools, 'read, edit');
			assert.strictEqual(records[0].mcpServers, 'github');
			assert.strictEqual(records[0].readonly, false);
		});
	});

	test('plugin agents are marked readonly', () => {
		withTempDir((root) => {
			const agentsDir = path.join(root, '.copilot', 'installed-plugins', 'plugin', 'agents');
			fs.mkdirSync(agentsDir, { recursive: true });
			fs.writeFileSync(path.join(agentsDir, 'plugin.agent.md'), '---\nname: plugin\n---\n', 'utf8');
			const location: AgentLocation = {
				kind: 'plugin',
				label: 'Plugin Agents',
				rootPath: agentsDir,
				priority: 3,
			};

			const records = listAgentManagerRecords('', [location]);

			assert.strictEqual(records.length, 1);
			assert.strictEqual(records[0].readonly, true);
		});
	});

	test('enable and disable are no-ops for frontmatter-managed agents', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'config.json');
			fs.writeFileSync(configPath, '{"ok":true}', 'utf8');

			disableAgentByName(root, configPath, 'reviewer');
			const result = enableAgentByName(root, configPath, 'reviewer');

			assert.strictEqual(result.overwritten, false);
			assert.strictEqual(fs.readFileSync(configPath, 'utf8'), '{"ok":true}');
		});
	});
});

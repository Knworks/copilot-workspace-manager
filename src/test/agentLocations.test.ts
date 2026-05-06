import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import path from 'path';
import {
	findAgentLocationForPath,
	getAgentLocations,
} from '../services/agentLocations';

suite('Agent locations', () => {
	test('returns workspace and user agent locations in priority order', () => {
		const homeDir = path.join('home');
		const projectRoot = path.join('repo');

		const locations = getAgentLocations(homeDir, projectRoot);

		assert.deepStrictEqual(
			locations.map((location) => location.kind),
			['project', 'project', 'user'],
		);
		assert.strictEqual(locations[0].rootPath, path.join(projectRoot, '.github', 'agents'));
		assert.strictEqual(locations[0].createPath, path.join(projectRoot, '.github', 'agents'));
		assert.strictEqual(locations[1].rootPath, path.join(projectRoot, '.claude', 'agents'));
		assert.strictEqual(locations[1].createPath, path.join(projectRoot, '.claude', 'agents'));
		assert.strictEqual(locations[2].rootPath, path.join(homeDir, '.copilot', 'agents'));
	});

	test('findAgentLocationForPath resolves paths under an agent root', () => {
		const homeDir = path.join('home');
		const projectRoot = path.join('repo');
		const locations = getAgentLocations(homeDir, projectRoot);
		const agentPath = path.join(projectRoot, '.github', 'agents', 'reviewer.agent.md');

		const location = findAgentLocationForPath(agentPath, locations);

		assert.strictEqual(location?.kind, 'project');
	});

	test('reads plugin agents from nested marketplace plugin manifest directory', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-agent-locations-'));
		try {
			const homeDir = tempDir;
			const pluginRoot = path.join(
				homeDir,
				'.copilot',
				'installed-plugins',
				'marketplace',
				'example-plugin',
			);
			const agentsRoot = path.join(pluginRoot, 'custom-agents');
			fs.mkdirSync(agentsRoot, { recursive: true });
			fs.writeFileSync(
				path.join(pluginRoot, 'plugin.json'),
				JSON.stringify({ agents: 'custom-agents' }),
				'utf8',
			);

			const locations = getAgentLocations(homeDir, undefined);

			assert.ok(
				locations.some(
					(location) =>
						location.kind === 'plugin' && location.rootPath === agentsRoot,
				),
			);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('defaults plugin agents to agents directory under manifest directory', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-agent-locations-'));
		try {
			const homeDir = tempDir;
			const pluginRoot = path.join(
				homeDir,
				'.copilot',
				'installed-plugins',
				'_direct',
				'source-id',
			);
			const agentsRoot = path.join(pluginRoot, 'agents');
			fs.mkdirSync(agentsRoot, { recursive: true });
			fs.writeFileSync(
				path.join(pluginRoot, 'plugin.json'),
				JSON.stringify({ name: 'plugin-with-default-agents' }),
				'utf8',
			);

			const locations = getAgentLocations(homeDir, undefined);

			assert.ok(
				locations.some(
					(location) =>
						location.kind === 'plugin' && location.rootPath === agentsRoot,
				),
			);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('uses the directory containing plugin.json as the plugin root', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-agent-locations-'));
		try {
			const homeDir = tempDir;
			const manifestRoot = path.join(
				homeDir,
				'.copilot',
				'installed-plugins',
				'marketplace',
				'plugin-name',
				'.codex-plugin',
			);
			const agentsRoot = path.join(manifestRoot, 'agents');
			fs.mkdirSync(agentsRoot, { recursive: true });
			fs.writeFileSync(
				path.join(manifestRoot, 'plugin.json'),
				JSON.stringify({ name: 'nested-plugin-root' }),
				'utf8',
			);

			const locations = getAgentLocations(homeDir, undefined);

			assert.ok(
				locations.some(
					(location) =>
						location.kind === 'plugin' && location.rootPath === agentsRoot,
				),
			);
			assert.ok(
				!locations.some(
					(location) =>
						location.kind === 'plugin' &&
						location.rootPath === path.join(
							homeDir,
							'.copilot',
							'installed-plugins',
							'marketplace',
							'plugin-name',
							'agents',
						),
				),
			);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

import * as assert from 'assert';
import path from 'path';
import {
	findAgentLocationForPath,
	getAgentLocations,
} from '../services/agentLocations';

suite('Agent locations', () => {
	test('returns Copilot project user and plugin agent locations in priority order', () => {
		const homeDir = path.join('home');
		const projectRoot = path.join('repo');

		const locations = getAgentLocations(homeDir, projectRoot);

		assert.deepStrictEqual(
			locations.map((location) => location.kind),
			['project', 'user', 'plugin'],
		);
		assert.strictEqual(locations[0].rootPath, path.join(projectRoot, '.github', 'agents'));
		assert.strictEqual(locations[0].createPath, path.join(projectRoot, '.github', 'agents'));
		assert.strictEqual(locations[1].rootPath, path.join(homeDir, '.copilot', 'agents'));
		assert.strictEqual(
			locations[2].rootPath,
			path.join(homeDir, '.copilot', 'installed-plugins'),
		);
	});

	test('findAgentLocationForPath resolves paths under an agent root', () => {
		const homeDir = path.join('home');
		const projectRoot = path.join('repo');
		const locations = getAgentLocations(homeDir, projectRoot);
		const agentPath = path.join(projectRoot, '.github', 'agents', 'reviewer.agent.md');

		const location = findAgentLocationForPath(agentPath, locations);

		assert.strictEqual(location?.kind, 'project');
	});
});

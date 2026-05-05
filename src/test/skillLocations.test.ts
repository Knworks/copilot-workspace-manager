import * as assert from 'assert';
import path from 'path';
import {
	findSkillLocationForPath,
	getSkillLocations,
} from '../services/skillLocations';

suite('Skill locations', () => {
	test('returns Copilot project user and plugin skill locations in priority order', () => {
		const homeDir = path.join('home');
		const projectRoot = path.join('repo');

		const locations = getSkillLocations(homeDir, projectRoot);

		assert.deepStrictEqual(
			locations.map((location) => location.kind),
			['project', 'user', 'plugin'],
		);
		assert.strictEqual(locations[0].rootPath, path.join(projectRoot, '.github', 'skills'));
		assert.strictEqual(locations[0].createPath, path.join(projectRoot, '.github', 'skills'));
		assert.strictEqual(locations[1].rootPath, path.join(homeDir, '.copilot', 'skills'));
		assert.strictEqual(
			locations[2].rootPath,
			path.join(homeDir, '.copilot', 'installed-plugins'),
		);
	});

	test('findSkillLocationForPath resolves paths under a skill root', () => {
		const homeDir = path.join('home');
		const projectRoot = path.join('repo');
		const locations = getSkillLocations(homeDir, projectRoot);
		const skillPath = path.join(homeDir, '.copilot', 'skills', 'review', 'SKILL.md');

		const location = findSkillLocationForPath(skillPath, locations);

		assert.strictEqual(location?.kind, 'user');
	});
});

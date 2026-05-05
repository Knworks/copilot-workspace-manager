import * as assert from 'assert';
import path from 'path';
import {
	findSkillLocationForPath,
	getSkillLocations,
} from '../services/skillLocations';

suite('Skill locations', () => {
	test('returns Copilot project and user skill locations in priority order', () => {
		const homeDir = path.join('home');
		const projectRoot = path.join('repo');

		const locations = getSkillLocations(homeDir, projectRoot);

		assert.deepStrictEqual(
			locations.map((location) => location.kind),
			['project', 'project', 'project', 'user', 'user', 'user'],
		);
		assert.ok(
			locations.slice(0, 3).some((location) => location.rootPath === path.join(projectRoot, '.github', 'skills')),
		);
		assert.ok(
			locations.slice(3).some((location) => location.rootPath === path.join(homeDir, '.copilot', 'skills')),
		);
		assert.ok(
			locations.slice(3).some((location) => location.rootPath === path.join(homeDir, '.claude', 'skills')),
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

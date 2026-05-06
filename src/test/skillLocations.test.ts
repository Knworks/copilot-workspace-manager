import * as assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	findSkillLocationForPath,
	getSkillLocations,
} from '../services/skillLocations';

function withTempDir(run: (root: string) => void): void {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-locations-'));
	try {
		run(tempDir);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

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

	test('reads plugin skills from nested marketplace plugin manifest directory', () => {
		withTempDir((root) => {
			const homeDir = path.join(root, 'home');
			const pluginRoot = path.join(
				homeDir,
				'.copilot',
				'installed-plugins',
				'marketplace',
				'sample-plugin',
			);
			const skillsRoot = path.join(pluginRoot, 'custom-skills');
			fs.mkdirSync(skillsRoot, { recursive: true });
			fs.writeFileSync(
				path.join(pluginRoot, 'plugin.json'),
				JSON.stringify({ skills: 'custom-skills' }, null, 2),
				'utf8',
			);

			const locations = getSkillLocations(homeDir, undefined);

			assert.ok(
				locations.some(
					(location) => location.kind === 'plugin' && location.rootPath === skillsRoot,
				),
			);
		});
	});

	test('defaults plugin skills to skills directory under manifest directory', () => {
		withTempDir((root) => {
			const homeDir = path.join(root, 'home');
			const pluginRoot = path.join(
				homeDir,
				'.copilot',
				'installed-plugins',
				'_direct',
				'source-id',
			);
			const skillsRoot = path.join(pluginRoot, 'skills');
			fs.mkdirSync(skillsRoot, { recursive: true });
			fs.writeFileSync(
				path.join(pluginRoot, 'plugin.json'),
				JSON.stringify({ name: 'sample-plugin' }, null, 2),
				'utf8',
			);

			const locations = getSkillLocations(homeDir, undefined);

			assert.ok(
				locations.some(
					(location) => location.kind === 'plugin' && location.rootPath === skillsRoot,
				),
			);
		});
	});

	test('uses the directory containing plugin.json as the plugin root', () => {
		withTempDir((root) => {
			const homeDir = path.join(root, 'home');
			const pluginContainer = path.join(
				homeDir,
				'.copilot',
				'installed-plugins',
				'marketplace',
				'sample-plugin',
			);
			const manifestRoot = path.join(pluginContainer, '.codex-plugin');
			const skillsRoot = path.join(manifestRoot, 'skills');
			fs.mkdirSync(skillsRoot, { recursive: true });
			fs.writeFileSync(
				path.join(manifestRoot, 'plugin.json'),
				JSON.stringify({ name: 'sample-plugin' }, null, 2),
				'utf8',
			);

			const locations = getSkillLocations(homeDir, undefined);

			assert.ok(
				locations.some(
					(location) => location.kind === 'plugin' && location.rootPath === skillsRoot,
				),
			);
			assert.ok(
				!locations.some(
					(location) =>
						location.kind === 'plugin' &&
						location.rootPath === path.join(pluginContainer, 'skills'),
				),
			);
		});
	});
});

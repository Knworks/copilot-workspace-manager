import * as assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	listSkillRecords,
	readSkillEnabledByPath,
	readSkillMetadata,
	setSkillEnabled,
} from '../services/skillConfigService';
import { SkillLocation } from '../services/skillLocations';

function withTempDir(run: (root: string) => void): void {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-config-'));
	try {
		run(tempDir);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

suite('Skill config service', () => {
	test('readSkillMetadata extracts name and description from frontmatter', () => {
		withTempDir((root) => {
			const skillPath = path.join(root, 'SKILL.md');
			fs.writeFileSync(
				skillPath,
				'---\nname: reviewer\ndescription: "Reviews code"\n---\n',
				'utf8',
			);

			const metadata = readSkillMetadata(skillPath);

			assert.strictEqual(metadata.name, 'reviewer');
			assert.strictEqual(metadata.description, 'Reviews code');
		});
	});

	test('listSkillRecords reads skills from configured locations', () => {
		withTempDir((root) => {
			const skillDir = path.join(root, 'skills', 'reviewer');
			fs.mkdirSync(skillDir, { recursive: true });
			const skillPath = path.join(skillDir, 'SKILL.md');
			fs.writeFileSync(
				skillPath,
				'---\nname: reviewer\ndescription: Reviews code\n---\n',
				'utf8',
			);
			const location: SkillLocation = {
				kind: 'project',
				label: 'Workspace Skills',
				rootPath: path.join(root, 'skills'),
				priority: 1,
			};

			const records = listSkillRecords(path.join(root, 'config.json'), [location]);

			assert.strictEqual(records.length, 1);
			assert.strictEqual(records[0].name, 'reviewer');
			assert.strictEqual(records[0].enabled, true);
		});
	});

	test('skill enable state is driven by settings.json disabledSkills', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'config.json');
			const settingsPath = path.join(root, 'settings.json');
			fs.writeFileSync(
				settingsPath,
				JSON.stringify({ disabledSkills: ['reviewer'] }, null, 2),
				'utf8',
			);
			const skillDir = path.join(root, 'skills', 'reviewer');
			fs.mkdirSync(skillDir, { recursive: true });
			fs.writeFileSync(
				path.join(skillDir, 'SKILL.md'),
				'---\nname: reviewer\ndescription: Reviews code\n---\n',
				'utf8',
			);
			const location: SkillLocation = {
				kind: 'project',
				label: 'Workspace Skills',
				rootPath: path.join(root, 'skills'),
				priority: 1,
			};

			const records = listSkillRecords(configPath, [location]);

			assert.strictEqual(records[0].enabled, false);
			assert.deepStrictEqual([...readSkillEnabledByPath(configPath).entries()], [['reviewer', false]]);
		});
	});

	test('setSkillEnabled adds and removes disabledSkills entries in settings.json', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'config.json');
			const settingsPath = path.join(root, 'settings.json');
			const skillDir = path.join(root, 'skills', 'reviewer');
			fs.mkdirSync(skillDir, { recursive: true });
			const skillPath = path.join(skillDir, 'SKILL.md');
			fs.writeFileSync(
				skillPath,
				'---\nname: reviewer\ndescription: Reviews code\n---\n',
				'utf8',
			);

			setSkillEnabled(configPath, skillPath, false);
			let saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as { disabledSkills: string[] };
			assert.deepStrictEqual(saved.disabledSkills, ['reviewer']);

			setSkillEnabled(configPath, skillPath, true);
			saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as { disabledSkills: string[] };
			assert.deepStrictEqual(saved.disabledSkills, []);
		});
	});
});

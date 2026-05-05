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

	test('skill enable state persistence is not managed', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'config.json');

			setSkillEnabled(configPath, path.join(root, 'skills', 'reviewer', 'SKILL.md'), false);

			assert.deepStrictEqual([...readSkillEnabledByPath(configPath).entries()], []);
			assert.strictEqual(fs.existsSync(configPath), false);
		});
	});
});

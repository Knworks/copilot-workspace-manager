import * as assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	getSyncStatePath,
	removeSyncStateEntry,
	syncCoreInstructionsBidirectional,
	syncDirectoryBidirectional,
} from '../services/syncService';

function withTempDir(run: (root: string) => void): void {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-workspace-manager-'));
	try {
		run(tempDir);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

function setMtime(targetPath: string, mtimeMs: number): void {
	const time = new Date(mtimeMs);
	fs.utimesSync(targetPath, time, time);
}

suite('Sync service', () => {
	test('syncDirectoryBidirectional copies newer file to older side', () => {
		withTempDir((root) => {
			const codexRoot = path.join(root, '.codex');
			const codexDir = path.join(codexRoot, 'prompts');
			const targetDir = path.join(root, 'sync');
			fs.mkdirSync(codexDir, { recursive: true });
			fs.mkdirSync(targetDir, { recursive: true });

			const codexFile = path.join(codexDir, 'note.md');
			const targetFile = path.join(targetDir, 'note.md');
			fs.writeFileSync(codexFile, 'from-codex', 'utf8');
			fs.writeFileSync(targetFile, 'from-target', 'utf8');

			setMtime(codexFile, 2_000);
			setMtime(targetFile, 1_000);

			syncDirectoryBidirectional('prompts', codexRoot, codexDir, targetDir);

			assert.strictEqual(fs.readFileSync(targetFile, 'utf8'), 'from-codex');
		});
	});

	test('syncDirectoryBidirectional copies new files to missing side', () => {
		withTempDir((root) => {
			const codexRoot = path.join(root, '.codex');
			const codexDir = path.join(codexRoot, 'skills');
			const targetDir = path.join(root, 'sync');
			fs.mkdirSync(codexDir, { recursive: true });

			const codexFile = path.join(codexDir, 'new.md');
			fs.writeFileSync(codexFile, 'new', 'utf8');

			syncDirectoryBidirectional('skills', codexRoot, codexDir, targetDir);

			assert.strictEqual(
				fs.readFileSync(path.join(targetDir, 'new.md'), 'utf8'),
				'new',
			);
		});
	});

	test('syncDirectoryBidirectional copies target-only files to codex', () => {
		withTempDir((root) => {
			const codexRoot = path.join(root, '.codex');
			const codexDir = path.join(codexRoot, 'skills');
			const targetDir = path.join(root, 'sync');
			fs.mkdirSync(targetDir, { recursive: true });

			const targetFile = path.join(targetDir, 'from-target.md');
			fs.writeFileSync(targetFile, 'target', 'utf8');

			syncDirectoryBidirectional('skills', codexRoot, codexDir, targetDir);

			assert.strictEqual(
				fs.readFileSync(path.join(codexDir, 'from-target.md'), 'utf8'),
				'target',
			);
		});
	});

	test('syncDirectoryBidirectional deletes files removed on one side', () => {
		withTempDir((root) => {
			const codexRoot = path.join(root, '.codex');
			const codexDir = path.join(codexRoot, 'templates');
			const targetDir = path.join(root, 'sync');
			fs.mkdirSync(codexDir, { recursive: true });

			const codexFile = path.join(codexDir, 'old.md');
			fs.writeFileSync(codexFile, 'old', 'utf8');

			syncDirectoryBidirectional('templates', codexRoot, codexDir, targetDir);
			assert.ok(fs.existsSync(path.join(targetDir, 'old.md')));
			const statePath = getSyncStatePath(codexRoot);
			assert.ok(fs.existsSync(statePath));
			const initialState = JSON.parse(
				fs.readFileSync(statePath, 'utf8'),
			) as Record<string, Record<string, unknown>>;
			assert.ok(initialState.templates);
			assert.ok(initialState.templates['old.md']);

			fs.rmSync(codexFile);
			syncDirectoryBidirectional('templates', codexRoot, codexDir, targetDir);

			assert.ok(!fs.existsSync(path.join(targetDir, 'old.md')));
			assert.ok(!fs.existsSync(targetDir));
			const finalState = JSON.parse(
				fs.readFileSync(statePath, 'utf8'),
			) as Record<string, Record<string, unknown>>;
			assert.ok(!finalState.templates?.['old.md']);
		});
	});

	test('syncDirectoryBidirectional skips hidden paths', () => {
		withTempDir((root) => {
			const codexRoot = path.join(root, '.codex');
			const codexDir = path.join(codexRoot, 'prompts');
			const targetDir = path.join(root, 'sync');
			const hiddenDir = path.join(codexDir, '.hidden');
			fs.mkdirSync(hiddenDir, { recursive: true });
			fs.writeFileSync(path.join(hiddenDir, 'secret.md'), 'secret', 'utf8');

			syncDirectoryBidirectional('prompts', codexRoot, codexDir, targetDir);

			assert.ok(!fs.existsSync(path.join(targetDir, '.hidden', 'secret.md')));
		});
	});

	test('syncDirectoryBidirectional excludes .copilot-workspace-manager paths', () => {
		withTempDir((root) => {
			const codexRoot = path.join(root, '.codex');
			const codexDir = path.join(codexRoot, 'prompts');
			const targetDir = path.join(root, 'sync');
			const metaDir = path.join(codexDir, '.copilot-workspace-manager');
			fs.mkdirSync(metaDir, { recursive: true });
			fs.writeFileSync(path.join(metaDir, 'meta.json'), 'meta', 'utf8');

			syncDirectoryBidirectional('prompts', codexRoot, codexDir, targetDir);
			assert.ok(
				!fs.existsSync(path.join(targetDir, '.copilot-workspace-manager', 'meta.json')),
			);
		});
	});

	test('syncDirectoryBidirectional records skipped files on copy error', () => {
		withTempDir((root) => {
			const codexRoot = path.join(root, '.codex');
			const codexDir = path.join(codexRoot, 'prompts');
			const targetDir = path.join(root, 'sync');
			fs.mkdirSync(codexDir, { recursive: true });
			fs.mkdirSync(targetDir, { recursive: true });

			const codexFile = path.join(codexDir, 'blocked.md');
			fs.writeFileSync(codexFile, 'blocked', 'utf8');
			fs.mkdirSync(path.join(targetDir, 'blocked.md'));

			const result = syncDirectoryBidirectional(
				'prompts',
				codexRoot,
				codexDir,
				targetDir,
			);

			assert.strictEqual(result.skipped.length, 1);
		});
	});

	test('syncCoreInstructionsBidirectional syncs repository and user instructions', () => {
		withTempDir((root) => {
			const workspaceRoot = path.join(root, 'workspace');
			const repositoryInstructionsDir = path.join(workspaceRoot, '.github');
			const copilotRoot = path.join(root, '.copilot');
			fs.mkdirSync(repositoryInstructionsDir, { recursive: true });
			fs.mkdirSync(copilotRoot, { recursive: true });
			const repositoryInstructions = path.join(
				repositoryInstructionsDir,
				'copilot-instructions.md',
			);
			const userInstructions = path.join(copilotRoot, 'copilot-instructions.md');
			fs.writeFileSync(repositoryInstructions, 'repository', 'utf8');
			fs.writeFileSync(userInstructions, 'user', 'utf8');
			setMtime(repositoryInstructions, 2_000);
			setMtime(userInstructions, 1_000);

			syncCoreInstructionsBidirectional(workspaceRoot, copilotRoot);

			assert.strictEqual(fs.readFileSync(userInstructions, 'utf8'), 'repository');
		});
	});

	test('removeSyncStateEntry removes tracked path from scope', () => {
		withTempDir((root) => {
			const codexRoot = path.join(root, '.codex');
			const codexDir = path.join(codexRoot, 'agents');
			const targetDir = path.join(root, 'sync-agents');
			fs.mkdirSync(codexDir, { recursive: true });
			fs.writeFileSync(path.join(codexDir, 'reviewer.toml'), 'x', 'utf8');

			syncDirectoryBidirectional('agents', codexRoot, codexDir, targetDir);
			const statePath = getSyncStatePath(codexRoot);
			const initialState = JSON.parse(
				fs.readFileSync(statePath, 'utf8'),
			) as Record<string, Record<string, unknown>>;
			assert.ok(initialState.agents?.['reviewer.toml']);

			removeSyncStateEntry(codexRoot, 'agents', 'reviewer.toml');
			const nextState = JSON.parse(
				fs.readFileSync(statePath, 'utf8'),
			) as Record<string, Record<string, unknown>>;
			assert.ok(!nextState.agents?.['reviewer.toml']);
		});
	});

});

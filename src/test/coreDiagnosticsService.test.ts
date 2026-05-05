import * as assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	addTrustedDirectory,
	buildAgentsLoadingChain,
	listTrustedDirectories,
	removeTrustedDirectory,
} from '../services/coreDiagnosticsService';

function withTempDir(run: (root: string) => void): void {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-diag-'));
	try {
		run(tempDir);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

suite('Core diagnostics service', () => {
	test('buildAgentsLoadingChain prefers user instructions over workspace instructions', () => {
		withTempDir((root) => {
			const homeDir = path.join(root, 'home');
			const copilotDir = path.join(homeDir, '.copilot');
			const workspaceRoot = path.join(root, 'workspace');
			fs.mkdirSync(path.join(workspaceRoot, '.github'), { recursive: true });
			fs.mkdirSync(copilotDir, { recursive: true });
			fs.writeFileSync(path.join(copilotDir, 'copilot-instructions.md'), 'user', 'utf8');
			fs.writeFileSync(path.join(workspaceRoot, '.github', 'copilot-instructions.md'), 'workspace', 'utf8');

			const nodes = buildAgentsLoadingChain(workspaceRoot, homeDir);

			assert.strictEqual(nodes[0].status, 'Active');
			assert.strictEqual(nodes[1].status, 'Skipped');
		});
	});

	test('buildAgentsLoadingChain marks missing workspace instructions', () => {
		withTempDir((root) => {
			const homeDir = path.join(root, 'home');
			const copilotDir = path.join(homeDir, '.copilot');
			const workspaceRoot = path.join(root, 'workspace');
			fs.mkdirSync(copilotDir, { recursive: true });
			fs.mkdirSync(workspaceRoot, { recursive: true });
			fs.writeFileSync(path.join(copilotDir, 'copilot-instructions.md'), 'user', 'utf8');

			const nodes = buildAgentsLoadingChain(workspaceRoot, homeDir);

			assert.strictEqual(nodes[0].status, 'Active');
			assert.strictEqual(nodes[1].status, 'Missing');
		});
	});

	test('trusted directories can be listed added and removed', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'config.json');
			const projectPath = path.join(root, 'project');
			fs.mkdirSync(projectPath, { recursive: true });

			addTrustedDirectory(configPath, projectPath);
			let trusted = listTrustedDirectories(configPath);
			assert.strictEqual(trusted.length, 1);
			assert.strictEqual(trusted[0].path, projectPath);
			assert.strictEqual(trusted[0].exists, true);

			assert.strictEqual(removeTrustedDirectory(configPath, projectPath), true);
			trusted = listTrustedDirectories(configPath);
			assert.strictEqual(trusted.length, 0);
		});
	});

	test('trusted directories read JSON trusted_folders', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'config.json');
			const projectPath = '\\\\?\\Z:\\copilot-workspace-manager-test\\missing-project';
			fs.writeFileSync(
				configPath,
				JSON.stringify({ trusted_folders: [projectPath] }, null, 2),
				'utf8',
			);

			const trusted = listTrustedDirectories(configPath);
			assert.strictEqual(trusted.length, 1);
			assert.strictEqual(trusted[0].path, projectPath);
			assert.strictEqual(trusted[0].exists, false);
		});
	});
});

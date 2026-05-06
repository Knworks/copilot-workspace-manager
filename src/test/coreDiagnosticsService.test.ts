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
			const settingsPath = path.join(root, 'settings.json');
			const projectPath = path.join(root, 'project');
			fs.mkdirSync(projectPath, { recursive: true });

			addTrustedDirectory(settingsPath, projectPath);
			let trusted = listTrustedDirectories(settingsPath);
			assert.strictEqual(trusted.length, 1);
			assert.strictEqual(trusted[0].path, projectPath);
			assert.strictEqual(trusted[0].exists, true);
			assert.strictEqual(trusted[0].sourceLabel, 'User Settings');
			assert.strictEqual(trusted[0].sourcePath, settingsPath);

			const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
				trustedFolders?: string[];
				trusted_folders?: string[];
			};
			assert.deepStrictEqual(saved.trustedFolders, [projectPath]);
			assert.strictEqual(saved.trusted_folders, undefined);

			assert.strictEqual(removeTrustedDirectory(settingsPath, projectPath), true);
			trusted = listTrustedDirectories(settingsPath);
			assert.strictEqual(trusted.length, 0);
		});
	});

	test('trusted directories read JSON trustedFolders from user and workspace settings', () => {
		withTempDir((root) => {
			const userSettingsPath = path.join(root, 'settings.json');
			const workspaceSettingsPath = path.join(root, '.github', 'copilot', 'settings.json');
			const userProjectPath = '\\\\?\\Z:\\copilot-workspace-manager-test\\missing-user-project';
			const workspaceProjectPath = '\\\\?\\Z:\\copilot-workspace-manager-test\\missing-workspace-project';
			fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
			fs.writeFileSync(
				userSettingsPath,
				JSON.stringify({ trustedFolders: [userProjectPath] }, null, 2),
				'utf8',
			);
			fs.writeFileSync(
				workspaceSettingsPath,
				JSON.stringify({ trustedFolders: [workspaceProjectPath] }, null, 2),
				'utf8',
			);

			const trusted = listTrustedDirectories(userSettingsPath, workspaceSettingsPath);
			assert.strictEqual(trusted.length, 2);
			assert.deepStrictEqual(
				trusted.map((entry) => ({
					path: entry.path,
					sourceLabel: entry.sourceLabel,
					sourcePath: entry.sourcePath,
					exists: entry.exists,
				})),
				[
					{
						path: userProjectPath,
						sourceLabel: 'User Settings',
						sourcePath: userSettingsPath,
						exists: false,
					},
					{
						path: workspaceProjectPath,
						sourceLabel: 'Workspace Settings',
						sourcePath: workspaceSettingsPath,
						exists: false,
					},
				],
			);
		});
	});

	test('removeTrustedDirectory keeps camelCase and snake_case arrays aligned when both exist', () => {
		withTempDir((root) => {
			const settingsPath = path.join(root, 'settings.json');
			const projectPath = path.join(root, 'project');
			fs.writeFileSync(
				settingsPath,
				JSON.stringify(
					{
						trustedFolders: [projectPath],
						trusted_folders: [projectPath],
					},
					null,
					2,
				),
				'utf8',
			);

			assert.strictEqual(removeTrustedDirectory(settingsPath, projectPath), true);
			const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
				trustedFolders?: string[];
				trusted_folders?: string[];
			};
			assert.deepStrictEqual(saved.trustedFolders, []);
			assert.deepStrictEqual(saved.trusted_folders, []);
		});
	});
});

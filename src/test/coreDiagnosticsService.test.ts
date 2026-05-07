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
	test('buildAgentsLoadingChain lists only existing instruction files', () => {
		withTempDir((root) => {
			const homeDir = path.join(root, 'home');
			const copilotDir = path.join(homeDir, '.copilot');
			const workspaceRoot = path.join(root, 'workspace');
			fs.mkdirSync(path.join(workspaceRoot, '.github'), { recursive: true });
			fs.mkdirSync(path.join(workspaceRoot, '.github', 'instructions', 'typescript'), { recursive: true });
			fs.mkdirSync(copilotDir, { recursive: true });
			fs.writeFileSync(path.join(copilotDir, 'copilot-instructions.md'), 'user', 'utf8');
			fs.writeFileSync(path.join(workspaceRoot, '.github', 'copilot-instructions.md'), 'workspace', 'utf8');
			fs.writeFileSync(
				path.join(
					workspaceRoot,
					'.github',
					'instructions',
					'typescript',
					'typescript.instructions.md',
				),
				'---\napplyTo: "**/*.ts"\n---\npath',
				'utf8',
			);
			fs.writeFileSync(path.join(workspaceRoot, 'AGENTS.md'), 'agent', 'utf8');

			const nodes = buildAgentsLoadingChain(workspaceRoot, homeDir);

			assert.deepStrictEqual(
				nodes.map((node) => ({
					kind: node.kind,
					fileName: node.fileName,
					status: node.status,
				})),
				[
					{ kind: 'user', fileName: 'copilot-instructions.md', status: 'found' },
					{ kind: 'workspace', fileName: 'copilot-instructions.md', status: 'found' },
					{
						kind: 'path',
						fileName: 'typescript.instructions.md',
						status: 'appliesWhenPathMatches',
					},
					{ kind: 'agent', fileName: 'AGENTS.md', status: 'found' },
				],
			);
		});
	});

	test('buildAgentsLoadingChain detects path instructions and current file matches', () => {
		withTempDir((root) => {
			const homeDir = path.join(root, 'home');
			const workspaceRoot = path.join(root, 'workspace');
			const instructionDir = path.join(workspaceRoot, '.github', 'instructions');
			const sourceDir = path.join(workspaceRoot, 'src');
			const currentFilePath = path.join(sourceDir, 'index.ts');
			fs.mkdirSync(instructionDir, { recursive: true });
			fs.mkdirSync(sourceDir, { recursive: true });
			fs.writeFileSync(
				path.join(instructionDir, 'typescript.instructions.md'),
				'---\napplyTo: "**/*.ts,**/*.tsx"\n---\nUse explicit types.\n',
				'utf8',
			);
			fs.writeFileSync(currentFilePath, 'export {};\n', 'utf8');

			const nodes = buildAgentsLoadingChain(
				workspaceRoot,
				homeDir,
				undefined,
				currentFilePath,
			);

			assert.strictEqual(nodes.length, 1);
			assert.strictEqual(nodes[0].kind, 'path');
			assert.strictEqual(nodes[0].status, 'matched');
			assert.strictEqual(nodes[0].applyTo, '**/*.ts,**/*.tsx');
			assert.strictEqual(nodes[0].currentFilePath, currentFilePath);
		});
	});

	test('buildAgentsLoadingChain marks invalid applyTo for path instructions', () => {
		withTempDir((root) => {
			const homeDir = path.join(root, 'home');
			const workspaceRoot = path.join(root, 'workspace');
			const instructionDir = path.join(workspaceRoot, '.github', 'instructions');
			fs.mkdirSync(instructionDir, { recursive: true });
			fs.writeFileSync(
				path.join(instructionDir, 'broken.instructions.md'),
				'---\ntitle: Broken\n---\nNo applyTo.\n',
				'utf8',
			);

			const nodes = buildAgentsLoadingChain(workspaceRoot, homeDir);

			assert.strictEqual(nodes.length, 1);
			assert.strictEqual(nodes[0].status, 'invalidApplyTo');
		});
	});

	test('buildAgentsLoadingChain includes custom instruction directories', () => {
		withTempDir((root) => {
			const homeDir = path.join(root, 'home');
			const workspaceRoot = path.join(root, 'workspace');
			const customDir = path.join(root, 'custom-instructions');
			fs.mkdirSync(customDir, { recursive: true });
			fs.writeFileSync(path.join(customDir, 'AGENTS.md'), 'custom', 'utf8');

			const nodes = buildAgentsLoadingChain(
				workspaceRoot,
				homeDir,
				customDir,
			);

			assert.strictEqual(nodes.length, 1);
			assert.strictEqual(nodes[0].kind, 'customAgent');
			assert.strictEqual(nodes[0].fileName, 'AGENTS.md');
		});
	});

	test('buildAgentsLoadingChain ignores nested workspace AGENTS.md files', () => {
		withTempDir((root) => {
			const homeDir = path.join(root, 'home');
			const workspaceRoot = path.join(root, 'workspace');
			const nestedDir = path.join(workspaceRoot, 'docs');
			fs.mkdirSync(nestedDir, { recursive: true });
			fs.writeFileSync(path.join(nestedDir, 'AGENTS.md'), 'nested agent', 'utf8');

			const nodes = buildAgentsLoadingChain(workspaceRoot, homeDir);

			assert.strictEqual(nodes.length, 0);
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

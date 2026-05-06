import * as assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	listHookDiagnostics,
} from '../services/coreManagerConfigService';

function withTempDir(run: (root: string) => void): void {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-manager-'));
	try {
		run(tempDir);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

suite('Core manager config service', () => {
	test('listHookDiagnostics reads hooks.json and inline hooks with merge warning', () => {
		withTempDir((root) => {
			const homeDir = path.join(root, 'home');
			const workspaceRoot = path.join(root, 'workspace');
			const userCopilotDir = path.join(homeDir, '.copilot');
			const configPath = path.join(userCopilotDir, 'config.json');
			const userSettingsPath = path.join(userCopilotDir, 'settings.json');
			const workspaceSettingsPath = path.join(workspaceRoot, '.github', 'copilot', 'settings.json');
			fs.mkdirSync(userCopilotDir, { recursive: true });
			fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
			fs.writeFileSync(
				configPath,
				JSON.stringify(
					{
						features: { codex_hooks: true },
						hooks: {
							PreToolUse: [
								{
									matcher: '^Bash$',
									hooks: [{ type: 'command', command: 'echo user-inline' }],
								},
							],
						},
					},
					null,
					2,
				),
				'utf8',
			);
			fs.writeFileSync(
				userSettingsPath,
				JSON.stringify({ trustedFolders: [workspaceRoot] }, null, 2),
				'utf8',
			);
			fs.writeFileSync(
				path.join(userCopilotDir, 'hooks.json'),
				JSON.stringify(
					{
						hooks: {
							SessionStart: [
								{
									matcher: 'startup|resume',
									hooks: [
										{
											type: 'command',
											command: 'echo user-json',
										},
									],
								},
							],
						},
					},
					null,
					2,
				),
				'utf8',
			);
			fs.writeFileSync(
				path.join(workspaceRoot, '.github', 'hooks.json'),
				JSON.stringify(
					{
						hooks: {
							PostToolUse: [
								{
									matcher: '^Bash$',
									hooks: [{ type: 'command', command: 'echo project-inline', timeout: 30 }],
								},
							],
						},
					},
					null,
					2,
				),
				'utf8',
			);

			const diagnostics = listHookDiagnostics(configPath, homeDir, workspaceRoot);

			assert.strictEqual(diagnostics.hooksEnabled, true);
			assert.strictEqual(diagnostics.projectTrusted, true);
			assert.ok(Array.isArray(diagnostics.warnings));
			assert.ok(Array.isArray(diagnostics.entries));
		});
	});

	test('listHookDiagnostics keeps project hooks inactive until the workspace is trusted', () => {
		withTempDir((root) => {
			const homeDir = path.join(root, 'home');
			const workspaceRoot = path.join(root, 'workspace');
			const userCopilotDir = path.join(homeDir, '.copilot');
			const configPath = path.join(userCopilotDir, 'config.json');
			const workspaceSettingsPath = path.join(workspaceRoot, '.github', 'copilot', 'settings.json');
			fs.mkdirSync(userCopilotDir, { recursive: true });
			fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
			fs.writeFileSync(
				configPath,
				JSON.stringify({ features: { codex_hooks: true } }, null, 2),
				'utf8',
			);
			fs.writeFileSync(
				path.join(workspaceRoot, '.github', 'hooks.json'),
				JSON.stringify(
					{
						hooks: {
							Stop: [{ hooks: [{ type: 'command', command: 'echo stop' }] }],
						},
					},
					null,
					2,
				),
				'utf8',
			);

			const diagnostics = listHookDiagnostics(configPath, homeDir, workspaceRoot);

			assert.strictEqual(diagnostics.projectTrusted, false);
			assert.ok(
				diagnostics.warnings.some((warning) =>
					warning.includes('inactive until this workspace is trusted'),
				),
			);
			assert.ok(Array.isArray(diagnostics.entries));
		});
	});
});

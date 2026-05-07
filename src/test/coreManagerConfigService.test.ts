import * as assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { listHookDiagnostics } from '../services/coreManagerConfigService';

function withTempDir(run: (root: string) => void): void {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-manager-'));
	try {
		run(tempDir);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

suite('Core manager config service', () => {
	test('listHookDiagnostics reads workspace hooks and plugin hooks', () => {
		withTempDir((root) => {
			const homeDir = path.join(root, 'home');
			const workspaceRoot = path.join(root, 'workspace');
			const userCopilotDir = path.join(homeDir, '.copilot');
			const installedPluginsDir = path.join(userCopilotDir, 'installed-plugins');
			const workspaceHooksDir = path.join(workspaceRoot, '.github', 'hooks');
			const pluginHooksPath = path.join(installedPluginsDir, 'sample-plugin', 'hooks.json');
			const workspaceHooksPath = path.join(workspaceHooksDir, 'workspace.json');

			fs.mkdirSync(path.dirname(pluginHooksPath), { recursive: true });
			fs.mkdirSync(workspaceHooksDir, { recursive: true });
			fs.writeFileSync(
				workspaceHooksPath,
				JSON.stringify(
					{
						version: 1,
						hooks: {
							sessionStart: [
								{
									type: 'command',
									bash: 'echo test-basic-plugin sessionStart',
									powershell: "Write-Output 'test-basic-plugin sessionStart'",
									timeoutSec: 5,
								},
							],
							SessionStart: [
								{
									matcher: 'startup|resume',
									hooks: [
										{
											type: 'command',
											command: 'python3 ~/.codex/hooks/session_start.py',
											timeout: 600,
											statusMessage: 'Loading session notes',
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
				pluginHooksPath,
				JSON.stringify(
					{
						hooks: {
							Stop: [
								{
									hooks: [
										{
											type: 'command',
											command: 'echo plugin-stop',
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

			const diagnostics = listHookDiagnostics(undefined, homeDir, workspaceRoot);

			assert.deepStrictEqual(
				diagnostics.sources.map((source) => ({
					label: source.label,
					path: source.path,
					entryCount: source.entryCount,
				})),
				[	
					{
						label: 'Workspace Hooks',
						path: workspaceHooksPath,
						entryCount: 2,
					},
					{
						label: 'Plugin Hooks',
						path: pluginHooksPath,
						entryCount: 1,
					},
				],
			);
			assert.strictEqual(diagnostics.entries.length, 3);
			assert.deepStrictEqual(diagnostics.entries[0], {
				id: `workspace:${workspaceHooksPath}:sessionStart:0:0`,
				sourceId: `workspace:${workspaceHooksPath}`,
				sourceLabel: 'Workspace Hooks',
				sourcePath: workspaceHooksPath,
				event: 'sessionStart',
				matcher: undefined,
				handlerType: 'command',
				schemaKind: 'copilot-cli',
				command: "Write-Output 'test-basic-plugin sessionStart'",
				bash: 'echo test-basic-plugin sessionStart',
				powershell: "Write-Output 'test-basic-plugin sessionStart'",
				prompt: undefined,
				timeout: 5,
				statusMessage: undefined,
			});
			assert.deepStrictEqual(diagnostics.entries[1], {
				id: `workspace:${workspaceHooksPath}:SessionStart:1:0`,
				sourceId: `workspace:${workspaceHooksPath}`,
				sourceLabel: 'Workspace Hooks',
				sourcePath: workspaceHooksPath,
				event: 'SessionStart',
				matcher: 'startup|resume',
				handlerType: 'command',
				schemaKind: 'nested',
				command: 'python3 ~/.codex/hooks/session_start.py',
				bash: undefined,
				powershell: undefined,
				prompt: undefined,
				timeout: 600,
				statusMessage: 'Loading session notes',
			});
		});
	});

	test('listHookDiagnostics ignores missing hook roots', () => {
		withTempDir((root) => {
			const homeDir = path.join(root, 'home');
			const workspaceRoot = path.join(root, 'workspace');
			fs.mkdirSync(workspaceRoot, { recursive: true });

			const diagnostics = listHookDiagnostics(undefined, homeDir, workspaceRoot);

			assert.deepStrictEqual(diagnostics.sources, []);
			assert.deepStrictEqual(diagnostics.entries, []);
		});
	});
});

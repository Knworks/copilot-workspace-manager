import * as assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	listFeatureFlagRecords,
	listHookDiagnostics,
	setFeatureFlag,
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
	test('listFeatureFlagRecords uses defaults when config is missing', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'config.toml');

			const flags = listFeatureFlagRecords(configPath);

			assert.strictEqual(
				flags.find((flag) => flag.key === 'codex_hooks')?.enabled,
				true,
			);
			assert.strictEqual(
				flags.find((flag) => flag.key === 'memories')?.enabled,
				false,
			);
		});
	});

	test('setFeatureFlag appends and updates the features table', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'config.toml');
			fs.writeFileSync(configPath, 'model = "gpt-5.5"\n', 'utf8');

			setFeatureFlag(configPath, 'memories', true);
			setFeatureFlag(configPath, 'codex_hooks', false);

			const contents = fs.readFileSync(configPath, 'utf8');
			assert.ok(contents.includes('[features]'));
			assert.ok(contents.includes('memories = true'));
			assert.ok(contents.includes('codex_hooks = false'));

			setFeatureFlag(configPath, 'memories', false);
			const updated = fs.readFileSync(configPath, 'utf8');
			assert.ok(updated.includes('memories = false'));
		});
	});

	test('setFeatureFlag inserts before trailing section separator comments', () => {
		withTempDir((root) => {
			const configPath = path.join(root, 'config.toml');
			fs.writeFileSync(
				configPath,
				[
					'[features]',
					'',
					'# 複数エージェント機能',
					'multi_agent = true',
					'memories = true',
					'',
					'# ================================',
					'#  MCP',
					'# ================================',
					'',
					'[mcp_servers.context7]',
					'command = "cmd"',
				].join('\n'),
				'utf8',
			);

			setFeatureFlag(configPath, 'web_search', true);

			const contents = fs.readFileSync(configPath, 'utf8');
			assert.ok(contents.includes('memories = true\nweb_search = true\n\n# ================================'));
			assert.ok(!contents.includes('# ================================\n\nweb_search = true'));
		});
	});

	test('listHookDiagnostics reads hooks.json and inline hooks with merge warning', () => {
		withTempDir((root) => {
			const homeDir = path.join(root, 'home');
			const workspaceRoot = path.join(root, 'workspace');
			const userCopilotDir = path.join(homeDir, '.copilot');
			const configPath = path.join(userCopilotDir, 'config.json');
			fs.mkdirSync(userCopilotDir, { recursive: true });
			fs.mkdirSync(path.join(workspaceRoot, '.github'), { recursive: true });
			fs.writeFileSync(
				configPath,
				JSON.stringify(
					{
						features: { codex_hooks: true },
						trusted_folders: [workspaceRoot],
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
			fs.mkdirSync(userCopilotDir, { recursive: true });
			fs.mkdirSync(path.join(workspaceRoot, '.github'), { recursive: true });
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

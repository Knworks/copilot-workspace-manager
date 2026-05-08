import * as assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	getCopilotConfigStatus,
	getCoreWorkspaceStatus,
	getWorkspaceStatus,
	resolveCopilotPaths,
	UNAVAILABLE_REASONS,
} from '../services/workspaceStatus';

function withTempHome(run: (homeDir: string) => void): void {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-workspace-manager-'));
	try {
		run(tempDir);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

suite('Workspace status', () => {
	test('reports missing copilot directory', () => {
		withTempHome((homeDir) => {
			const status = getCopilotConfigStatus(homeDir);
			assert.strictEqual(status.isAvailable, false);
			assert.strictEqual(status.reason, UNAVAILABLE_REASONS.copilotMissing);
		});
	});

	test('reports missing config.json', () => {
		withTempHome((homeDir) => {
			const paths = resolveCopilotPaths(homeDir, undefined);
			fs.mkdirSync(paths.copilotDir, { recursive: true });

			const status = getCopilotConfigStatus(homeDir);
			assert.strictEqual(status.isAvailable, false);
			assert.strictEqual(status.reason, UNAVAILABLE_REASONS.configMissing);
		});
	});

	test('reports invalid config.json', () => {
		withTempHome((homeDir) => {
			const paths = resolveCopilotPaths(homeDir, undefined);
			fs.mkdirSync(paths.copilotDir, { recursive: true });
			fs.writeFileSync(paths.configPath, 'invalid = [', 'utf8');

			const status = getCopilotConfigStatus(homeDir);
			assert.strictEqual(status.isAvailable, false);
			assert.strictEqual(status.reason, UNAVAILABLE_REASONS.configInvalid);
		});
	});

	test('accepts commented config.json', () => {
		withTempHome((homeDir) => {
			const paths = resolveCopilotPaths(homeDir, undefined);
			fs.mkdirSync(paths.copilotDir, { recursive: true });
			fs.writeFileSync(
				paths.configPath,
				'// managed automatically\n{\n  "installedPlugins": []\n}\n',
				'utf8',
			);

			const status = getCopilotConfigStatus(homeDir);
			assert.strictEqual(status.isAvailable, true);
			assert.strictEqual(status.reason, undefined);
		});
	});

	test('core status allows invalid config.json for repair operations', () => {
		withTempHome((homeDir) => {
			const paths = resolveCopilotPaths(homeDir, undefined);
			fs.mkdirSync(paths.copilotDir, { recursive: true });
			fs.writeFileSync(paths.configPath, 'invalid = [', 'utf8');

			const status = getCoreWorkspaceStatus(homeDir);
			assert.strictEqual(status.isAvailable, true);
			assert.strictEqual(status.reason, undefined);
			assert.strictEqual(status.isConfigInvalid, undefined);
		});
	});

	test('reports available workspace', () => {
		withTempHome((homeDir) => {
			const paths = resolveCopilotPaths(homeDir, undefined);
			fs.mkdirSync(paths.copilotDir, { recursive: true });
			fs.writeFileSync(paths.configPath, '{ "title": "ok" }', 'utf8');

			const status = getWorkspaceStatus(homeDir);
			assert.strictEqual(status.isAvailable, true);
			assert.strictEqual(status.reason, undefined);
		});
	});

	test('COPILOT_HOME overrides default config root', () => {
		withTempHome((homeDir) => {
			const customHome = path.join(homeDir, 'custom-copilot');
			const paths = resolveCopilotPaths(homeDir, customHome);
			assert.strictEqual(paths.copilotDir, customHome);
			assert.strictEqual(paths.configPath, path.join(customHome, 'config.json'));
			assert.strictEqual(
				paths.mcpDisabledConfigPath,
				path.join(customHome, '.copilot-workspace-manager', 'mcp-config.disabled.json'),
			);
		});
	});
});

import * as assert from 'assert';
import fs from 'fs';
import os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { CoreExplorerProvider } from '../views/coreExplorerProvider';
import { getUnavailableLabel } from '../services/workspaceStatus';

const contextStub = {
	asAbsolutePath: (target: string) => path.join('root', target),
} as vscode.ExtensionContext;

suite('Core explorer provider', () => {
	test('returns core items when available', () => {
		const provider = new CoreExplorerProvider(
			contextStub,
			() => ({ isAvailable: true }),
			() => ({ isAvailable: true }),
		);
		const items = provider.getChildren() as vscode.TreeItem[];
		assert.ok(items.length >= 9);
		assert.strictEqual(items[0].label, 'config.json');
		assert.strictEqual(items[1].label, 'mcp-config.json');
		assert.strictEqual(items[2].label, 'permissions-config.json');
		assert.strictEqual(items[3].label, 'copilot-instructions.md');
	});

	test('returns repository copilot-instructions.md when workspace is open', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-core-'));
		const originalHome = process.env.HOME;
		const originalUserProfile = process.env.USERPROFILE;
		const originalHomeDrive = process.env.HOMEDRIVE;
		const originalHomePath = process.env.HOMEPATH;
		const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
		try {
			process.env.HOME = tempDir;
			process.env.USERPROFILE = tempDir;
			process.env.HOMEDRIVE = '';
			process.env.HOMEPATH = tempDir;
			const workspaceRoot = path.join(tempDir, 'workspace');
			fs.mkdirSync(path.join(workspaceRoot, '.github'), { recursive: true });
			fs.writeFileSync(
				path.join(workspaceRoot, '.github', 'copilot-instructions.md'),
				'instructions',
				'utf8',
			);
			Object.defineProperty(vscode.workspace, 'workspaceFolders', {
				configurable: true,
				value: [{ uri: vscode.Uri.file(workspaceRoot) }],
			});

			const provider = new CoreExplorerProvider(contextStub, () => ({ isAvailable: true }));
			const items = provider.getChildren() as vscode.TreeItem[];
			assert.ok(
				items.some((item) => item.label === 'Repository copilot-instructions.md'),
			);
		} finally {
			Object.defineProperty(vscode.workspace, 'workspaceFolders', {
				configurable: true,
				value: originalWorkspaceFolders,
			});
			restoreEnv('HOME', originalHome);
			restoreEnv('USERPROFILE', originalUserProfile);
			restoreEnv('HOMEDRIVE', originalHomeDrive);
			restoreEnv('HOMEPATH', originalHomePath);
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('marks config item with warning when config is invalid but core is available', () => {
		const provider = new CoreExplorerProvider(
			contextStub,
			() => ({
				isAvailable: true,
				isConfigInvalid: true,
				reason: 'invalid config',
			}),
			() => ({
				isAvailable: false,
				reason: 'invalid config',
			}),
		);

		const items = provider.getChildren() as vscode.TreeItem[];
		assert.strictEqual(items[0].label, 'config.json');
		assert.strictEqual(items[0].tooltip, 'invalid config');
		assert.ok(items[0].iconPath instanceof vscode.ThemeIcon);
		assert.strictEqual((items[0].iconPath as vscode.ThemeIcon).id, 'warning');
	});

	test('returns unavailable item when not available', () => {
		const provider = new CoreExplorerProvider(contextStub, () => ({
			isAvailable: false,
			reason: 'missing',
		}));
		const items = provider.getChildren() as vscode.TreeItem[];
		assert.strictEqual(items.length, 1);
		assert.strictEqual(items[0].label, getUnavailableLabel('missing'));
	});

	test('config and instruction items carry open command', () => {
		const provider = new CoreExplorerProvider(
			contextStub,
			() => ({ isAvailable: true }),
			() => ({ isAvailable: true }),
		);
		const items = provider.getChildren() as vscode.TreeItem[];
		const configCommand = items[0].command;
		assert.ok(configCommand);
		assert.strictEqual(configCommand?.command, 'copilot-workspace-manager.openFile');
		assert.ok(
			typeof (configCommand?.arguments?.[0] as { fsPath?: string })?.fsPath === 'string',
		);

		const instructionCommand = items[3].command;
		assert.ok(instructionCommand);
		assert.strictEqual(instructionCommand?.command, 'copilot-workspace-manager.openFile');
	});

	test('config and instruction items carry file icons', () => {
		const provider = new CoreExplorerProvider(
			contextStub,
			() => ({ isAvailable: true }),
			() => ({ isAvailable: true }),
		);
		const items = provider.getChildren() as vscode.TreeItem[];
		const expectedIconPath = (fileName: string): string =>
			vscode.Uri.file(
				contextStub.asAbsolutePath(path.join('images', fileName)),
			).fsPath;

		const configIconPath = items[0].iconPath as { light: vscode.Uri; dark: vscode.Uri };
		assert.strictEqual(
			configIconPath.light.fsPath,
			expectedIconPath('settingsfile32.png'),
		);
		assert.strictEqual(
			configIconPath.dark.fsPath,
			expectedIconPath('settingsfile32.png'),
		);

		const instructionIconPath = items[3].iconPath as { light: vscode.Uri; dark: vscode.Uri };
		assert.strictEqual(
			instructionIconPath.light.fsPath,
			expectedIconPath('markdown32.png'),
		);
		assert.strictEqual(
			instructionIconPath.dark.fsPath,
			expectedIconPath('markdown32.png'),
		);
	});
});

function restoreEnv(key: keyof NodeJS.ProcessEnv, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}

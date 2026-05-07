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
	test('returns core files in fixed order and omits missing entries', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-view-'));
		const originalCopilotHome = process.env.COPILOT_HOME;
		const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
		try {
			const copilotHome = path.join(tempDir, '.copilot');
			const workspaceRoot = path.join(tempDir, 'workspace');
			process.env.COPILOT_HOME = copilotHome;
			fs.mkdirSync(path.join(workspaceRoot, '.github', 'copilot'), { recursive: true });
			fs.mkdirSync(copilotHome, { recursive: true });
			fs.writeFileSync(path.join(copilotHome, 'config.json'), '{}', 'utf8');
			fs.writeFileSync(path.join(copilotHome, 'settings.json'), '{}', 'utf8');
			fs.writeFileSync(path.join(workspaceRoot, '.github', 'copilot', 'settings.local.json'), '{}', 'utf8');
			fs.writeFileSync(path.join(copilotHome, 'mcp-config.json'), '{}', 'utf8');
			fs.writeFileSync(path.join(copilotHome, 'copilot-instructions.md'), 'user', 'utf8');
			fs.writeFileSync(path.join(workspaceRoot, 'AGENTS.md'), 'primary', 'utf8');
			fs.mkdirSync(path.join(workspaceRoot, 'docs'), { recursive: true });
			fs.writeFileSync(path.join(workspaceRoot, 'docs', 'AGENTS.md'), 'additional', 'utf8');
			Object.defineProperty(vscode.workspace, 'workspaceFolders', {
				configurable: true,
				value: [{ uri: vscode.Uri.file(workspaceRoot) }],
			});

			const provider = new CoreExplorerProvider(
				contextStub,
				() => ({ isAvailable: true }),
				() => ({ isAvailable: true }),
			);
			const items = provider.getChildren() as vscode.TreeItem[];
			assert.deepStrictEqual(
				items.map((item) => `${item.label}:${item.description ?? ''}`),
				[
					'config.json:Internal Config',
					'settings.json:User Settings',
					'settings.local.json:Workspace Local Settings',
					'mcp-config.json:',
					'copilot-instructions.md:User Instructions',
					'AGENTS.md:Primary Instructions',
					'AGENTS.md:Additional Instructions',
				],
			);
		} finally {
			Object.defineProperty(vscode.workspace, 'workspaceFolders', {
				configurable: true,
				value: originalWorkspaceFolders,
			});
			if (originalCopilotHome === undefined) {
				delete process.env.COPILOT_HOME;
			} else {
				process.env.COPILOT_HOME = originalCopilotHome;
			}
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('returns workspace and user instructions with descriptions when present', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-instructions-'));
		const originalCopilotHome = process.env.COPILOT_HOME;
		const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
		try {
			const copilotHome = path.join(tempDir, '.copilot');
			const workspaceRoot = path.join(tempDir, 'workspace');
			process.env.COPILOT_HOME = copilotHome;
			fs.mkdirSync(path.join(workspaceRoot, '.github'), { recursive: true });
			fs.mkdirSync(copilotHome, { recursive: true });
			fs.writeFileSync(path.join(copilotHome, 'copilot-instructions.md'), 'user', 'utf8');
			fs.writeFileSync(path.join(workspaceRoot, '.github', 'copilot-instructions.md'), 'workspace', 'utf8');
			Object.defineProperty(vscode.workspace, 'workspaceFolders', {
				configurable: true,
				value: [{ uri: vscode.Uri.file(workspaceRoot) }],
			});

			const provider = new CoreExplorerProvider(contextStub, () => ({ isAvailable: true }));
			const items = provider.getChildren() as vscode.TreeItem[];
			assert.ok(items.some((item) => item.description === 'User Instructions'));
			assert.ok(items.some((item) => item.description === 'Workspace Instructions'));
		} finally {
			Object.defineProperty(vscode.workspace, 'workspaceFolders', {
				configurable: true,
				value: originalWorkspaceFolders,
			});
			if (originalCopilotHome === undefined) {
				delete process.env.COPILOT_HOME;
			} else {
				process.env.COPILOT_HOME = originalCopilotHome;
			}
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('uses requested icons for core entries', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-icons-'));
		const originalCopilotHome = process.env.COPILOT_HOME;
		const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
		try {
			const copilotHome = path.join(tempDir, '.copilot');
			const workspaceRoot = path.join(tempDir, 'workspace');
			process.env.COPILOT_HOME = copilotHome;
			fs.mkdirSync(path.join(workspaceRoot, '.github', 'copilot'), { recursive: true });
			fs.mkdirSync(copilotHome, { recursive: true });
			fs.writeFileSync(path.join(copilotHome, 'config.json'), '{}', 'utf8');
			fs.writeFileSync(path.join(copilotHome, 'settings.json'), '{}', 'utf8');
			fs.writeFileSync(path.join(copilotHome, 'mcp-config.json'), '{}', 'utf8');
			fs.writeFileSync(path.join(copilotHome, 'copilot-instructions.md'), 'user', 'utf8');
			fs.writeFileSync(path.join(workspaceRoot, 'AGENTS.md'), 'primary', 'utf8');
			Object.defineProperty(vscode.workspace, 'workspaceFolders', {
				configurable: true,
				value: [{ uri: vscode.Uri.file(workspaceRoot) }],
			});

			const provider = new CoreExplorerProvider(
				contextStub,
				() => ({ isAvailable: true }),
				() => ({ isAvailable: true }),
			);
			const items = provider.getChildren() as vscode.TreeItem[];
			const configItem = items.find((item) => item.label === 'config.json');
			const settingsItem = items.find(
				(item) => item.label === 'settings.json' && item.description === 'User Settings',
			);
			const mcpItem = items.find((item) => item.label === 'mcp-config.json');
			const instructionsItem = items.find(
				(item) =>
					item.label === 'copilot-instructions.md' &&
					item.description === 'User Instructions',
			);
			const agentsItem = items.find(
				(item) => item.label === 'AGENTS.md' && item.description === 'Primary Instructions',
			);

			assert.ok(configItem?.iconPath instanceof vscode.ThemeIcon);
			assert.strictEqual((configItem?.iconPath as vscode.ThemeIcon).id, 'settings-gear');
			assert.ok(settingsItem?.iconPath instanceof vscode.ThemeIcon);
			assert.strictEqual((settingsItem?.iconPath as vscode.ThemeIcon).id, 'settings-gear');
			assert.ok(mcpItem?.iconPath instanceof vscode.ThemeIcon);
			assert.strictEqual((mcpItem?.iconPath as vscode.ThemeIcon).id, 'mcp');
			assert.ok(instructionsItem?.iconPath instanceof vscode.ThemeIcon);
			assert.strictEqual((instructionsItem?.iconPath as vscode.ThemeIcon).id, 'copilot');
			assert.deepStrictEqual(agentsItem?.iconPath, {
				light: vscode.Uri.file(path.join('root', 'images', 'agents_light.png')),
				dark: vscode.Uri.file(path.join('root', 'images', 'agents_dark.png')),
			});
		} finally {
			Object.defineProperty(vscode.workspace, 'workspaceFolders', {
				configurable: true,
				value: originalWorkspaceFolders,
			});
			if (originalCopilotHome === undefined) {
				delete process.env.COPILOT_HOME;
			} else {
				process.env.COPILOT_HOME = originalCopilotHome;
			}
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test('marks config item with warning when config is invalid but core is available', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-warning-'));
		const originalCopilotHome = process.env.COPILOT_HOME;
		try {
			process.env.COPILOT_HOME = path.join(tempDir, '.copilot');
			fs.mkdirSync(process.env.COPILOT_HOME, { recursive: true });
			fs.writeFileSync(path.join(process.env.COPILOT_HOME, 'config.json'), '{}', 'utf8');
			const provider = new CoreExplorerProvider(
				contextStub,
				() => ({ isAvailable: true }),
				() => ({ isAvailable: false, reason: 'invalid config' }),
			);

			const items = provider.getChildren() as vscode.TreeItem[];
			assert.strictEqual(items[0].label, 'config.json');
			assert.strictEqual(items[0].tooltip, 'invalid config');
			assert.ok(items[0].iconPath instanceof vscode.ThemeIcon);
			assert.strictEqual((items[0].iconPath as vscode.ThemeIcon).id, 'warning');
		} finally {
			if (originalCopilotHome === undefined) {
				delete process.env.COPILOT_HOME;
			} else {
				process.env.COPILOT_HOME = originalCopilotHome;
			}
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
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

	test('returns empty item when no core entries exist', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-empty-'));
		const originalCopilotHome = process.env.COPILOT_HOME;
		const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
		try {
			process.env.COPILOT_HOME = path.join(tempDir, '.copilot');
			Object.defineProperty(vscode.workspace, 'workspaceFolders', {
				configurable: true,
				value: [{ uri: vscode.Uri.file(path.join(tempDir, 'workspace')) }],
			});
			const provider = new CoreExplorerProvider(
				contextStub,
				() => ({ isAvailable: true }),
				() => ({ isAvailable: true }),
			);
			const items = provider.getChildren() as vscode.TreeItem[];
			assert.strictEqual(items.length, 1);
			assert.strictEqual(items[0].label, 'No Copilot Manager files to display.');
		} finally {
			Object.defineProperty(vscode.workspace, 'workspaceFolders', {
				configurable: true,
				value: originalWorkspaceFolders,
			});
			if (originalCopilotHome === undefined) {
				delete process.env.COPILOT_HOME;
			} else {
				process.env.COPILOT_HOME = originalCopilotHome;
			}
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

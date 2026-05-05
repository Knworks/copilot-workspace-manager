import * as assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';

type EnvSnapshot = {
	HOME?: string;
	USERPROFILE?: string;
	HOMEDRIVE?: string;
	HOMEPATH?: string;
	COPILOT_HOME?: string;
};

type FakePanelHandle = {
	panel: vscode.WebviewPanel;
	getRevealCount: () => number;
};

function createFakePanel(): FakePanelHandle {
	let revealCount = 0;
	let disposeListener: (() => void) | undefined;
	const webview = {
		html: '',
		cspSource: 'vscode-webview://test',
		postMessage: async () => true,
		onDidReceiveMessage: () => ({ dispose: () => undefined }),
	} as unknown as vscode.Webview;

	const panel = {
		webview,
		reveal: () => {
			revealCount += 1;
		},
		onDidDispose: (listener: () => void) => {
			disposeListener = listener;
			return { dispose: () => undefined };
		},
		dispose: () => {
			disposeListener?.();
		},
	} as unknown as vscode.WebviewPanel;

	return {
		panel,
		getRevealCount: () => revealCount,
	};
}

async function withTempHome(
	run: (homeDir: string) => Promise<void>,
): Promise<void> {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
	const originalEnv: EnvSnapshot = {
		HOME: process.env.HOME,
		USERPROFILE: process.env.USERPROFILE,
		HOMEDRIVE: process.env.HOMEDRIVE,
		HOMEPATH: process.env.HOMEPATH,
		COPILOT_HOME: process.env.COPILOT_HOME,
	};
	process.env.HOME = tempDir;
	process.env.USERPROFILE = tempDir;
		process.env.HOMEDRIVE = '';
		process.env.HOMEPATH = tempDir;
		process.env.COPILOT_HOME = path.join(tempDir, '.copilot');

	try {
		await run(tempDir);
	} finally {
		restoreEnv('HOME', originalEnv.HOME);
		restoreEnv('USERPROFILE', originalEnv.USERPROFILE);
		restoreEnv('HOMEDRIVE', originalEnv.HOMEDRIVE);
		restoreEnv('HOMEPATH', originalEnv.HOMEPATH);
		restoreEnv('COPILOT_HOME', originalEnv.COPILOT_HOME);
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

function restoreEnv(key: keyof NodeJS.ProcessEnv, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}

async function activateExtension(): Promise<void> {
	const extension = vscode.extensions.getExtension('Knworks.copilot-workspace-manager');
	assert.ok(extension, 'extension not found');
	await extension.activate();
}

suite('Core view command', () => {
	test('legacy history and TOML commands are not registered', async () => {
		await withTempHome(async (homeDir) => {
			await activateExtension();

			const copilotDir = path.join(homeDir, '.copilot');
			fs.mkdirSync(copilotDir, { recursive: true });
			fs.writeFileSync(path.join(copilotDir, 'config.json'), '{}', 'utf8');

			const commands = await vscode.commands.getCommands(true);
			assert.ok(!commands.includes('copilot-workspace-manager.openHistoryView'));
			assert.ok(!commands.includes('copilot-workspace-manager.organizeConfigToml'));
		});
	});
});

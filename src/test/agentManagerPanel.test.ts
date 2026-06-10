import * as assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';
import { AgentManagerPanelManager } from '../services/agentManagerPanel';

type EnvSnapshot = {
	HOME?: string;
	USERPROFILE?: string;
	HOMEDRIVE?: string;
	HOMEPATH?: string;
	COPILOT_HOME?: string;
};

type FakePanelHandle = {
	panel: vscode.WebviewPanel;
};

function createFakePanel(): FakePanelHandle {
	let disposeListener: (() => void) | undefined;
	const webview = {
		html: '',
		cspSource: 'vscode-webview://test',
		postMessage: async () => true,
		onDidReceiveMessage: () => ({ dispose: () => undefined }),
	} as unknown as vscode.Webview;

	const panel = {
		webview,
		reveal: () => undefined,
		onDidDispose: (listener: () => void) => {
			disposeListener = listener;
			return { dispose: () => undefined };
		},
		dispose: () => {
			disposeListener?.();
		},
	} as unknown as vscode.WebviewPanel;

	return { panel };
}

async function withTempHome(run: (homeDir: string) => Promise<void>): Promise<void> {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-manager-home-'));
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
		process.env.HOME = originalEnv.HOME;
		process.env.USERPROFILE = originalEnv.USERPROFILE;
		process.env.HOMEDRIVE = originalEnv.HOMEDRIVE;
		process.env.HOMEPATH = originalEnv.HOMEPATH;
		process.env.COPILOT_HOME = originalEnv.COPILOT_HOME;
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

suite('Agent manager panel', () => {
	test('show renders tabbed agent manager webview html', async () => {
		await withTempHome(async (homeDir) => {
			const copilotDir = path.join(homeDir, '.copilot');
			const agentsDir = path.join(copilotDir, 'agents');
			fs.mkdirSync(agentsDir, { recursive: true });
			fs.writeFileSync(
				path.join(agentsDir, 'tester.agent.md'),
				[
					'---',
					'name: tester',
					'description: Test agent',
					'model: gpt-5',
					'user-invocable: true',
					'disable-model-invocation: false',
					'---',
					'',
					'# tester',
				].join('\n'),
				'utf8',
			);

			const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
			const fakePanel = createFakePanel();
			(
				vscode.window as unknown as {
					createWebviewPanel: typeof originalCreateWebviewPanel;
				}
			).createWebviewPanel = () => fakePanel.panel;

			try {
				const manager = new AgentManagerPanelManager(() => undefined);
				manager.show();
				const html = fakePanel.panel.webview.html;
				assert.ok(html.includes('AGENTS Manager Tabs'));
				assert.ok(html.includes('id="agentsPanel"'));
				assert.ok(html.includes('id="agentDetail"'));
				assert.ok(html.includes('id="orchestrationPanel"'));
				assert.ok(html.includes('toggleAgentSetting'));
				assert.ok(html.includes('workflowCatalog'));
				const scriptMatch = html.match(/<script nonce="[^"]+">([\s\S]+)<\/script>/);
				assert.ok(scriptMatch, 'webview script should be present');
				assert.doesNotThrow(() => new Function(scriptMatch?.[1] ?? ''));
				manager.dispose();
			} finally {
				(
					vscode.window as unknown as {
						createWebviewPanel: typeof originalCreateWebviewPanel;
					}
				).createWebviewPanel = originalCreateWebviewPanel;
			}
		});
	});

	test('webview script persists orchestration draft state across reloads', async () => {
		await withTempHome(async (homeDir) => {
			const copilotDir = path.join(homeDir, '.copilot');
			const agentsDir = path.join(copilotDir, 'agents');
			fs.mkdirSync(agentsDir, { recursive: true });

			const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
			const fakePanel = createFakePanel();
			(
				vscode.window as unknown as {
					createWebviewPanel: typeof originalCreateWebviewPanel;
				}
			).createWebviewPanel = () => fakePanel.panel;

			try {
				const manager = new AgentManagerPanelManager(() => undefined);
				manager.show();
				const html = fakePanel.panel.webview.html;
				assert.ok(html.includes('const restoredState = vscode.getState ? vscode.getState() : undefined;'));
				assert.ok(html.includes("workflow: restoredState && restoredState.workflow ? restoredState.workflow : initialPayload.workflow,"));
				assert.ok(html.includes('function persistState() {'));
				assert.ok(html.includes('vscode.setState({'));
				assert.ok(html.includes('workflow: appState.workflow,'));
				assert.ok(html.includes('selection: appState.selection,'));
				manager.dispose();
			} finally {
				(
					vscode.window as unknown as {
						createWebviewPanel: typeof originalCreateWebviewPanel;
					}
				).createWebviewPanel = originalCreateWebviewPanel;
			}
		});
	});
});

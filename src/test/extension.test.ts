import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	async function withTempWorkspace(
		run: (homeDir: string, workspaceRoot: string) => Promise<void>,
	): Promise<void> {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-extension-'));
		const workspaceRoot = path.join(tempDir, 'workspace');
		const copilotHome = path.join(tempDir, '.copilot');
		const originalEnv = {
			HOME: process.env.HOME,
			USERPROFILE: process.env.USERPROFILE,
			HOMEDRIVE: process.env.HOMEDRIVE,
			HOMEPATH: process.env.HOMEPATH,
			COPILOT_HOME: process.env.COPILOT_HOME,
		};
		const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
		process.env.HOME = tempDir;
		process.env.USERPROFILE = tempDir;
		process.env.HOMEDRIVE = '';
		process.env.HOMEPATH = tempDir;
		process.env.COPILOT_HOME = copilotHome;
		Object.defineProperty(vscode.workspace, 'workspaceFolders', {
			configurable: true,
			value: [{ uri: vscode.Uri.file(workspaceRoot) }],
		});
		try {
			await run(tempDir, workspaceRoot);
		} finally {
			restoreEnv('HOME', originalEnv.HOME);
			restoreEnv('USERPROFILE', originalEnv.USERPROFILE);
			restoreEnv('HOMEDRIVE', originalEnv.HOMEDRIVE);
			restoreEnv('HOMEPATH', originalEnv.HOMEPATH);
			restoreEnv('COPILOT_HOME', originalEnv.COPILOT_HOME);
			Object.defineProperty(vscode.workspace, 'workspaceFolders', {
				configurable: true,
				value: originalWorkspaceFolders,
			});
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

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Package icons are configured', () => {
		const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

		assert.strictEqual(packageJson.icon, 'images/copilot-workspace-manager.png');

		const activitybar = packageJson?.contributes?.viewsContainers?.activitybar;
		assert.ok(Array.isArray(activitybar));
		assert.ok(
			activitybar.some(
				(container: { id: string; icon: string }) =>
					container.id === 'copilot-workspace-manager' && container.icon === 'images/sidebar.png',
			),
		);

		const views = packageJson?.contributes?.views?.['copilot-workspace-manager'];
		assert.ok(Array.isArray(views));
		assert.ok(
			views.some((view: { id: string }) => view.id === 'copilot-workspace-manager.core'),
		);
		assert.ok(
			views.some((view: { id: string }) => view.id === 'copilot-workspace-manager.prompts'),
		);
		assert.ok(
			views.some((view: { id: string }) => view.id === 'copilot-workspace-manager.agents'),
		);

		const activationEvents = packageJson?.activationEvents;
		assert.ok(Array.isArray(activationEvents));
		assert.ok(
			activationEvents.includes('onView:copilot-workspace-manager.agents'),
		);
	});

	test('openPromptsFolder opens the workspace commands directory', async () => {
		await withTempWorkspace(async (homeDir, workspaceRoot) => {
			const commandsDir = path.join(workspaceRoot, '.claude', 'commands');
			fs.mkdirSync(commandsDir, { recursive: true });
			fs.mkdirSync(path.join(homeDir, '.copilot'), { recursive: true });
			fs.writeFileSync(path.join(homeDir, '.copilot', 'config.json'), '{}', 'utf8');
			await activateExtension();

			const originalOpenExternal = vscode.env.openExternal;
			let openedUri: vscode.Uri | undefined;
			(vscode.env as unknown as { openExternal: typeof originalOpenExternal }).openExternal =
				async (target) => {
					openedUri = target;
					return true;
				};
			try {
				await vscode.commands.executeCommand(
					'copilot-workspace-manager.openPromptsFolder',
					{
						fsPath: path.join(commandsDir, 'example.md'),
						nodeType: 'file',
					},
				);
			} finally {
				(vscode.env as unknown as { openExternal: typeof originalOpenExternal }).openExternal =
					originalOpenExternal;
			}

			assert.ok(openedUri);
			assert.strictEqual(
				path.normalize(openedUri?.fsPath ?? '').toLowerCase(),
				path.normalize(commandsDir).toLowerCase(),
			);
		});
	});

	test('openPromptsFolder shows a selection error when nothing is selected', async () => {
		await withTempWorkspace(async (homeDir) => {
			fs.mkdirSync(path.join(homeDir, '.copilot'), { recursive: true });
			fs.writeFileSync(path.join(homeDir, '.copilot', 'config.json'), '{}', 'utf8');
			await activateExtension();

			const originalShowErrorMessage = vscode.window.showErrorMessage;
			let shownMessage: string | undefined;
			(
				vscode.window as unknown as {
					showErrorMessage: typeof originalShowErrorMessage;
				}
			).showErrorMessage = async (message: string) => {
				shownMessage = message;
				return undefined;
			};
			try {
				await vscode.commands.executeCommand('copilot-workspace-manager.openPromptsFolder');
			} finally {
				(
					vscode.window as unknown as {
						showErrorMessage: typeof originalShowErrorMessage;
					}
				).showErrorMessage = originalShowErrorMessage;
			}

			assert.strictEqual(
				shownMessage,
				'Please select a target folder to open.',
			);
		});
	});
});

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

async function withTempWorkspace(run: (homeDir: string, workspaceRoot: string) => Promise<void>): Promise<void> {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-home-'));
	const workspaceRoot = path.join(tempDir, 'workspace');
	const copilotHome = path.join(tempDir, '.copilot');
	const originalEnv: EnvSnapshot = {
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

async function withSyncSettings(
	values: Partial<Record<'copilotFolder' | 'skillsFolder' | 'templatesFolder' | 'agentFolder', string>>,
	run: () => Promise<void>,
): Promise<void> {
	const originalGetConfiguration = vscode.workspace.getConfiguration;
	(vscode.workspace as unknown as { getConfiguration: typeof originalGetConfiguration }).getConfiguration =
		((section?: string) => {
			if (section !== 'copilot-workspace-manager') {
				return originalGetConfiguration(section);
			}
			return {
				get: <T>(key: string) => values[key as keyof typeof values] as T | undefined,
				inspect: <T>(key: string) => ({
					key,
					globalValue: values[key as keyof typeof values] as T | undefined,
				}),
				has: () => true,
				update: async () => undefined,
			} as vscode.WorkspaceConfiguration;
		}) as typeof originalGetConfiguration;
	try {
		await run();
	} finally {
		(vscode.workspace as unknown as { getConfiguration: typeof originalGetConfiguration }).getConfiguration =
			originalGetConfiguration;
	}
}

async function withConfirmedSync(run: () => Promise<void>): Promise<void> {
	const originalWarning = vscode.window.showWarningMessage;
	(vscode.window as unknown as { showWarningMessage: typeof originalWarning })
		.showWarningMessage = async () => 'OK';
	try {
		await run();
	} finally {
		(vscode.window as unknown as { showWarningMessage: typeof originalWarning })
			.showWarningMessage = originalWarning;
	}
}

suite('Sync commands', () => {
	test('syncSkills syncs the configured folder with the user skills directory', async () => {
		await withTempWorkspace(async (homeDir, workspaceRoot) => {
			await activateExtension();
			const copilotRoot = path.join(homeDir, '.copilot');
			const externalSkillsDir = path.join(homeDir, 'external-skills');
			fs.mkdirSync(path.join(workspaceRoot, '.github', 'skills'), { recursive: true });
			fs.mkdirSync(path.join(workspaceRoot, '.claude', 'skills'), { recursive: true });
			fs.mkdirSync(path.join(externalSkillsDir, 'review'), { recursive: true });
			fs.mkdirSync(copilotRoot, { recursive: true });
			fs.writeFileSync(path.join(copilotRoot, 'config.json'), '{}', 'utf8');
			fs.writeFileSync(
				path.join(externalSkillsDir, 'review', 'SKILL.md'),
				'---\nname: review\n---\n',
				'utf8',
			);

			await withSyncSettings({ skillsFolder: externalSkillsDir }, async () => {
				await withConfirmedSync(async () => {
					await vscode.commands.executeCommand('copilot-workspace-manager.syncSkills');
				});
			});

			assert.ok(
				fs.existsSync(path.join(copilotRoot, 'skills', 'review', 'SKILL.md')),
			);
			assert.ok(
				!fs.existsSync(path.join(workspaceRoot, '.github', 'skills', 'review', 'SKILL.md')),
			);
		});
	});

	test('syncAgents syncs the configured folder with the user agent root only', async () => {
		await withTempWorkspace(async (homeDir, workspaceRoot) => {
			await activateExtension();
			const copilotRoot = path.join(homeDir, '.copilot');
			const externalAgentsDir = path.join(homeDir, 'external-agents');
			fs.mkdirSync(path.join(workspaceRoot, '.github', 'agents'), { recursive: true });
			fs.mkdirSync(path.join(workspaceRoot, '.claude', 'agents'), { recursive: true });
			fs.mkdirSync(externalAgentsDir, { recursive: true });
			fs.mkdirSync(copilotRoot, { recursive: true });
			fs.writeFileSync(path.join(copilotRoot, 'config.json'), '{}', 'utf8');
			fs.writeFileSync(
				path.join(externalAgentsDir, 'reviewer.agent.md'),
				'---\nname: reviewer\n---\n',
				'utf8',
			);

			await withSyncSettings({ agentFolder: externalAgentsDir }, async () => {
				await withConfirmedSync(async () => {
					await vscode.commands.executeCommand('copilot-workspace-manager.syncAgents');
				});
			});

			assert.ok(fs.existsSync(path.join(copilotRoot, 'agents', 'reviewer.agent.md')));
			assert.ok(
				!fs.existsSync(path.join(workspaceRoot, '.github', 'agents', 'reviewer.agent.md')),
			);
			assert.ok(
				!fs.existsSync(path.join(workspaceRoot, '.claude', 'agents', 'reviewer.agent.md')),
			);
		});
	});
});

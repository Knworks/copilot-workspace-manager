import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { WorkspaceTreeItem } from '../models/treeItems';

type EnvSnapshot = {
	HOME?: string;
	USERPROFILE?: string;
	HOMEDRIVE?: string;
	HOMEPATH?: string;
	COPILOT_HOME?: string;
};

async function withTempHome(run: (homeDir: string, workspaceRoot: string) => Promise<void>): Promise<void> {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-agent-'));
	const workspaceRoot = path.join(tempDir, 'workspace');
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
	process.env.COPILOT_HOME = path.join(tempDir, '.copilot');
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

function createWorkspace(homeDir: string): void {
	const copilotDir = path.join(homeDir, '.copilot');
	fs.mkdirSync(copilotDir, { recursive: true });
	fs.writeFileSync(path.join(copilotDir, 'config.json'), '{}', 'utf8');
}

async function activateExtension(): Promise<void> {
	const extension = vscode.extensions.getExtension('Knworks.copilot-workspace-manager');
	assert.ok(extension, 'extension not found');
	await extension.activate();
}

function createAgentItem(agentFilePath: string): WorkspaceTreeItem {
	return new WorkspaceTreeItem(
		'file',
		'agents',
		path.basename(agentFilePath),
		vscode.TreeItemCollapsibleState.None,
		agentFilePath,
	);
}

suite('Agent commands', () => {
	test('addAgent creates .agent.md with frontmatter', async () => {
		await withTempHome(async (homeDir, workspaceRoot) => {
			createWorkspace(homeDir);
			await activateExtension();

			let inputCount = 0;
			const originalInput = vscode.window.showInputBox;
			const originalPick = vscode.window.showQuickPick;
			(vscode.window as unknown as { showInputBox: typeof originalInput }).showInputBox =
				async () => {
					inputCount += 1;
					return inputCount === 1 ? 'reviewer' : 'Security reviewer';
				};
			(vscode.window as unknown as { showQuickPick: typeof originalPick }).showQuickPick =
				async (items: any) =>
					items.find((item: { label?: string }) => item.label === 'Workspace Agents') ?? items[0];

			try {
				await vscode.commands.executeCommand('copilot-workspace-manager.addAgent');
			} finally {
				(vscode.window as unknown as { showInputBox: typeof originalInput }).showInputBox =
					originalInput;
				(vscode.window as unknown as { showQuickPick: typeof originalPick }).showQuickPick =
					originalPick;
			}

			const createdPath = path.join(workspaceRoot, '.github', 'agents', 'reviewer.agent.md');
			assert.ok(fs.existsSync(createdPath));
			const contents = fs.readFileSync(createdPath, 'utf8');
			assert.ok(contents.includes('name: "reviewer"'));
			assert.ok(contents.includes('description: "Security reviewer"'));
		});
	});

	test('editAgent renames .agent.md and updates frontmatter', async () => {
		await withTempHome(async (homeDir, workspaceRoot) => {
			createWorkspace(homeDir);
			const agentsDir = path.join(workspaceRoot, '.github', 'agents');
			fs.mkdirSync(agentsDir, { recursive: true });
			const currentFilePath = path.join(agentsDir, 'old-name.agent.md');
			fs.writeFileSync(currentFilePath, '---\nname: old-name\ndescription: old\n---\nbody', 'utf8');
			await activateExtension();

			let inputCount = 0;
			const originalInput = vscode.window.showInputBox;
			(vscode.window as unknown as { showInputBox: typeof originalInput }).showInputBox =
				async () => {
					inputCount += 1;
					return inputCount === 1 ? 'new-name' : 'new description';
				};
			try {
				await vscode.commands.executeCommand(
					'copilot-workspace-manager.editAgent',
					createAgentItem(currentFilePath),
				);
			} finally {
				(vscode.window as unknown as { showInputBox: typeof originalInput }).showInputBox =
					originalInput;
			}

			const nextPath = path.join(agentsDir, 'new-name.agent.md');
			assert.ok(!fs.existsSync(currentFilePath));
			assert.ok(fs.existsSync(nextPath));
			const contents = fs.readFileSync(nextPath, 'utf8');
			assert.ok(contents.includes('name: "new-name"'));
			assert.ok(contents.includes('description: "new description"'));
		});
	});

	test('deleteAgent removes .agent.md without config mutation', async () => {
		await withTempHome(async (homeDir, workspaceRoot) => {
			createWorkspace(homeDir);
			const targetPath = path.join(workspaceRoot, '.github', 'agents', 'delete-me.agent.md');
			fs.mkdirSync(path.dirname(targetPath), { recursive: true });
			fs.writeFileSync(targetPath, '---\nname: delete-me\n---\n', 'utf8');
			await activateExtension();
			const originalWarning = vscode.window.showWarningMessage;
			(vscode.window as unknown as { showWarningMessage: typeof originalWarning })
				.showWarningMessage = async () => 'OK';
			try {
				await vscode.commands.executeCommand(
					'copilot-workspace-manager.deleteAgent',
					createAgentItem(targetPath),
				);
			} finally {
				(vscode.window as unknown as { showWarningMessage: typeof originalWarning })
					.showWarningMessage = originalWarning;
			}

			assert.ok(!fs.existsSync(targetPath));
			assert.strictEqual(
				fs.readFileSync(path.join(homeDir, '.copilot', 'config.json'), 'utf8'),
				'{}',
			);
		});
	});
});

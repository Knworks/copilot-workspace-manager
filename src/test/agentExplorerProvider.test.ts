import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getUnavailableLabel } from '../services/workspaceStatus';
import { AgentExplorerProvider } from '../views/agentExplorerProvider';

const contextStub = {} as vscode.ExtensionContext;

suite('Agent explorer provider', () => {
	test('returns flat .agent.md files with open command and status icons', () => {
		const provider = new AgentExplorerProvider(
			contextStub,
			() => ({ isAvailable: true }),
			(agentsDir) => {
				if (agentsDir.endsWith(path.join('root', 'workspace'))) {
					return [
						{
							name: 'beta.agent.md',
							fullPath: path.join('root', 'workspace', 'beta.agent.md'),
							isFile: true,
						},
						{
							name: 'alpha.agent.md',
							fullPath: path.join('root', 'workspace', 'alpha.agent.md'),
							isFile: true,
						},
					];
				}
				return [];
			},
			() => [
				{
					kind: 'project',
					label: 'Workspace Agents',
					rootPath: path.join('root', 'workspace'),
					priority: 1,
				},
			],
		);

		const items = provider.getChildren() as vscode.TreeItem[];
		assert.deepStrictEqual(items.map((item) => item.label), ['alpha.agent.md', 'beta.agent.md']);
		assert.strictEqual(items[0].command?.command, 'copilot-workspace-manager.openFile');
		assert.strictEqual(items[0].description, 'Workspace Agents');
		assert.ok(items[0].iconPath instanceof vscode.ThemeIcon);
		assert.strictEqual((items[0].iconPath as vscode.ThemeIcon).id, 'hubot');
	});

	test('shows plugin markdown agents without .agent suffix', () => {
		const provider = new AgentExplorerProvider(
			contextStub,
			() => ({ isAvailable: true }),
			(agentsDir) => {
				if (agentsDir.endsWith(path.join('root', 'plugin-agents'))) {
					return [
						{
							name: 'database-admin.md',
							fullPath: path.join('root', 'plugin-agents', 'database-admin.md'),
							isFile: true,
						},
					];
				}
				return [];
			},
			() => [
				{
					kind: 'plugin',
					label: 'Plugin Agents',
					rootPath: path.join('root', 'plugin-agents'),
					priority: 3,
				},
			],
		);

		const items = provider.getChildren() as vscode.TreeItem[];
		assert.deepStrictEqual(items.map((item) => item.label), ['database-admin.md']);
		assert.ok(items[0].iconPath instanceof vscode.ThemeIcon);
		assert.strictEqual((items[0].iconPath as vscode.ThemeIcon).id, 'lock');
	});

	test('returns unavailable item when not available', () => {
		const provider = new AgentExplorerProvider(
			contextStub,
			() => ({ isAvailable: false, reason: 'missing' }),
			() => [],
			() => [],
		);
		const items = provider.getChildren() as vscode.TreeItem[];
		assert.strictEqual(items.length, 1);
		assert.strictEqual(items[0].label, getUnavailableLabel('missing'));
	});

	test('returns empty item when no agents exist', () => {
		const provider = new AgentExplorerProvider(
			contextStub,
			() => ({ isAvailable: true }),
			() => [],
			() => [],
		);
		const items = provider.getChildren() as vscode.TreeItem[];
		assert.strictEqual(items.length, 1);
		assert.strictEqual(items[0].label, 'No Sub Agents to display.');
	});

	test('uses disabled icon when agent disables user and model invocation', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'disabled-agent-icon-'));
		try {
			const agentsDir = path.join(tempDir, 'agents');
			const agentPath = path.join(agentsDir, 'disabled.agent.md');
			fs.mkdirSync(agentsDir, { recursive: true });
			fs.writeFileSync(
				agentPath,
				[
					'---',
					'name: disabled',
					'user-invocable: false',
					'disable-model-invocation: true',
					'---',
					'Instructions.',
				].join('\n'),
				'utf8',
			);
			const provider = new AgentExplorerProvider(
				contextStub,
				() => ({ isAvailable: true }),
				() => [
					{
						name: 'disabled.agent.md',
						fullPath: agentPath,
						isFile: true,
					},
				],
				() => [
					{
						kind: 'project',
						label: 'Workspace Agents',
						rootPath: agentsDir,
						priority: 1,
					},
				],
			);

			const items = provider.getChildren() as vscode.TreeItem[];

			assert.ok(items[0].iconPath instanceof vscode.ThemeIcon);
			assert.strictEqual((items[0].iconPath as vscode.ThemeIcon).id, 'circle-slash');
			assert.ok((items[0].iconPath as vscode.ThemeIcon).color instanceof vscode.ThemeColor);
			assert.strictEqual((items[0].iconPath as vscode.ThemeIcon).color?.id, 'disabledForeground');
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { getUnavailableLabel } from '../services/workspaceStatus';
import { AgentExplorerProvider } from '../views/agentExplorerProvider';

const contextStub = {} as vscode.ExtensionContext;

suite('Agent explorer provider', () => {
	test('returns only .agent.md files with open command and status icons', () => {
		const provider = new AgentExplorerProvider(
			contextStub,
			() => ({ isAvailable: true }),
			() => [
				{
					name: 'beta.agent.md',
					fullPath: path.join('root', 'agents', 'beta.agent.md'),
					isFile: true,
				},
				{
					name: 'alpha.agent.md',
					fullPath: path.join('root', 'agents', 'alpha.agent.md'),
					isFile: true,
				},
				{
					name: 'README.md',
					fullPath: path.join('root', 'agents', 'README.md'),
					isFile: true,
				},
				{
					name: 'nested',
					fullPath: path.join('root', 'agents', 'nested'),
					isFile: false,
				},
			],
			() => [
				{
					kind: 'project',
					label: 'Workspace Agents',
					rootPath: path.join('root', 'agents'),
					priority: 2,
				},
			],
		);

		const roots = provider.getChildren() as vscode.TreeItem[];
		assert.deepStrictEqual(roots.map((item) => item.label), ['Workspace Agents']);

		const items = provider.getChildren(roots[0] as never) as vscode.TreeItem[];
		assert.deepStrictEqual(
			items.map((item) => item.label),
			['alpha.agent.md', 'beta.agent.md'],
		);
		assert.strictEqual(items[0].command?.command, 'copilot-workspace-manager.openFile');
		assert.strictEqual(items[1].command?.command, 'copilot-workspace-manager.openFile');
		assert.strictEqual(items[0].contextValue, 'copilot-agent-file');
		assert.strictEqual(items[1].contextValue, 'copilot-agent-file');
		assert.strictEqual(items[0].description, 'Workspace Agents');

		assert.ok(items[0].iconPath instanceof vscode.ThemeIcon);
		assert.strictEqual((items[0].iconPath as vscode.ThemeIcon).id, 'hubot');
		assert.strictEqual((items[0].iconPath as vscode.ThemeIcon).color, undefined);

		assert.ok(items[1].iconPath instanceof vscode.ThemeIcon);
		assert.strictEqual((items[1].iconPath as vscode.ThemeIcon).id, 'hubot');
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

});

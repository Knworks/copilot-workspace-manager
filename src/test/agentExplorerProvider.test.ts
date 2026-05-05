import * as assert from 'assert';
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

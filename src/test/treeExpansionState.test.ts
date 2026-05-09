import * as assert from 'assert';
import path from 'path';
import * as vscode from 'vscode';
import { WorkspaceTreeItem } from '../models/treeItems';
import { TreeExpansionState } from '../services/treeExpansionState';

suite('Tree expansion state', () => {
	test('renames expanded paths under renamed folder', () => {
		const state = new TreeExpansionState();
		const rootPath = path.join('root', 'docs');
		const childPath = path.join(rootPath, 'child');
		state.registerExpanded(
			'commands',
			new WorkspaceTreeItem(
				'folder',
				'commands',
				'docs',
				vscode.TreeItemCollapsibleState.Collapsed,
				rootPath,
			),
		);
		state.registerExpanded(
			'commands',
			new WorkspaceTreeItem(
				'folder',
				'commands',
				'child',
				vscode.TreeItemCollapsibleState.Collapsed,
				childPath,
			),
		);

		const renamedRoot = path.join('root', 'docs-renamed');
		state.renamePaths('commands', rootPath, renamedRoot);

		const expanded = state.listExpanded('commands').sort();
		assert.deepStrictEqual(expanded, [renamedRoot, path.join(renamedRoot, 'child')].sort());
	});

	test('collapsed paths are removed from expansion state', () => {
		const state = new TreeExpansionState();
		const rootPath = path.join('root', 'docs');
		const item = new WorkspaceTreeItem(
			'folder',
			'commands',
			'docs',
			vscode.TreeItemCollapsibleState.Collapsed,
			rootPath,
		);
		state.registerExpanded('commands', item);
		state.registerCollapsed('commands', item);

		assert.deepStrictEqual(state.listExpanded('commands'), []);
	});
});

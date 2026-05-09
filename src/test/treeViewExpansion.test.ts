import * as assert from 'assert';
import * as vscode from 'vscode';
import { WorkspaceTreeItem } from '../models/treeItems';
import { expandParentFolder } from '../services/treeViewExpansion';

type RevealOptions = {
	expand?: boolean | number;
	focus?: boolean;
	select?: boolean;
};

suite('Tree view expansion', () => {
	test('Given root selection When expanding Then reveal is not called', async () => {
		// Arrange
		const reveals: Array<{
			item: WorkspaceTreeItem;
			options: RevealOptions | undefined;
		}> = [];
		const viewStub = {
			reveal: async (
				item: WorkspaceTreeItem,
				options?: RevealOptions,
			) => {
				reveals.push({ item, options });
			},
		} as unknown as vscode.TreeView<WorkspaceTreeItem>;
		const views = {
			commands: viewStub,
			skills: viewStub,
			templates: viewStub,
		};
		const selection = new WorkspaceTreeItem(
			'root',
			'commands',
			'commands',
			vscode.TreeItemCollapsibleState.Expanded,
			'/root/commands',
		);

		// Act
		await expandParentFolder(selection, views);

		// Assert
		assert.strictEqual(reveals.length, 0);
	});

	test('Given folder selection When expanding Then reveal is called', async () => {
		// Arrange
		const reveals: Array<{
			item: WorkspaceTreeItem;
			options: RevealOptions | undefined;
		}> = [];
		const viewStub = {
			reveal: async (
				item: WorkspaceTreeItem,
				options?: RevealOptions,
			) => {
				reveals.push({ item, options });
			},
		} as unknown as vscode.TreeView<WorkspaceTreeItem>;
		const views = {
			commands: viewStub,
			skills: viewStub,
			templates: viewStub,
		};
		const selection = new WorkspaceTreeItem(
			'folder',
			'commands',
			'commands',
			vscode.TreeItemCollapsibleState.Collapsed,
			'/root/commands',
		);

		// Act
		await expandParentFolder(selection, views);

		// Assert
		assert.strictEqual(reveals.length, 1);
		assert.strictEqual(reveals[0].item, selection);
		assert.deepStrictEqual(reveals[0].options, {
			expand: true,
			focus: false,
			select: false,
		});
	});

	test('Given file selection When expanding Then reveal is called', async () => {
		// Arrange
		const reveals: Array<{
			item: WorkspaceTreeItem;
			options: RevealOptions | undefined;
		}> = [];
		const viewStub = {
			reveal: async (
				item: WorkspaceTreeItem,
				options?: RevealOptions,
			) => {
				reveals.push({ item, options });
			},
		} as unknown as vscode.TreeView<WorkspaceTreeItem>;
		const views = {
			commands: viewStub,
			skills: viewStub,
			templates: viewStub,
		};
		const selection = new WorkspaceTreeItem(
			'file',
			'commands',
			'note.md',
			vscode.TreeItemCollapsibleState.None,
			'/root/commands/note.md',
		);

		// Act
		await expandParentFolder(selection, views);

		// Assert
		assert.strictEqual(reveals.length, 1);
		assert.strictEqual(reveals[0].item, selection);
		assert.deepStrictEqual(reveals[0].options, {
			expand: true,
			focus: false,
			select: false,
		});
	});
});

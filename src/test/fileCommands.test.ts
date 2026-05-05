import * as assert from 'assert';
import path from 'path';
import {
	isCaseOnlyRename,
	isSamePath,
	requiresFolderSelectionForFileAdd,
	resolveAddViewSelection,
	shouldPickSkillLocationForAdd,
	shouldDeleteRenameTarget,
} from '../commands/fileCommands';
import { WorkspaceTreeItem } from '../models/treeItems';

suite('File commands', () => {
	test('does not delete when source and target are identical', () => {
		const sourcePath = path.join('root', 'AGENTS.md');
		assert.strictEqual(shouldDeleteRenameTarget(sourcePath, sourcePath), false);
		assert.strictEqual(isSamePath(sourcePath, sourcePath), true);
	});

	test('detects case-only rename overwrite behavior', () => {
		const sourcePath = path.join('root', 'AGENTS.md');
		const targetPath = path.join('root', 'agents.md');
		const expected = process.platform === 'win32';
		assert.strictEqual(shouldDeleteRenameTarget(sourcePath, targetPath), !expected);
		assert.strictEqual(isCaseOnlyRename(sourcePath, targetPath), expected);
	});

test('resolveAddViewSelection ignores inactive selection', () => {
	const selection = new WorkspaceTreeItem(
		'folder',
		'prompts',
		'docs',
		0,
		path.join('root', 'docs'),
	);
	const item = new WorkspaceTreeItem(
		'folder',
		'prompts',
		'docs-2',
		0,
		path.join('root', 'docs-2'),
	);
	assert.strictEqual(
		resolveAddViewSelection(false, item, selection),
		undefined,
	);
});

	test('resolveAddViewSelection returns selection when active', () => {
		const selection = new WorkspaceTreeItem(
			'folder',
			'prompts',
			'docs',
			0,
			path.join('root', 'docs'),
		);
		assert.strictEqual(resolveAddViewSelection(true, undefined, selection), selection);
	});

test('resolveAddViewSelection prefers item over selection', () => {
	const selection = new WorkspaceTreeItem(
		'folder',
		'prompts',
		'docs',
		0,
		path.join('root', 'docs'),
	);
	const item = new WorkspaceTreeItem(
		'folder',
		'prompts',
		'docs-2',
		0,
		path.join('root', 'docs-2'),
	);
	assert.strictEqual(resolveAddViewSelection(true, item, selection), item);
});

	test('requiresFolderSelectionForFileAdd requires a folder only for skills files', () => {
		const root = new WorkspaceTreeItem(
			'root',
			'skills',
			'skills',
			0,
			path.join('root', 'skills'),
		);
		const file = new WorkspaceTreeItem(
			'file',
			'skills',
			'guide.md',
			0,
			path.join('root', 'skills', 'sample', 'guide.md'),
		);
		const folder = new WorkspaceTreeItem(
			'folder',
			'skills',
			'sample',
			0,
			path.join('root', 'skills', 'sample'),
		);
		const promptFolder = new WorkspaceTreeItem(
			'folder',
			'prompts',
			'docs',
			0,
			path.join('root', 'prompts', 'docs'),
		);

		assert.strictEqual(requiresFolderSelectionForFileAdd(root), true);
		assert.strictEqual(requiresFolderSelectionForFileAdd(file), true);
	assert.strictEqual(requiresFolderSelectionForFileAdd(folder), false);
	assert.strictEqual(requiresFolderSelectionForFileAdd(promptFolder), false);
	});

	test('shouldPickSkillLocationForAdd only prompts at skills root', () => {
		const root = new WorkspaceTreeItem(
			'root',
			'skills',
			'skills',
			0,
			path.join('root', 'skills'),
		);
		const folder = new WorkspaceTreeItem(
			'folder',
			'skills',
			'sample',
			0,
			path.join('root', 'skills', 'sample'),
		);
		const file = new WorkspaceTreeItem(
			'file',
			'skills',
			'guide.md',
			0,
			path.join('root', 'skills', 'sample', 'guide.md'),
		);
		const promptRoot = new WorkspaceTreeItem(
			'root',
			'prompts',
			'prompts',
			0,
			path.join('root', 'prompts'),
		);

		assert.strictEqual(shouldPickSkillLocationForAdd(root), true);
		assert.strictEqual(shouldPickSkillLocationForAdd(folder), false);
		assert.strictEqual(shouldPickSkillLocationForAdd(file), false);
		assert.strictEqual(shouldPickSkillLocationForAdd(promptRoot), false);
	});
});

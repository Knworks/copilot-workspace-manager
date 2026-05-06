import * as assert from 'assert';
import path from 'path';
import {
	buildSkillMarkdownTemplate,
	getCreatableLocationsForAdd,
	isCaseOnlyRename,
	isSamePath,
	requiresFolderSelectionForFileAdd,
	resolveAddViewSelection,
	resolveFolderAddViewSelection,
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

	test('resolveFolderAddViewSelection ignores tree selection for toolbar commands', () => {
		const rootPath = path.join('root', 'skills');
		const folder = new WorkspaceTreeItem(
			'folder',
			'skills',
			'sample',
			0,
			path.join('root', 'skills', 'sample'),
		);

		const resolved =
			resolveFolderAddViewSelection(
				'skills',
				undefined,
				folder,
				rootPath,
			);

		assert.strictEqual(resolved.nodeType, 'root');
		assert.strictEqual(resolved.kind, 'skills');
		assert.strictEqual(resolved.fsPath, rootPath);
	});

	test('resolveFolderAddViewSelection falls back to root when no folder is selected', () => {
		const rootPath = path.join('root', 'skills');
		const file = new WorkspaceTreeItem(
			'file',
			'skills',
			'SKILL.md',
			0,
			path.join('root', 'skills', 'sample', 'SKILL.md'),
		);

		const resolved = resolveFolderAddViewSelection(
			'skills',
			undefined,
			file,
			rootPath,
		);

		assert.strictEqual(resolved.nodeType, 'root');
		assert.strictEqual(resolved.kind, 'skills');
		assert.strictEqual(resolved.fsPath, rootPath);
	});

	test('resolveFolderAddViewSelection uses explicit folder items', () => {
		const rootPath = path.join('root', 'skills');
		const folder = new WorkspaceTreeItem(
			'folder',
			'skills',
			'sample',
			0,
			path.join('root', 'skills', 'sample'),
		);

		assert.strictEqual(
			resolveFolderAddViewSelection('skills', folder, undefined, rootPath),
			folder,
		);
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

	test('getCreatableLocationsForAdd keeps all workspace and user skill roots but excludes plugin roots', () => {
		const locations = [
			{ kind: 'project', label: 'Workspace Skills', rootPath: path.join('repo', '.github', 'skills'), createPath: path.join('repo', '.github', 'skills') },
			{ kind: 'project', label: 'Workspace Skills', rootPath: path.join('repo', '.agents', 'skills'), createPath: path.join('repo', '.agents', 'skills') },
			{ kind: 'project', label: 'Workspace Skills', rootPath: path.join('repo', '.claude', 'skills'), createPath: path.join('repo', '.claude', 'skills') },
			{ kind: 'user', label: 'User Skills', rootPath: path.join('home', '.copilot', 'skills'), createPath: path.join('home', '.copilot', 'skills') },
			{ kind: 'user', label: 'User Skills', rootPath: path.join('home', '.agents', 'skills'), createPath: path.join('home', '.agents', 'skills') },
			{ kind: 'user', label: 'User Skills', rootPath: path.join('home', '.claude', 'skills'), createPath: path.join('home', '.claude', 'skills') },
			{ kind: 'plugin', label: 'Plugin Skills', rootPath: path.join('home', '.copilot', 'installed-plugins', 'x', 'skills'), createPath: path.join('home', '.copilot', 'installed-plugins', 'x', 'skills') },
		];

		const creatable = getCreatableLocationsForAdd('skills', locations);

		assert.deepStrictEqual(
			creatable.map((location) => location.createPath),
			[
				path.join('repo', '.github', 'skills'),
				path.join('repo', '.agents', 'skills'),
				path.join('repo', '.claude', 'skills'),
				path.join('home', '.copilot', 'skills'),
				path.join('home', '.agents', 'skills'),
				path.join('home', '.claude', 'skills'),
			],
		);
	});

	test('buildSkillMarkdownTemplate creates the default SKILL.md frontmatter', () => {
		assert.strictEqual(
			buildSkillMarkdownTemplate('sample-skill'),
			`---
name: sample-skill
description: ""
---
`,
		);
	});

	test('buildSkillMarkdownTemplate writes the provided description', () => {
		assert.strictEqual(
			buildSkillMarkdownTemplate('sample-skill', 'sample description'),
			`---
name: sample-skill
description: "sample description"
---
`,
		);
	});

	test('buildSkillMarkdownTemplate escapes quotes in the description', () => {
		assert.strictEqual(
			buildSkillMarkdownTemplate('sample-skill', 'say "hello"'),
			`---
name: sample-skill
description: "say \\"hello\\""
---
`,
		);
	});
});

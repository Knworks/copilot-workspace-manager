import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { WorkspaceTreeItem } from '../models/treeItems';
import { FileExplorerProvider } from '../views/fileExplorerProvider';
import { getUnavailableLabel } from '../services/workspaceStatus';

const contextStub = {
	asAbsolutePath: (target: string) => path.join('root', target),
} as vscode.ExtensionContext;

suite('File explorer provider', () => {
	test('returns file children when available', () => {
		const provider = new FileExplorerProvider(
			'prompts',
			contextStub,
			() => ({ isAvailable: true }),
			'root',
			() => [
				{
					name: 'review.md',
					fullPath: path.join('root', 'review.md'),
					isDirectory: false,
					isFile: true,
				},
			],
		);
		const items = provider.getChildren() as vscode.TreeItem[];
		assert.strictEqual(items.length, 1);
		assert.strictEqual(items[0].label, 'review.md');
	});

	test('returns unavailable item when not available', () => {
		const provider = new FileExplorerProvider(
			'prompts',
			contextStub,
			() => ({ isAvailable: false, reason: 'missing' }),
			'root',
		);
		const items = provider.getChildren() as vscode.TreeItem[];
		assert.strictEqual(items.length, 1);
		assert.strictEqual(items[0].label, getUnavailableLabel('missing'));
	});

	test('returns prompts empty item when no entries exist', () => {
		const provider = new FileExplorerProvider(
			'prompts',
			contextStub,
			() => ({ isAvailable: true }),
			'root',
			() => [],
		);
		const items = provider.getChildren() as vscode.TreeItem[];
		assert.strictEqual(items.length, 1);
		assert.strictEqual(items[0].label, 'No commands to display.');
	});

	test('prompt files use terminal icon', () => {
		const provider = new FileExplorerProvider(
			'prompts',
			contextStub,
			() => ({ isAvailable: true }),
			'root',
			() => [
				{
					name: 'note.md',
					fullPath: path.join('root', 'note.md'),
					isDirectory: false,
					isFile: true,
				},
			],
		);
		const children = provider.getChildren() as vscode.TreeItem[];
		assert.ok(children[0].iconPath instanceof vscode.ThemeIcon);
		assert.strictEqual((children[0].iconPath as vscode.ThemeIcon).id, 'terminal');
	});

	test('templates ignore folders and hidden entries', () => {
		const provider = new FileExplorerProvider(
			'templates',
			contextStub,
			() => ({ isAvailable: true }),
			'root',
			() => [
				{
					name: '.hidden.md',
					fullPath: path.join('root', '.hidden.md'),
					isDirectory: false,
					isFile: true,
				},
				{
					name: 'folder',
					fullPath: path.join('root', 'folder'),
					isDirectory: true,
					isFile: false,
				},
				{
					name: 'visible.md',
					fullPath: path.join('root', 'visible.md'),
					isDirectory: false,
					isFile: true,
				},
			],
		);
		const children = provider.getChildren() as vscode.TreeItem[];
		assert.deepStrictEqual(children.map((item) => item.label), ['visible.md']);
	});

	test('skills explorer combines multiple skill locations with location metadata', () => {
		const entriesByRoot = new Map([
			[
				path.join(process.env.HOME ?? '', '.copilot', 'skills'),
				[
					{
						name: 'user-skill',
						fullPath: path.join(process.env.HOME ?? '', '.copilot', 'skills', 'user-skill'),
						isDirectory: true,
						isFile: false,
					},
				],
			],
		]);
		const provider = new FileExplorerProvider(
			'skills',
			contextStub,
			() => ({ isAvailable: true }),
			undefined,
			(targetPath) => entriesByRoot.get(targetPath) ?? [],
		);

		const children = provider.getChildren() as vscode.TreeItem[];
		assert.ok(children.some((item) => item.label === 'user-skill'));
		const userSkill = children.find((item) => item.label === 'user-skill');
		assert.ok(String(userSkill?.tooltip).includes('User Skills'));
	});

	test('skills explorer shows status icons only for skill root folders and SKILL.md', () => {
		const workspaceSkillsRoot = path.join(process.env.HOME ?? '', '.copilot', 'skills');
		const enabledSkillRoot = path.join(workspaceSkillsRoot, 'enabled-skill');
		const entriesByRoot = new Map<string, Array<{
			name: string;
			fullPath: string;
			isDirectory: boolean;
			isFile: boolean;
		}>>([
			[
				workspaceSkillsRoot,
				[
					{
						name: 'enabled-skill',
						fullPath: enabledSkillRoot,
						isDirectory: true,
						isFile: false,
					},
				],
			],
			[
				enabledSkillRoot,
				[
					{
						name: 'SKILL.md',
						fullPath: path.join(enabledSkillRoot, 'SKILL.md'),
						isDirectory: false,
						isFile: true,
					},
				],
			],
		]);
		const provider = new FileExplorerProvider(
			'skills',
			contextStub,
			() => ({ isAvailable: true }),
			undefined,
			(targetPath) => entriesByRoot.get(targetPath) ?? [],
		);

		const rootChildren = provider.getChildren() as vscode.TreeItem[];
		const root = rootChildren[0] as WorkspaceTreeItem;
		assert.ok(root.iconPath instanceof vscode.ThemeIcon);
		assert.strictEqual((root.iconPath as vscode.ThemeIcon).id, 'folder-library');

		const skillChildren = provider.getChildren(root) as vscode.TreeItem[];
		assert.ok(skillChildren[0].iconPath instanceof vscode.ThemeIcon);
		assert.strictEqual((skillChildren[0].iconPath as vscode.ThemeIcon).id, 'agent');
	});
});

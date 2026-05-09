import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import { WorkspaceTreeItem } from '../models/treeItems';
import { FileExplorerProvider } from '../views/fileExplorerProvider';
import { getUnavailableLabel } from '../services/workspaceStatus';

const contextStub = {
	asAbsolutePath: (target: string) => path.join('root', target),
} as vscode.ExtensionContext;

function withTempDir(run: (root: string) => void): void {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-explorer-'));
	try {
		run(tempDir);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

suite('File explorer provider', () => {
	test('returns file children when available', () => {
		const provider = new FileExplorerProvider(
			'commands',
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
			'commands',
			contextStub,
			() => ({ isAvailable: false, reason: 'missing' }),
			'root',
		);
		const items = provider.getChildren() as vscode.TreeItem[];
		assert.strictEqual(items.length, 1);
		assert.strictEqual(items[0].label, getUnavailableLabel('missing'));
	});

	test('returns commands empty item when no entries exist', () => {
		const provider = new FileExplorerProvider(
			'commands',
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
			'commands',
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

	test('commands explorer includes plugin command locations', () => {
		withTempDir((root) => {
			const previousCopilotHome = process.env.COPILOT_HOME;
			process.env.COPILOT_HOME = path.join(root, '.copilot');
			try {
				const copilotHome = process.env.COPILOT_HOME;
				const pluginRoot = path.join(copilotHome, 'installed-plugins', '_direct', 'plugin-a');
				const commandsRoot = path.join(pluginRoot, 'commands');
				fs.mkdirSync(commandsRoot, { recursive: true });
				fs.writeFileSync(path.join(pluginRoot, 'plugin.json'), JSON.stringify({ commands: 'commands' }), 'utf8');
				fs.writeFileSync(
					path.join(copilotHome, 'config.json'),
					JSON.stringify({
						installedPlugins: [{ name: 'plugin-a', cache_path: pluginRoot, enabled: true }],
					}),
					'utf8',
				);

				const provider = new FileExplorerProvider(
					'commands',
					contextStub,
					() => ({ isAvailable: true }),
					undefined,
					(targetPath) => targetPath === commandsRoot
						? [{
							name: 'release-note.md',
							fullPath: path.join(commandsRoot, 'release-note.md'),
							isDirectory: false,
							isFile: true,
						}]
						: [],
				);

				const children = provider.getChildren() as vscode.TreeItem[];
				assert.strictEqual(children.length, 1);
				assert.strictEqual(children[0].label, 'release-note.md');
				assert.strictEqual(children[0].description, 'Plugin Commands');
			} finally {
				process.env.COPILOT_HOME = previousCopilotHome;
			}
		});
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

	test('skills explorer shows plugin skill root folder when manifest points directly to a skill', () => {
		withTempDir((root) => {
			const previousCopilotHome = process.env.COPILOT_HOME;
			process.env.COPILOT_HOME = path.join(root, '.copilot');
			try {
				const copilotHome = process.env.COPILOT_HOME;
				const pluginRoot = path.join(copilotHome, 'installed-plugins', '_direct', 'plugin-a');
				const directSkillRoot = path.join(pluginRoot, 'skills', 'sql-review');
				fs.mkdirSync(directSkillRoot, { recursive: true });
				fs.writeFileSync(path.join(pluginRoot, 'plugin.json'), JSON.stringify({ skills: ['skills/sql-review'] }), 'utf8');
				fs.writeFileSync(
					path.join(copilotHome, 'config.json'),
					JSON.stringify({
						installedPlugins: [{ name: 'plugin-a', cache_path: pluginRoot, enabled: true }],
					}),
					'utf8',
				);

				const provider = new FileExplorerProvider(
					'skills',
					contextStub,
					() => ({ isAvailable: true }),
					undefined,
					(targetPath) => {
						if (targetPath === directSkillRoot) {
							return [
								{
									name: 'SKILL.md',
									fullPath: path.join(directSkillRoot, 'SKILL.md'),
									isDirectory: false,
									isFile: true,
								},
								{
									name: 'references',
									fullPath: path.join(directSkillRoot, 'references'),
									isDirectory: true,
									isFile: false,
								},
							];
						}
						return [];
					},
				);

				const children = provider.getChildren() as vscode.TreeItem[];
				assert.strictEqual(children.length, 1);
				assert.strictEqual(children[0].label, 'sql-review');

				const skillChildren = provider.getChildren(children[0] as WorkspaceTreeItem) as vscode.TreeItem[];
				assert.deepStrictEqual(skillChildren.map((item) => item.label), ['references', 'SKILL.md']);
			} finally {
				process.env.COPILOT_HOME = previousCopilotHome;
			}
		});
	});
});

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	listInstalledPluginsFromConfig,
	resolvePluginManifestPath,
	setPluginEnabled,
} from '../services/pluginConfigService';

function withTempDir(run: (root: string) => void): void {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-config-'));
	try {
		run(tempDir);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

suite('Plugin config service', () => {
	test('reads installed plugins from config.json and applies enabledPlugins override', () => {
		withTempDir((root) => {
			const copilotDir = path.join(root, '.copilot');
			const pluginRoot = path.join(copilotDir, 'installed-plugins', 'marketplace', 'sample-plugin');
			fs.mkdirSync(path.join(pluginRoot, '.plugin'), { recursive: true });
			fs.writeFileSync(path.join(pluginRoot, '.plugin', 'plugin.json'), JSON.stringify({ name: 'sample-plugin' }), 'utf8');
			fs.writeFileSync(
				path.join(copilotDir, 'config.json'),
				JSON.stringify({
					installedPlugins: [
						{
							name: 'sample-plugin',
							marketplace: 'some-marketplace',
							cache_path: pluginRoot,
							enabled: true,
						},
					],
				}),
				'utf8',
			);
			fs.writeFileSync(
				path.join(copilotDir, 'settings.json'),
				JSON.stringify({
					enabledPlugins: {
						'sample-plugin@some-marketplace': false,
					},
				}),
				'utf8',
			);

			const plugins = listInstalledPluginsFromConfig(path.join(copilotDir, 'config.json'));

			assert.strictEqual(plugins.length, 1);
			assert.strictEqual(plugins[0].pluginSpec, 'sample-plugin@some-marketplace');
			assert.strictEqual(plugins[0].enabled, false);
			assert.strictEqual(plugins[0].manifestPath, path.join(pluginRoot, '.plugin', 'plugin.json'));
		});
	});

	test('reads installed plugins from commented config.json', () => {
		withTempDir((root) => {
			const copilotDir = path.join(root, '.copilot');
			const pluginRoot = path.join(copilotDir, 'installed-plugins', '_direct', 'sample-plugin');
			fs.mkdirSync(path.join(pluginRoot, '.plugin'), { recursive: true });
			fs.writeFileSync(path.join(pluginRoot, '.plugin', 'plugin.json'), JSON.stringify({ name: 'sample-plugin' }), 'utf8');
			fs.writeFileSync(
				path.join(copilotDir, 'config.json'),
				'// managed automatically\n{\n  "installedPlugins": [\n    {\n      "name": "sample-plugin",\n      "cache_path": "' + pluginRoot.replace(/\\/g, '\\\\') + '",\n      "enabled": true\n    }\n  ]\n}\n',
				'utf8',
			);

			const plugins = listInstalledPluginsFromConfig(path.join(copilotDir, 'config.json'));

			assert.strictEqual(plugins.length, 1);
			assert.strictEqual(plugins[0].pluginRoot, pluginRoot);
		});
	});

	test('setPluginEnabled writes only settings.json enabledPlugins', () => {
		withTempDir((root) => {
			const copilotDir = path.join(root, '.copilot');
			fs.mkdirSync(copilotDir, { recursive: true });
			fs.writeFileSync(path.join(copilotDir, 'config.json'), JSON.stringify({ installedPlugins: [] }), 'utf8');

			setPluginEnabled(path.join(copilotDir, 'config.json'), 'owner/repo', false);

			const settings = JSON.parse(fs.readFileSync(path.join(copilotDir, 'settings.json'), 'utf8')) as {
				enabledPlugins?: Record<string, boolean>;
			};
			assert.deepStrictEqual(settings.enabledPlugins, { 'owner/repo': false });
		});
	});

	test('resolvePluginManifestPath follows the configured candidate order', () => {
		withTempDir((root) => {
			const pluginRoot = path.join(root, 'plugin-root');
			fs.mkdirSync(path.join(pluginRoot, '.plugin'), { recursive: true });
			fs.mkdirSync(path.join(pluginRoot, '.github', 'plugin'), { recursive: true });
			fs.writeFileSync(path.join(pluginRoot, '.github', 'plugin', 'plugin.json'), '{}', 'utf8');
			fs.writeFileSync(path.join(pluginRoot, '.plugin', 'plugin.json'), '{}', 'utf8');

			assert.strictEqual(
				resolvePluginManifestPath(pluginRoot),
				path.join(pluginRoot, '.plugin', 'plugin.json'),
			);
		});
	});
});

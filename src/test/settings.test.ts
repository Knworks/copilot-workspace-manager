import * as assert from 'assert';
import {
	getMaxSessionHistoryCount,
	getSyncSettings,
} from '../services/settings';

type ConfigurationReader = {
	get: <T>(key: string) => T | undefined;
	inspect: <T>(key: string) =>
		| {
				key: string;
				globalValue?: T;
				workspaceValue?: T;
				workspaceFolderValue?: T;
		  }
		| undefined;
};

const createConfig = (values: Record<string, unknown>): ConfigurationReader => ({
	get: <T>(key: string) => values[key] as T | undefined,
	inspect: <T>(key: string) => {
		if (!Object.prototype.hasOwnProperty.call(values, key)) {
			return undefined;
		}
		return {
			key,
			globalValue: values[key] as T,
		};
	},
});

suite('Sync settings', () => {
	test('returns configured values', () => {
		const config = createConfig({
			copilotFolder: '/tmp/copilot',
			promptsFolder: '/tmp/prompts',
			skillsFolder: '/tmp/skills',
			templatesFolder: '/tmp/templates',
			agentFolder: '/tmp/agents',
		});

		const settings = getSyncSettings(config);

		assert.deepStrictEqual(settings, {
			copilotFolder: '/tmp/copilot',
			promptsFolder: '/tmp/prompts',
			skillsFolder: '/tmp/skills',
			templatesFolder: '/tmp/templates',
			agentFolder: '/tmp/agents',
		});
	});

	test('returns empty strings when values are missing', () => {
		const config = createConfig({});

		const settings = getSyncSettings(config);

		assert.deepStrictEqual(settings, {
			copilotFolder: '',
			promptsFolder: '',
			skillsFolder: '',
			templatesFolder: '',
			agentFolder: '',
		});
	});

	test('returns configured max session history count when explicitly set', () => {
		const config = createConfig({ maxSessionHistoryCount: 42 });

		const maxHistoryCount = getMaxSessionHistoryCount(config);

		assert.strictEqual(maxHistoryCount, 42);
	});

	test('returns default max session history count when not configured', () => {
		const config = createConfig({});

		const maxHistoryCount = getMaxSessionHistoryCount(config);

		assert.strictEqual(maxHistoryCount, 100);
	});

	test('returns default max session history count for non-positive values', () => {
		const config = createConfig({ maxSessionHistoryCount: 0 });

		const maxHistoryCount = getMaxSessionHistoryCount(config);

		assert.strictEqual(maxHistoryCount, 100);
	});
});

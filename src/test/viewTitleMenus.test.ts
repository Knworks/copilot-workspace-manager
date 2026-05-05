import * as assert from 'assert';
import fs from 'fs';
import path from 'path';

suite('View title menus', () => {
	test('Common actions are contributed to prompts/skills/templates view titles', () => {
		const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

		const menus = packageJson?.contributes?.menus;
		assert.ok(menus);
		assert.ok(!menus['viewContainer/title']);

		const viewTitle = menus['view/title'];
		assert.ok(Array.isArray(viewTitle));

		const commandDefinitions = packageJson?.contributes?.commands;
		assert.ok(Array.isArray(commandDefinitions));

		const commonCommands = [
			'copilot-workspace-manager.delete',
			'copilot-workspace-manager.rename',
			'copilot-workspace-manager.refreshAll',
		];

		const viewIds = [
			'copilot-workspace-manager.prompts',
			'copilot-workspace-manager.skills',
			'copilot-workspace-manager.templates',
		];

		const perViewCommands = [
			{
				command: 'copilot-workspace-manager.addPromptsFile',
				viewId: 'copilot-workspace-manager.prompts',
			},
			{
				command: 'copilot-workspace-manager.addSkillsFolder',
				viewId: 'copilot-workspace-manager.skills',
			},
			{
				command: 'copilot-workspace-manager.addSkillsFile',
				viewId: 'copilot-workspace-manager.skills',
			},
			{
				command: 'copilot-workspace-manager.addTemplatesFile',
				viewId: 'copilot-workspace-manager.templates',
			},
			{
				command: 'copilot-workspace-manager.openPromptsFolder',
				viewId: 'copilot-workspace-manager.prompts',
			},
			{
				command: 'copilot-workspace-manager.openSkillsFolder',
				viewId: 'copilot-workspace-manager.skills',
			},
			{
				command: 'copilot-workspace-manager.openTemplatesFolder',
				viewId: 'copilot-workspace-manager.templates',
			},
			{
				command: 'copilot-workspace-manager.openAgentsFolder',
				viewId: 'copilot-workspace-manager.agents',
			},
			{
				command: 'copilot-workspace-manager.addAgent',
				viewId: 'copilot-workspace-manager.agents',
			},
			{
				command: 'copilot-workspace-manager.openCopilotFolder',
				viewId: 'copilot-workspace-manager.core',
			},
		];

		const syncCommands = [
			{
				command: 'copilot-workspace-manager.syncCore',
				viewId: 'copilot-workspace-manager.core',
				configKey: 'config.copilot-workspace-manager.copilotFolder',
			},
			{
				command: 'copilot-workspace-manager.syncPrompts',
				viewId: 'copilot-workspace-manager.prompts',
			},
			{
				command: 'copilot-workspace-manager.syncSkills',
				viewId: 'copilot-workspace-manager.skills',
			},
			{
				command: 'copilot-workspace-manager.syncTemplates',
				viewId: 'copilot-workspace-manager.templates',
			},
			{
				command: 'copilot-workspace-manager.syncAgents',
				viewId: 'copilot-workspace-manager.agents',
			},
		];

		const managerCommands = [
			'copilot-workspace-manager.openSkillManager',
			'copilot-workspace-manager.openAgentManager',
			'copilot-workspace-manager.openMcpManager',
		];
		const excludedViewIds = ['copilot-workspace-manager.mcp', 'copilot-workspace-manager.menu'];

		const assertCommandDefinition = (command: string): void => {
			const commandEntry = commandDefinitions.find(
				(item: { command?: string }) => item.command === command,
			);
			assert.ok(commandEntry, `Missing command definition for ${command}`);
			assert.ok(commandEntry.icon, `Missing icon for ${command}`);
		};

		for (const command of commonCommands) {
			assertCommandDefinition(command);
			const entry = viewTitle.find(
				(item: { command?: string }) => item.command === command,
			);
			assert.ok(entry, `Missing view/title menu for ${command}`);
			const when = entry.when ?? '';
			const targetViewIds =
				command === 'copilot-workspace-manager.refreshAll'
					? [...viewIds, 'copilot-workspace-manager.mcp', 'copilot-workspace-manager.agents']
					: viewIds;
			const excludedForCommand =
				command === 'copilot-workspace-manager.refreshAll'
					? ['copilot-workspace-manager.menu']
					: excludedViewIds;
			for (const viewId of targetViewIds) {
				assert.ok(
					when.includes(`view == '${viewId}'`),
					`${command} is missing view condition for ${viewId}`,
				);
			}
			for (const viewId of excludedForCommand) {
				assert.ok(
					!when.includes(`view == '${viewId}'`),
					`${command} should not target ${viewId}`,
				);
			}
		}

		const perViewIds = [...viewIds, 'copilot-workspace-manager.core', 'copilot-workspace-manager.agents'];
		const commandsWithView = [...perViewCommands, ...syncCommands];

		for (const { command, viewId } of commandsWithView) {
			assertCommandDefinition(command);
			const entry = viewTitle.find(
				(item: { command?: string }) => item.command === command,
			);
			assert.ok(entry, `Missing view/title menu for ${command}`);
			const when = entry.when ?? '';
			assert.ok(
				when.includes(`view == '${viewId}'`),
				`${command} is missing view condition for ${viewId}`,
			);
			for (const otherViewId of perViewIds.filter((id) => id !== viewId)) {
				assert.ok(
					!when.includes(`view == '${otherViewId}'`),
					`${command} should not target ${otherViewId}`,
				);
			}
			for (const excludedViewId of excludedViewIds) {
				assert.ok(
					!when.includes(`view == '${excludedViewId}'`),
					`${command} should not target ${excludedViewId}`,
				);
			}
		}

		for (const { command, configKey } of syncCommands.filter((item) => item.configKey)) {
			const entry = viewTitle.find(
				(item: { command?: string }) => item.command === command,
			);
			assert.ok(entry, `Missing view/title menu for ${command}`);
			const when = entry.when ?? '';
			assert.ok(
				when.includes(configKey),
				`${command} is missing config condition`,
			);
		}

		for (const command of managerCommands) {
			const entry = viewTitle.find(
				(item: { command?: string }) => item.command === command,
			);
			assert.ok(entry, `Missing view/title menu for ${command}`);
			const when = entry.when ?? '';
			assert.ok(
				!when.includes("view == 'copilot-workspace-manager.prompts'"),
				`${command} should not target prompts view`,
			);
			assert.ok(
				!when.includes("view == 'copilot-workspace-manager.templates'"),
				`${command} should not target templates view`,
			);
		}
	});
});

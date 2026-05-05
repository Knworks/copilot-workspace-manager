import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Agent menu contributions', () => {
	test('agent commands are contributed to view title without item toggles', () => {
		const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

		const commands = packageJson?.contributes?.commands as
			| Array<{ command?: string; icon?: string }>
			| undefined;
		assert.ok(Array.isArray(commands));
		for (const commandId of [
			'copilot-workspace-manager.addAgent',
			'copilot-workspace-manager.editAgent',
			'copilot-workspace-manager.deleteAgent',
		]) {
			const entry = commands?.find((command) => command.command === commandId);
			assert.ok(entry, `Missing command ${commandId}`);
			assert.ok(entry?.icon, `Missing icon for ${commandId}`);
		}
		for (const commandId of [
			'copilot-workspace-manager.enableAgent',
			'copilot-workspace-manager.disableAgent',
		]) {
			const entry = commands?.find((command) => command.command === commandId);
			assert.ok(entry, `Missing command ${commandId}`);
			assert.ok(entry?.icon, `Missing icon for ${commandId}`);
		}

		const viewTitle = packageJson?.contributes?.menus?.['view/title'] as
			| Array<{ command?: string; when?: string }>
			| undefined;
		assert.ok(Array.isArray(viewTitle));
		const addAgentMenu = viewTitle?.find(
			(item) => item.command === 'copilot-workspace-manager.addAgent',
		);
		assert.ok(addAgentMenu);
		assert.ok(addAgentMenu?.when?.includes("view == 'copilot-workspace-manager.agents'"));
		for (const commandId of [
			'copilot-workspace-manager.editAgent',
			'copilot-workspace-manager.deleteAgent',
		]) {
			const entry = viewTitle?.find((item) => item.command === commandId);
			assert.ok(entry, `Missing view/title menu for ${commandId}`);
			assert.ok(entry?.when?.includes("view == 'copilot-workspace-manager.agents'"));
		}

		const itemContext = packageJson?.contributes?.menus?.['view/item/context'] as
			| Array<{ command?: string; when?: string }>
			| undefined;
		assert.ok(Array.isArray(itemContext));
		assert.ok(
			!itemContext?.some((item) =>
				[
					'copilot-workspace-manager.enableAgent',
					'copilot-workspace-manager.disableAgent',
				].includes(item.command ?? ''),
			),
		);
	});
});

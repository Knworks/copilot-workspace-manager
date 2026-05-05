import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Package icons are configured', () => {
		const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

		assert.strictEqual(packageJson.icon, 'images/copilot-workspace-manager.png');

		const activitybar = packageJson?.contributes?.viewsContainers?.activitybar;
		assert.ok(Array.isArray(activitybar));
		assert.ok(
			activitybar.some(
				(container: { id: string; icon: string }) =>
					container.id === 'copilot-workspace-manager' && container.icon === 'images/sidebar.png',
			),
		);

		const views = packageJson?.contributes?.views?.['copilot-workspace-manager'];
		assert.ok(Array.isArray(views));
		assert.ok(
			views.some((view: { id: string }) => view.id === 'copilot-workspace-manager.core'),
		);
		assert.ok(
			views.some((view: { id: string }) => view.id === 'copilot-workspace-manager.prompts'),
		);
		assert.ok(
			views.some((view: { id: string }) => view.id === 'copilot-workspace-manager.agents'),
		);

		const activationEvents = packageJson?.activationEvents;
		assert.ok(Array.isArray(activationEvents));
		assert.ok(
			activationEvents.includes('onView:copilot-workspace-manager.agents'),
		);
	});
});

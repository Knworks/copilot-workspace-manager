import * as vscode from 'vscode';

/**
 * Settings section name for Copilot Workspace Manager extension.
 */
export const SETTINGS_SECTION = 'copilot-workspace-manager';

/**
 * Sync destination folders configured by the user.
 */
export type SyncSettings = {
	copilotFolder: string;
	promptsFolder: string;
	skillsFolder: string;
	templatesFolder: string;
	agentFolder: string;
};

type ConfigurationReader = Pick<vscode.WorkspaceConfiguration, 'get' | 'inspect'>;

const readStringSetting = (value: unknown): string =>
	typeof value === 'string' ? value : '';

const readPositiveIntegerSetting = (value: unknown): number | undefined => {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return undefined;
	}
	const normalized = Math.floor(value);
	return normalized > 0 ? normalized : undefined;
};

/**
 * Reads sync folder settings from VS Code configuration.
 *
 * @param configuration - Configuration source (defaults to VS Code settings).
 * @returns Sync folder paths with empty strings for unset values.
 */
export function getSyncSettings(
	configuration: ConfigurationReader = vscode.workspace.getConfiguration(
		SETTINGS_SECTION,
	),
): SyncSettings {
	return {
		copilotFolder: readStringSetting(configuration.get('copilotFolder')),
		promptsFolder: readStringSetting(configuration.get('promptsFolder')),
		skillsFolder: readStringSetting(configuration.get('skillsFolder')),
		templatesFolder: readStringSetting(configuration.get('templatesFolder')),
		agentFolder: readStringSetting(configuration.get('agentFolder')),
	};
}

/**
 * Reads the maximum number of session history items from VS Code configuration.
 *
 * Returns the configured positive integer, or the default value `100`.
 */
export function getMaxSessionHistoryCount(
	configuration: ConfigurationReader = vscode.workspace.getConfiguration(
		SETTINGS_SECTION,
	),
): number {
	return (
		readPositiveIntegerSetting(configuration.get('maxSessionHistoryCount')) ?? 100
	);
}

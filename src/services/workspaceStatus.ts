import fs from 'fs';
import os from 'os';
import path from 'path';
import { messages } from '../i18n';

export type WorkspaceStatus = {
	isAvailable: boolean;
	reason?: string;
	isConfigInvalid?: boolean;
};

export type WorkspacePaths = {
	copilotDir: string;
	configPath: string;
};

export const TEMPLATE_FOLDER_NAME = 'templates';

export const UNAVAILABLE_REASONS = {
	copilotMissing: messages.reasonCopilotMissing,
	configMissing: messages.reasonConfigMissing,
	configUnreadable: messages.reasonConfigUnreadable,
	configInvalid: messages.reasonConfigInvalid,
} as const;

export const UNAVAILABLE_PREFIX = messages.unavailablePrefix;

export function getUnavailableLabel(reason: string): string {
	return `${UNAVAILABLE_PREFIX}${reason}`;
}

export function resolveCopilotPaths(
	homeDir: string = os.homedir(),
	copilotHome: string | undefined = process.env.COPILOT_HOME,
): WorkspacePaths {
	const copilotDir = copilotHome && copilotHome.trim()
		? copilotHome
		: path.join(homeDir, '.copilot');
	return {
		copilotDir,
		configPath: path.join(copilotDir, 'config.json'),
	};
}

export function getWorkspaceStatus(homeDir?: string): WorkspaceStatus {
	const paths = resolveCopilotPaths(homeDir);

	if (!fs.existsSync(paths.copilotDir)) {
		return { isAvailable: false, reason: UNAVAILABLE_REASONS.copilotMissing };
	}

	if (!fs.existsSync(paths.configPath)) {
		return { isAvailable: false, reason: UNAVAILABLE_REASONS.configMissing };
	}

	let configContents = '';
	try {
		configContents = fs.readFileSync(paths.configPath, 'utf8');
	} catch {
		return { isAvailable: false, reason: UNAVAILABLE_REASONS.configUnreadable };
	}

	try {
		JSON.parse(configContents);
	} catch {
		return { isAvailable: false, reason: UNAVAILABLE_REASONS.configInvalid };
	}

	return { isAvailable: true };
}

/**
 * Returns availability for Copilot Core repair-oriented operations.
 *
 * Core files must remain openable when `config.json` exists but is invalid JSON,
 * because the editor is the recovery path for fixing that file.
 */
export function getCoreWorkspaceStatus(homeDir?: string): WorkspaceStatus {
	const paths = resolveCopilotPaths(homeDir);

	if (!fs.existsSync(paths.copilotDir)) {
		return { isAvailable: false, reason: UNAVAILABLE_REASONS.copilotMissing };
	}

	if (!fs.existsSync(paths.configPath)) {
		return { isAvailable: false, reason: UNAVAILABLE_REASONS.configMissing };
	}

	let configContents = '';
	try {
		configContents = fs.readFileSync(paths.configPath, 'utf8');
	} catch {
		return { isAvailable: false, reason: UNAVAILABLE_REASONS.configUnreadable };
	}

	try {
		JSON.parse(configContents);
	} catch {
		return {
			isAvailable: true,
			reason: UNAVAILABLE_REASONS.configInvalid,
			isConfigInvalid: true,
		};
	}

	return { isAvailable: true };
}

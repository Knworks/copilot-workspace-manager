import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';
import { resolveCopilotPaths } from './workspaceStatus';

export type SkillLocationKind = 'project' | 'compatible' | 'user' | 'plugin';

export type SkillLocation = {
	kind: SkillLocationKind;
	label: string;
	rootPath: string;
	createPath?: string;
	priority: number;
};

function getProjectRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Resolves Skill storage locations for GitHub Copilot CLI and compatible folders.
 */
export function getSkillLocations(
	homeDir: string = os.homedir(),
	projectRoot: string | undefined = getProjectRoot(),
): SkillLocation[] {
	const locations: SkillLocation[] = [];
	if (projectRoot) {
		const preferredProjectRoot = path.join(projectRoot, '.github', 'skills');
		locations.push({
			kind: 'project',
			label: 'Workspace Skills',
			rootPath: preferredProjectRoot,
			createPath: preferredProjectRoot,
			priority: 1,
		});
		for (const compatibleRoot of [
			path.join(projectRoot, '.agents', 'skills'),
			path.join(projectRoot, '.claude', 'skills'),
		]) {
			if (fs.existsSync(compatibleRoot)) {
				locations.push({
					kind: 'compatible',
					label: 'Workspace Compatible Skills',
					rootPath: compatibleRoot,
					createPath: compatibleRoot,
					priority: 2,
				});
			}
		}
	}
	locations.push(
		{
			kind: 'user',
			label: 'User Skills',
			rootPath: path.join(resolveCopilotPaths(homeDir).copilotDir, 'skills'),
			createPath: path.join(resolveCopilotPaths(homeDir).copilotDir, 'skills'),
			priority: 3,
		},
		{
			kind: 'plugin',
			label: 'Plugin Skills',
			rootPath: path.join(resolveCopilotPaths(homeDir).copilotDir, 'installed-plugins'),
			priority: 4,
		},
	);
	return locations;
}

export function findSkillLocationForPath(
	targetPath: string,
	locations: SkillLocation[] = getSkillLocations(),
): SkillLocation | undefined {
	const resolvedTarget = path.resolve(targetPath);
	return locations.find((location) => {
		const resolvedRoot = path.resolve(location.rootPath);
		return (
			resolvedTarget === resolvedRoot ||
			resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
		);
	});
}

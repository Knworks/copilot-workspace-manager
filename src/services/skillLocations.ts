import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';
import { resolveCopilotPaths } from './workspaceStatus';

export type SkillLocationKind = 'project' | 'user' | 'plugin';

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
	const { copilotDir } = resolveCopilotPaths(homeDir);
	const locations: SkillLocation[] = [];
	if (projectRoot) {
		for (const rootPath of [
			path.join(projectRoot, '.github', 'skills'),
			path.join(projectRoot, '.agents', 'skills'),
			path.join(projectRoot, '.claude', 'skills'),
		]) {
			locations.push({
				kind: 'project',
				label: 'Workspace Skills',
				rootPath,
				createPath: rootPath,
				priority: 1,
			});
		}
	}
	for (const rootPath of [
		path.join(copilotDir, 'skills'),
		path.join(homeDir, '.agents', 'skills'),
		path.join(homeDir, '.claude', 'skills'),
	]) {
		locations.push({
			kind: 'user',
			label: 'User Skills',
			rootPath,
			createPath: rootPath,
			priority: 2,
		});
	}
	for (const rootPath of collectPluginRoots(path.join(copilotDir, 'installed-plugins'), 'skills')) {
		locations.push({
			kind: 'plugin',
			label: 'Plugin Skills',
			rootPath,
			priority: 3,
		});
	}
	return locations.sort((left, right) =>
		left.priority - right.priority ||
		left.rootPath.localeCompare(right.rootPath, undefined, {
			numeric: true,
			sensitivity: 'base',
		}),
	);
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

function collectPluginRoots(pluginsRoot: string, targetDirName: string): string[] {
	if (!fs.existsSync(pluginsRoot)) {
		return [];
	}
	const results: string[] = [];
	const visit = (currentPath: string): void => {
		for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
			if (!entry.isDirectory()) {
				continue;
			}
			const fullPath = path.join(currentPath, entry.name);
			if (entry.name === targetDirName) {
				results.push(fullPath);
				continue;
			}
			visit(fullPath);
		}
	};
	visit(pluginsRoot);
	return results;
}

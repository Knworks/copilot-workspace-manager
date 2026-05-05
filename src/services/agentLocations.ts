import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';
import { resolveCopilotPaths } from './workspaceStatus';

export type AgentLocationKind = 'project' | 'user' | 'plugin';

export type AgentLocation = {
	kind: AgentLocationKind;
	label: string;
	rootPath: string;
	createPath?: string;
	priority: number;
};

function getProjectRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function getAgentLocations(
	homeDir: string = os.homedir(),
	projectRoot: string | undefined = getProjectRoot(),
): AgentLocation[] {
	const { copilotDir } = resolveCopilotPaths(homeDir);
	const locations: AgentLocation[] = [];
	if (projectRoot) {
		const preferredProjectRoot = path.join(projectRoot, '.github', 'agents');
		locations.push({
			kind: 'project',
			label: 'Workspace Agents',
			rootPath: preferredProjectRoot,
			createPath: preferredProjectRoot,
			priority: 1,
		});
	}
	locations.push({
		kind: 'user',
		label: 'User Agents',
		rootPath: path.join(copilotDir, 'agents'),
		createPath: path.join(copilotDir, 'agents'),
		priority: 2,
	});
	for (const rootPath of collectPluginRoots(path.join(copilotDir, 'installed-plugins'), 'agents')) {
		locations.push({
			kind: 'plugin',
			label: 'Plugin Agents',
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

export function findAgentLocationForPath(
	targetPath: string,
	locations: AgentLocation[] = getAgentLocations(),
): AgentLocation | undefined {
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

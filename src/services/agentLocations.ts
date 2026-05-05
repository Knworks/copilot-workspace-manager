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
		rootPath: path.join(resolveCopilotPaths(homeDir).copilotDir, 'agents'),
		createPath: path.join(resolveCopilotPaths(homeDir).copilotDir, 'agents'),
		priority: 2,
	});
	locations.push({
		kind: 'plugin',
		label: 'Plugin Agents',
		rootPath: path.join(resolveCopilotPaths(homeDir).copilotDir, 'installed-plugins'),
		priority: 3,
	});
	return locations;
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

import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';
import { listInstalledPluginsFromConfig, resolvePluginManifestPath } from './pluginConfigService';
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
	const { copilotDir, configPath } = resolveCopilotPaths(homeDir);
	const locations: AgentLocation[] = [];
	if (projectRoot) {
		for (const rootPath of [
			path.join(projectRoot, '.github', 'agents'),
			path.join(projectRoot, '.claude', 'agents'),
		]) {
			locations.push({
				kind: 'project',
				label: 'Workspace Agents',
				rootPath,
				createPath: rootPath,
				priority: 1,
			});
		}
	}
	locations.push({
		kind: 'user',
		label: 'User Agents',
		rootPath: path.join(copilotDir, 'agents'),
		createPath: path.join(copilotDir, 'agents'),
		priority: 2,
	});
	for (const rootPath of collectPluginAgentRoots(configPath)) {
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

function collectPluginAgentRoots(configPath: string): string[] {
	return listInstalledPluginsFromConfig(configPath).flatMap((plugin) =>
		resolvePluginAgentRoots(plugin.pluginRoot),
	);
}

function resolvePluginAgentRoots(pluginRoot: string): string[] {
	const defaultRoot = path.join(pluginRoot, 'agents');
	try {
		const manifestPath = resolvePluginManifestPath(pluginRoot);
		if (!manifestPath) {
			return [];
		}
		const parsed = JSON.parse(
			fs.readFileSync(manifestPath, 'utf8'),
		) as { agents?: unknown };
		const configuredRoots = normalizePluginAgentPaths(parsed.agents).map((agentPath) =>
			path.resolve(pluginRoot, agentPath),
		);
		const candidateRoots = configuredRoots.length > 0 ? configuredRoots : [defaultRoot];
		return candidateRoots
			.filter((candidatePath) => isDirectory(candidatePath))
			.filter((candidatePath, index, paths) => paths.indexOf(candidatePath) === index);
	} catch {
		return [];
	}
}

function normalizePluginAgentPaths(value: unknown): string[] {
	if (typeof value === 'string' && value.trim()) {
		return [value.trim()];
	}
	if (Array.isArray(value)) {
		return value
			.filter((entry): entry is string => typeof entry === 'string')
			.map((entry) => entry.trim())
			.filter(Boolean);
	}
	return [];
}

function isDirectory(targetPath: string): boolean {
	return fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();
}

import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';
import { listInstalledPluginsFromConfig, resolvePluginManifestPath } from './pluginConfigService';
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
	const { copilotDir, configPath } = resolveCopilotPaths(homeDir);
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
	for (const rootPath of collectPluginSkillRoots(configPath)) {
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

function collectPluginSkillRoots(configPath: string): string[] {
	return listInstalledPluginsFromConfig(configPath).flatMap((plugin) =>
		resolvePluginSkillRoots(plugin.pluginRoot),
	);
}

function resolvePluginSkillRoots(pluginRoot: string): string[] {
	const defaultRoot = path.join(pluginRoot, 'skills');
	try {
		const manifestPath = resolvePluginManifestPath(pluginRoot);
		if (!manifestPath) {
			return [];
		}
		const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { skills?: unknown };
		const configuredRoots = normalizePluginSkillPaths(parsed.skills).map((skillPath) =>
			path.resolve(pluginRoot, skillPath),
		);
		const candidateRoots = configuredRoots.length > 0 ? configuredRoots : [defaultRoot];
		return candidateRoots
			.filter((candidatePath) => isDirectory(candidatePath))
			.filter((candidatePath, index, paths) => paths.indexOf(candidatePath) === index);
	} catch {
		return [];
	}
}

function normalizePluginSkillPaths(value: unknown): string[] {
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

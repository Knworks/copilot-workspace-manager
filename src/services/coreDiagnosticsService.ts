import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';
import { resolveCopilotPaths } from './workspaceStatus';

export type InstructionsChainKind =
	| 'user'
	| 'workspace'
	| 'path'
	| 'agent'
	| 'customAgent';
export type InstructionsChainStatus =
	| 'found'
	| 'matched'
	| 'notMatched'
	| 'appliesWhenPathMatches'
	| 'invalidApplyTo'
	| 'error';

export type AgentsChainNode = {
	status: InstructionsChainStatus;
	kind: InstructionsChainKind;
	fileName: string;
	absolutePath: string;
	reason: string;
	contentPreview?: string;
	applyTo?: string;
	currentFilePath?: string;
};

export type TrustedDirectory = {
	path: string;
	exists: boolean;
	reason?: string;
	sourceLabel: string;
	sourcePath: string;
};

export function buildAgentsLoadingChain(
	workspaceRoot: string | undefined = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
	homeDir: string = os.homedir(),
	customInstructionsDirs: string | undefined = process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS,
	currentFilePath: string | undefined = vscode.window.activeTextEditor?.document.uri.fsPath,
): AgentsChainNode[] {
	const { copilotDir } = resolveCopilotPaths(homeDir);
	const nodes: AgentsChainNode[] = [];
	pushIfExists(nodes, readInstructionFile(path.join(copilotDir, 'copilot-instructions.md'), 'user'));
	if (workspaceRoot) {
		pushIfExists(
			nodes,
			readInstructionFile(
				path.join(workspaceRoot, '.github', 'copilot-instructions.md'),
				'workspace',
			),
		);
		for (const instructionPath of findInstructionFiles(
			path.join(workspaceRoot, '.github', 'instructions'),
			'.instructions.md',
		)) {
			pushIfExists(nodes, readPathInstructionFile(instructionPath, workspaceRoot, currentFilePath));
		}
		pushIfExists(nodes, readInstructionFile(path.join(workspaceRoot, 'AGENTS.md'), 'agent'));
	}
	for (const customDir of parseCustomInstructionDirs(customInstructionsDirs)) {
		pushIfExists(
			nodes,
			readInstructionFile(path.join(customDir, 'AGENTS.md'), 'customAgent'),
		);
	}
	return nodes.sort(compareInstructionNodes);
}

export function listTrustedDirectories(
	userSettingsPath: string,
	workspaceSettingsPath?: string,
): TrustedDirectory[] {
	return [
		...readTrustedDirectories(userSettingsPath, 'User Settings'),
		...readTrustedDirectories(workspaceSettingsPath, 'Workspace Settings'),
	];
}

export function addTrustedDirectory(settingsPath: string, projectPath: string): void {
	const parsed = readConfig(settingsPath);
	const trustedFolders = new Set(readTrustedFolderValues(parsed));
	trustedFolders.add(projectPath);
	setTrustedFolderValues(parsed, [...trustedFolders]);
	writeConfig(settingsPath, parsed);
}

export function createInstructionFile(
	targetPath: string,
	kind: 'user' | 'workspace' | 'path',
): string | undefined {
	if (fs.existsSync(targetPath)) {
		return undefined;
	}
	fs.mkdirSync(path.dirname(targetPath), { recursive: true });
	fs.writeFileSync(targetPath, buildInstructionTemplate(kind), 'utf8');
	return targetPath;
}

export function removeTrustedDirectory(settingsPath: string, projectPath: string): boolean {
	const parsed = readConfig(settingsPath);
	const trustedFolders = readTrustedFolderValues(parsed);
	const nextFolders = trustedFolders.filter((targetPath) => targetPath !== projectPath);
	if (nextFolders.length === trustedFolders.length) {
		return false;
	}
	setTrustedFolderValues(parsed, nextFolders);
	writeConfig(settingsPath, parsed);
	return true;
}

function pushIfExists(nodes: AgentsChainNode[], node: AgentsChainNode | undefined): void {
	if (node) {
		nodes.push(node);
	}
}

function buildInstructionTemplate(kind: 'user' | 'workspace' | 'path'): string {
	if (kind === 'path') {
		return '---\napplyTo: "**/*"\n---\n';
	}
	return '';
}

function readInstructionFile(
	targetPath: string,
	kind: InstructionsChainKind,
): AgentsChainNode | undefined {
	if (!fs.existsSync(targetPath)) {
		return undefined;
	}
	const fileName = path.basename(targetPath);
	try {
		const contents = fs.readFileSync(targetPath, 'utf8');
		return {
			status: 'found',
			kind,
			fileName,
			absolutePath: targetPath,
			reason: 'Instruction file is available.',
			contentPreview: contents.slice(0, 2000),
		};
	} catch (error) {
		return {
			status: 'error',
			kind,
			fileName,
			absolutePath: targetPath,
			reason: error instanceof Error ? error.message : 'Read failed.',
		};
	}
}

function readPathInstructionFile(
	targetPath: string,
	workspaceRoot: string,
	currentFilePath: string | undefined,
): AgentsChainNode | undefined {
	const node = readInstructionFile(targetPath, 'path');
	if (!node || node.status === 'error') {
		return node;
	}
	const applyTo = readApplyTo(node.contentPreview ?? fs.readFileSync(targetPath, 'utf8'));
	if (!applyTo) {
		return {
			...node,
			status: 'invalidApplyTo',
			reason: 'The applyTo frontmatter is missing or invalid.',
		};
	}
	if (!currentFilePath) {
		return {
			...node,
			status: 'appliesWhenPathMatches',
			applyTo,
			reason: 'Applies when the current file matches applyTo.',
		};
	}
	const relativePath = toRelativeWorkspacePath(workspaceRoot, currentFilePath);
	if (!relativePath) {
		return {
			...node,
			status: 'notMatched',
			applyTo,
			currentFilePath,
			reason: 'The current file is outside the workspace.',
		};
	}
	return {
		...node,
		status: matchesApplyTo(relativePath, applyTo) ? 'matched' : 'notMatched',
		applyTo,
		currentFilePath,
		reason: matchesApplyTo(relativePath, applyTo)
			? 'The current file matches applyTo.'
			: 'The current file does not match applyTo.',
	};
}

function parseCustomInstructionDirs(value: string | undefined): string[] {
	if (!value) {
		return [];
	}
	return value
		.split(path.delimiter)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0 && fs.existsSync(entry));
}

function findInstructionFiles(rootDir: string, suffix: string): string[] {
	if (!fs.existsSync(rootDir)) {
		return [];
	}
	const results: string[] = [];
	const visit = (currentDir: string): void => {
		for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
			const fullPath = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				visit(fullPath);
				continue;
			}
			if (entry.isFile() && entry.name.endsWith(suffix)) {
				results.push(fullPath);
			}
		}
	};
	visit(rootDir);
	return results.sort((left, right) =>
		left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }),
	);
}

function readApplyTo(contents: string): string | undefined {
	const frontmatterMatch = contents.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!frontmatterMatch) {
		return undefined;
	}
	const applyToMatch = frontmatterMatch[1].match(/^\s*applyTo\s*:\s*(.+)\s*$/m);
	if (!applyToMatch) {
		return undefined;
	}
	const value = applyToMatch[1].trim().replace(/^['"]|['"]$/g, '');
	return value || undefined;
}

function toRelativeWorkspacePath(
	workspaceRoot: string,
	targetPath: string,
): string | undefined {
	const relativePath = path.relative(workspaceRoot, targetPath);
	if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
		return undefined;
	}
	return relativePath.replaceAll('\\', '/');
}

function matchesApplyTo(relativePath: string, applyTo: string): boolean {
	const patterns = applyTo
		.split(',')
		.map((pattern) => pattern.trim())
		.filter(Boolean);
	return patterns.some((pattern) => globToRegExp(pattern).test(relativePath));
}

function globToRegExp(pattern: string): RegExp {
	const normalized = pattern.replaceAll('\\', '/');
	let source = '^';
	for (let index = 0; index < normalized.length; index += 1) {
		const char = normalized[index];
		if (
			char === '*' &&
			normalized[index + 1] === '*' &&
			normalized[index + 2] === '/'
		) {
			source += '(?:.*/)?';
			index += 2;
			continue;
		}
		if (char === '*' && normalized[index + 1] === '*') {
			source += '.*';
			index += 1;
			continue;
		}
		if (char === '*') {
			source += '[^/]*';
			continue;
		}
		if (char === '?') {
			source += '[^/]';
			continue;
		}
		source += /[|\\{}()[\]^$+?.]/.test(char) ? `\\${char}` : char;
	}
	source += '$';
	return new RegExp(source);
}

function compareInstructionNodes(left: AgentsChainNode, right: AgentsChainNode): number {
	const rank = (kind: InstructionsChainKind): number => {
		switch (kind) {
			case 'user':
				return 0;
			case 'workspace':
				return 1;
			case 'path':
				return 2;
			case 'agent':
				return 3;
			case 'customAgent':
				return 4;
		}
	};
	return rank(left.kind) - rank(right.kind)
		|| left.absolutePath.localeCompare(right.absolutePath, undefined, {
			numeric: true,
			sensitivity: 'base',
		});
}

function readConfig(configPath: string): Record<string, unknown> {
	if (!fs.existsSync(configPath)) {
		return {};
	}
	try {
		return JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
	} catch {
		return {};
	}
}

function writeConfig(configPath: string, config: Record<string, unknown>): void {
	fs.mkdirSync(path.dirname(configPath), { recursive: true });
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

function readTrustedDirectories(
	settingsPath: string | undefined,
	sourceLabel: string,
): TrustedDirectory[] {
	if (!settingsPath || !fs.existsSync(settingsPath)) {
		return [];
	}
	try {
		const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
		return readTrustedFolderValues(parsed).map((targetPath) => ({
			path: targetPath,
			exists: fs.existsSync(targetPath),
			reason: fs.existsSync(targetPath)
				? undefined
				: 'Directory does not exist or cannot be accessed.',
			sourceLabel,
			sourcePath: settingsPath,
		}));
	} catch {
		return [];
	}
}

function readTrustedFolderValues(config: Record<string, unknown>): string[] {
	const values = Array.isArray(config.trustedFolders)
		? config.trustedFolders
		: Array.isArray(config.trusted_folders)
			? config.trusted_folders
			: [];
	return values.filter((value): value is string => typeof value === 'string');
}

function setTrustedFolderValues(config: Record<string, unknown>, trustedFolders: string[]): void {
	config.trustedFolders = trustedFolders;
	if ('trusted_folders' in config) {
		config.trusted_folders = trustedFolders;
	}
}

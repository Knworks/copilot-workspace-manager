import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';
import { resolveCopilotPaths } from './workspaceStatus';

export type AgentsChainStatus = 'Active' | 'Skipped' | 'Missing' | 'Error';
export type AgentsChainKind = 'Global' | 'Project';
export type AgentsChainType = 'Standard' | 'Fallback' | 'Override';

export type AgentsChainNode = {
	status: AgentsChainStatus;
	kind: AgentsChainKind;
	type: AgentsChainType;
	fileName: string;
	absolutePath: string;
	reason: string;
	contentPreview?: string;
};

export type TrustedDirectory = {
	path: string;
	exists: boolean;
	reason?: string;
};

export function buildAgentsLoadingChain(
	workspaceRoot: string | undefined = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
	homeDir: string = os.homedir(),
): AgentsChainNode[] {
	const { copilotDir } = resolveCopilotPaths(homeDir);
	const nodes: AgentsChainNode[] = [];
	nodes.push(buildNode(path.join(copilotDir, 'copilot-instructions.md'), 'Global'));
	if (workspaceRoot) {
		nodes.push(buildNode(path.join(workspaceRoot, '.github', 'copilot-instructions.md'), 'Project'));
	}
	return applyPriority(nodes);
}

export function listTrustedDirectories(configPath: string): TrustedDirectory[] {
	if (!fs.existsSync(configPath)) {
		return [];
	}
	try {
		const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { trusted_folders?: unknown };
		const trustedFolders = Array.isArray(parsed.trusted_folders) ? parsed.trusted_folders : [];
		return trustedFolders
			.filter((value): value is string => typeof value === 'string')
			.map((targetPath) => ({
				path: targetPath,
				exists: fs.existsSync(targetPath),
				reason: fs.existsSync(targetPath)
					? undefined
					: 'Directory does not exist or cannot be accessed.',
			}));
	} catch {
		return [];
	}
}

export function addTrustedDirectory(configPath: string, projectPath: string): void {
	const parsed = readConfig(configPath);
	const trustedFolders = new Set(
		Array.isArray(parsed.trusted_folders) ? parsed.trusted_folders.filter((value): value is string => typeof value === 'string') : [],
	);
	trustedFolders.add(projectPath);
	parsed.trusted_folders = [...trustedFolders];
	writeConfig(configPath, parsed);
}

export function removeTrustedDirectory(configPath: string, projectPath: string): boolean {
	const parsed = readConfig(configPath);
	const trustedFolders = Array.isArray(parsed.trusted_folders)
		? parsed.trusted_folders.filter((value): value is string => typeof value === 'string')
		: [];
	const nextFolders = trustedFolders.filter((targetPath) => targetPath !== projectPath);
	if (nextFolders.length === trustedFolders.length) {
		return false;
	}
	parsed.trusted_folders = nextFolders;
	writeConfig(configPath, parsed);
	return true;
}

function buildNode(targetPath: string, kind: AgentsChainKind): AgentsChainNode {
	const fileName = path.basename(targetPath);
	if (!fs.existsSync(targetPath)) {
		return {
			status: 'Missing',
			kind,
			type: 'Standard',
			fileName,
			absolutePath: targetPath,
			reason: 'Candidate file is absent.',
		};
	}
	try {
		const contents = fs.readFileSync(targetPath, 'utf8');
		return {
			status: 'Active',
			kind,
			type: 'Standard',
			fileName,
			absolutePath: targetPath,
			reason: 'Instruction file is available.',
			contentPreview: contents.slice(0, 2000),
		};
	} catch (error) {
		return {
			status: 'Error',
			kind,
			type: 'Standard',
			fileName,
			absolutePath: targetPath,
			reason: error instanceof Error ? error.message : 'Read failed.',
		};
	}
}

function applyPriority(nodes: AgentsChainNode[]): AgentsChainNode[] {
	let foundActive = false;
	return nodes.map((node) => {
		if (node.status !== 'Active') {
			return node;
		}
		if (!foundActive) {
			foundActive = true;
			return node;
		}
		return {
			...node,
			status: 'Skipped',
			reason: 'A higher priority instructions file is active.',
		};
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

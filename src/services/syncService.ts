import fs from 'fs';
import path from 'path';
import { ensureDirectoryExists } from './fileOperations';

export type SyncResult = {
	skipped: string[];
};

type FileEntry = {
	mtimeMs: number;
	fullPath: string;
};

type SyncState = Record<string, Record<string, true>>;

const WORKSPACE_META_DIR = '.copilot-workspace-manager';
const SYNC_STATE_FILE = 'copilot-workspace-sync.json';

export function getSyncStatePath(stateRoot: string): string {
	return path.join(stateRoot, WORKSPACE_META_DIR, SYNC_STATE_FILE);
}

export function buildSyncScopeKey(
	scopeName: string,
	configuredDir: string,
	targetDir: string,
): string {
	return [
		scopeName,
		path.resolve(configuredDir).toLowerCase(),
		path.resolve(targetDir).toLowerCase(),
	].join('::');
}

/**
 * Removes a tracked path from sync metadata for the given scope.
 */
export function removeSyncStateEntry(
	stateRoot: string,
	scopeKey: string,
	relativePath: string,
): void {
	const state = readSyncState(stateRoot);
	const scopeState = state[scopeKey];
	if (!scopeState || scopeState[relativePath] !== true) {
		return;
	}
	delete scopeState[relativePath];
	if (Object.keys(scopeState).length === 0) {
		delete state[scopeKey];
	}
	writeSyncState(stateRoot, state);
}

function isHiddenSegment(segment: string): boolean {
	return segment.startsWith('.');
}

function isHiddenPath(relativePath: string): boolean {
	return relativePath
		.split(path.sep)
		.some((segment) => isHiddenSegment(segment));
}

function isWorkspaceMetaPath(relativePath: string): boolean {
	const normalized = relativePath.split(path.sep).join('/');
	return normalized === WORKSPACE_META_DIR || normalized.startsWith(`${WORKSPACE_META_DIR}/`);
}

function readSyncState(stateRoot: string): SyncState {
	const statePath = getSyncStatePath(stateRoot);
	if (fs.existsSync(statePath)) {
		return parseSyncStateFile(statePath, false);
	}
	return {};
}

function writeSyncState(stateRoot: string, state: SyncState): void {
	const stateDir = path.join(stateRoot, WORKSPACE_META_DIR);
	ensureDirectoryExists(stateDir);
	const statePath = path.join(stateDir, SYNC_STATE_FILE);
	fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function parseSyncStateFile(statePath: string, strict: boolean): SyncState {
	try {
		const contents = fs.readFileSync(statePath, 'utf8');
		return parseSyncStateContents(contents, strict);
	} catch (error) {
		if (strict) {
			throw error;
		}
		return {};
	}
}

function parseSyncStateContents(contents: string, strict: boolean): SyncState {
	try {
		const parsed = JSON.parse(contents) as SyncState;
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			if (strict) {
				throw new Error('Invalid sync state schema');
			}
			return {};
		}
		return parsed;
	} catch (error) {
		if (strict) {
			throw error;
		}
		return {};
	}
}

function buildFileMap(rootDir: string): Map<string, FileEntry> {
	const entries = new Map<string, FileEntry>();
	if (!fs.existsSync(rootDir)) {
		return entries;
	}

	const traverse = (currentDir: string) => {
		const dirEntries = fs.readdirSync(currentDir, { withFileTypes: true });
		for (const entry of dirEntries) {
			const fullPath = path.join(currentDir, entry.name);
			const relativePath = path.relative(rootDir, fullPath);
			if (isHiddenPath(relativePath) || isWorkspaceMetaPath(relativePath)) {
				continue;
			}
			if (entry.isDirectory()) {
				traverse(fullPath);
			} else if (entry.isFile()) {
				const stat = fs.statSync(fullPath);
				entries.set(relativePath, { fullPath, mtimeMs: stat.mtimeMs });
			}
		}
	};

	traverse(rootDir);
	return entries;
}

function copyFileSafely(
	sourcePath: string,
	targetPath: string,
	skipped: string[],
): boolean {
	try {
		ensureDirectoryExists(path.dirname(targetPath));
		fs.copyFileSync(sourcePath, targetPath);
		return true;
	} catch {
		skipped.push(targetPath);
		return false;
	}
}

function deleteFileSafely(targetPath: string, skipped: string[]): boolean {
	try {
		fs.rmSync(targetPath, { force: true });
		return true;
	} catch {
		skipped.push(targetPath);
		return false;
	}
}

function cleanupEmptyParents(
	rootDir: string,
	targetPath: string,
	skipped: string[],
): void {
	let currentDir = path.dirname(targetPath);
	const rootResolved = path.resolve(rootDir);

	while (path.resolve(currentDir).startsWith(rootResolved)) {
		try {
			const entries = fs.readdirSync(currentDir, { withFileTypes: true });
			const hasVisibleEntry = entries.some((entry) => !entry.name.startsWith('.'));
			if (hasVisibleEntry) {
				return;
			}
			fs.rmdirSync(currentDir);
		} catch {
			skipped.push(currentDir);
			return;
		}

		if (path.resolve(currentDir) === rootResolved) {
			return;
		}
		currentDir = path.dirname(currentDir);
	}
}

function syncEntries(
	scopeKey: string,
	stateRoot: string,
	sourceRoot: string,
	targetRoot: string,
	sourceEntries: Map<string, FileEntry>,
	targetEntries: Map<string, FileEntry>,
): SyncResult {
	const state = readSyncState(stateRoot);
	const scopeState = state[scopeKey] ?? {};
	const skipped: string[] = [];
	const allPaths = new Set<string>([
		...sourceEntries.keys(),
		...targetEntries.keys(),
		...Object.keys(scopeState),
	]);

	for (const relativePath of allPaths) {
		const sourceEntry = sourceEntries.get(relativePath);
		const targetEntry = targetEntries.get(relativePath);
		const sourcePath =
			sourceEntry?.fullPath ?? path.join(sourceRoot, relativePath);
		const targetPath =
			targetEntry?.fullPath ?? path.join(targetRoot, relativePath);
		const known = scopeState[relativePath] === true;

		if (!sourceEntry && !targetEntry) {
			delete scopeState[relativePath];
			continue;
		}

		if (sourceEntry && targetEntry) {
			if (sourceEntry.mtimeMs === targetEntry.mtimeMs) {
				scopeState[relativePath] = true;
				continue;
			}

			const source =
				sourceEntry.mtimeMs > targetEntry.mtimeMs
					? { from: sourceEntry, to: targetPath }
					: { from: targetEntry, to: sourcePath };
			const copied = copyFileSafely(source.from.fullPath, source.to, skipped);
			if (copied) {
				scopeState[relativePath] = true;
			}
			continue;
		}

		if (!sourceEntry && targetEntry) {
			if (known) {
				if (deleteFileSafely(targetEntry.fullPath, skipped)) {
					delete scopeState[relativePath];
					cleanupEmptyParents(targetRoot, targetEntry.fullPath, skipped);
				}
				continue;
			}

			const copied = copyFileSafely(targetEntry.fullPath, sourcePath, skipped);
			if (copied) {
				scopeState[relativePath] = true;
			}
			continue;
		}

		if (sourceEntry && !targetEntry) {
			if (known) {
				if (deleteFileSafely(sourceEntry.fullPath, skipped)) {
					delete scopeState[relativePath];
					cleanupEmptyParents(
						sourceRoot,
						sourceEntry.fullPath,
						skipped,
					);
				}
				continue;
			}

			const copied = copyFileSafely(sourceEntry.fullPath, targetPath, skipped);
			if (copied) {
				scopeState[relativePath] = true;
			}
		}
	}

	state[scopeKey] = scopeState;
	writeSyncState(stateRoot, state);
	return { skipped };
}

/**
 * Synchronizes directory contents bidirectionally based on modification times.
 *
 * @param scopeKey - Sync scope name for tracking deletion metadata.
 * @param sourceDir - Source directory for syncing.
 * @param targetDir - Destination directory for syncing.
 */
export function syncDirectoryBidirectional(
	scopeKey: string,
	stateRoot: string,
	sourceDir: string,
	targetDir: string,
): SyncResult {
	const sourceEntries = buildFileMap(sourceDir);
	const targetEntries = buildFileMap(targetDir);
	return syncEntries(
		scopeKey,
		stateRoot,
		sourceDir,
		targetDir,
		sourceEntries,
		targetEntries,
	);
}

/**
 * Synchronizes Copilot CLI custom instructions between repository and user scopes.
 */
export function syncCoreInstructionsBidirectional(
	workspaceRoot: string,
	copilotDir: string,
): SyncResult {
	const repositoryDir = path.join(workspaceRoot, '.github');
	const fileName = 'copilot-instructions.md';
	const repositoryPath = path.join(repositoryDir, fileName);
	const userPath = path.join(copilotDir, fileName);
	const repositoryEntries = new Map<string, FileEntry>();
	const userEntries = new Map<string, FileEntry>();

	if (fs.existsSync(repositoryPath)) {
		const stat = fs.statSync(repositoryPath);
		repositoryEntries.set(fileName, {
			fullPath: repositoryPath,
			mtimeMs: stat.mtimeMs,
		});
	}
	if (fs.existsSync(userPath)) {
		const stat = fs.statSync(userPath);
		userEntries.set(fileName, {
			fullPath: userPath,
			mtimeMs: stat.mtimeMs,
		});
	}

	return syncEntries(
		'core',
		copilotDir,
		repositoryDir,
		copilotDir,
		repositoryEntries,
		userEntries,
	);
}

export function syncCoreFilesBidirectional(
	copilotDir: string,
	targetDir: string,
): SyncResult {
	const fileMappings = [
		{ relativePath: 'config.json', sourcePath: path.join(copilotDir, 'config.json'), targetPath: path.join(targetDir, 'config.json') },
		{ relativePath: 'settings.json', sourcePath: path.join(copilotDir, 'settings.json'), targetPath: path.join(targetDir, 'settings.json') },
		{ relativePath: 'mcp-config.json', sourcePath: path.join(copilotDir, 'mcp-config.json'), targetPath: path.join(targetDir, 'mcp-config.json') },
		{ relativePath: 'copilot-instructions.md', sourcePath: path.join(copilotDir, 'copilot-instructions.md'), targetPath: path.join(targetDir, 'copilot-instructions.md') },
		{
			relativePath: path.join(WORKSPACE_META_DIR, 'mcp-config.disabled.json'),
			sourcePath: path.join(copilotDir, WORKSPACE_META_DIR, 'mcp-config.disabled.json'),
			targetPath: path.join(targetDir, WORKSPACE_META_DIR, 'mcp-config.disabled.json'),
		},
	];
	const sourceEntries = new Map<string, FileEntry>();
	const targetEntries = new Map<string, FileEntry>();

	for (const fileMapping of fileMappings) {
		if (fs.existsSync(fileMapping.sourcePath)) {
			const stat = fs.statSync(fileMapping.sourcePath);
			sourceEntries.set(fileMapping.relativePath, {
				fullPath: fileMapping.sourcePath,
				mtimeMs: stat.mtimeMs,
			});
		}

		if (fs.existsSync(fileMapping.targetPath)) {
			const stat = fs.statSync(fileMapping.targetPath);
			targetEntries.set(fileMapping.relativePath, {
				fullPath: fileMapping.targetPath,
				mtimeMs: stat.mtimeMs,
			});
		}
	}

	return syncEntries(
		'core-files',
		copilotDir,
		copilotDir,
		targetDir,
		sourceEntries,
		targetEntries,
	);
}

import fs from 'fs';
import path from 'path';
import { SkillLocation, getSkillLocations } from './skillLocations';

export type SkillRecord = {
	id: string;
	name: string;
	description: string;
	skillPath: string;
	location: SkillLocation;
	enabled: boolean;
};

export function listSkillRecords(
	configPath: string,
	locations: SkillLocation[] = getSkillLocations(),
): SkillRecord[] {
	const disabledSkills = readDisabledSkills(configPath);
	return locations.flatMap((location) =>
		findSkillMarkdownFiles(location.rootPath).map((skillPath) => {
			const metadata = readSkillMetadata(skillPath);
			const skillId = resolveSkillIdentifier(skillPath, metadata);
			return {
				id: `${location.kind}:${skillPath}`,
				name: skillId,
				description: metadata.description,
				skillPath,
				location,
				enabled: !disabledSkills.has(skillId),
			};
		}),
	);
}

export function readSkillMetadata(skillPath: string): { name: string; description: string } {
	const contents = fs.readFileSync(skillPath, 'utf8');
	const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) {
		return { name: '', description: '' };
	}
	const frontmatter = match[1];
	return {
		name: readFrontmatterString(frontmatter, 'name'),
		description: readFrontmatterString(frontmatter, 'description'),
	};
}

export function setSkillEnabled(
	configPath: string,
	skillPath: string,
	enabled: boolean,
): void {
	const settingsPath = resolveSettingsPath(configPath);
	const metadata = readSkillMetadata(skillPath);
	const skillId = resolveSkillIdentifier(skillPath, metadata);
	const parsed = readSettingsJson(settingsPath);
	const disabledSkills = new Set(readDisabledSkills(configPath));
	if (enabled) {
		disabledSkills.delete(skillId);
	} else {
		disabledSkills.add(skillId);
	}
	parsed.disabledSkills = [...disabledSkills].sort((left, right) =>
		left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }),
	);
	writeSettingsJson(settingsPath, parsed);
}

export function readSkillEnabledByPath(configPath: string): Map<string, boolean> {
	const settingsPath = resolveSettingsPath(configPath);
	if (!fs.existsSync(settingsPath)) {
		return new Map<string, boolean>();
	}
	const disabledSkills = readDisabledSkills(configPath);
	return new Map([...disabledSkills].map((skillId) => [skillId, false]));
}

export function isSkillEnabled(configPath: string, skillPath: string): boolean {
	const metadata = readSkillMetadata(skillPath);
	const skillId = resolveSkillIdentifier(skillPath, metadata);
	return !readDisabledSkills(configPath).has(skillId);
}

function readFrontmatterString(frontmatter: string, key: string): string {
	const pattern = new RegExp(`^${key}:\\s*(?:"([^"]*)"|'([^']*)'|(.+))\\s*$`, 'm');
	const match = frontmatter.match(pattern);
	return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
}

function findSkillMarkdownFiles(rootPath: string): string[] {
	if (!fs.existsSync(rootPath)) {
		return [];
	}
	const results: string[] = [];
	const traverse = (currentPath: string): void => {
		const entries = fs.readdirSync(currentPath, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name.startsWith('.')) {
				continue;
			}
			const entryPath = path.join(currentPath, entry.name);
			if (entry.isDirectory()) {
				traverse(entryPath);
				continue;
			}
			if (entry.isFile() && entry.name === 'SKILL.md') {
				results.push(entryPath);
			}
		}
	};
	traverse(rootPath);
	return results.sort((left, right) =>
		left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }),
	);
}

function resolveSkillIdentifier(
	skillPath: string,
	metadata: { name: string; description: string },
): string {
	return metadata.name || path.basename(path.dirname(skillPath));
}

function resolveSettingsPath(configPath: string): string {
	return path.basename(configPath).toLowerCase() === 'config.json'
		? path.join(path.dirname(configPath), 'settings.json')
		: configPath;
}

function readSettingsJson(settingsPath: string): Record<string, unknown> {
	if (!fs.existsSync(settingsPath)) {
		return {};
	}
	try {
		return JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
	} catch {
		return {};
	}
}

function writeSettingsJson(settingsPath: string, settings: Record<string, unknown>): void {
	fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
	fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

function readDisabledSkills(configPath: string): Set<string> {
	const settingsPath = resolveSettingsPath(configPath);
	const parsed = readSettingsJson(settingsPath);
	const values = Array.isArray(parsed.disabledSkills) ? parsed.disabledSkills : [];
	return new Set(values.filter((value): value is string => typeof value === 'string'));
}

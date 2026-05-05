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
	void configPath;
	return locations.flatMap((location) =>
		findSkillMarkdownFiles(location.rootPath).map((skillPath) => {
			const metadata = readSkillMetadata(skillPath);
			return {
				id: `${location.kind}:${skillPath}`,
				name: metadata.name || path.basename(path.dirname(skillPath)),
				description: metadata.description,
				skillPath,
				location,
				enabled: true,
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
	void configPath;
	void skillPath;
	void enabled;
}

export function readSkillEnabledByPath(configPath: string): Map<string, boolean> {
	void configPath;
	return new Map<string, boolean>();
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

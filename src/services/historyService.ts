import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';

type RecordLike = Record<string, unknown>;

export type HistoryAssistantMessage = {
	message: string;
	localTime: string;
};

export type HistoryToolUsage = {
	label: string;
	status: string;
	localTime: string;
	detail?: string;
};

export type HistoryIssue = {
	severity: 'warning' | 'error';
	message: string;
};

export type HistoryTurnRecord = {
	turnId: string;
	sessionId: string;
	filePath: string;
	year: string;
	month: string;
	day: string;
	dateKey: string;
	localTime: string;
	sortTimestampMs: number;
	userMessage: string;
	userMessageLocalTime: string;
	listLabel: string;
	assistantMessages: HistoryAssistantMessage[];
	toolUsages: HistoryToolUsage[];
	issues: HistoryIssue[];
	rawEvents: string[];
};

export type HistoryIndex = {
	turns: HistoryTurnRecord[];
};

type SessionEvent = {
	type: string;
	id?: string;
	parentId?: string | null;
	timestamp?: string;
	data?: RecordLike;
};

function isRecordLike(value: unknown): value is RecordLike {
	return typeof value === 'object' && value !== null;
}

function toTimestampMs(input: unknown): number | undefined {
	if (typeof input === 'number' && Number.isFinite(input)) {
		return input;
	}
	if (typeof input !== 'string') {
		return undefined;
	}
	const parsed = Date.parse(input);
	return Number.isNaN(parsed) ? undefined : parsed;
}

function extractText(value: unknown): string | undefined {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed ? trimmed : undefined;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	if (Array.isArray(value)) {
		const parts = value
			.map((entry) => extractText(entry))
			.filter((entry): entry is string => Boolean(entry));
		return parts.length > 0 ? parts.join('\n') : undefined;
	}
	if (!isRecordLike(value)) {
		return undefined;
	}
	return (
		extractText(value.text) ??
		extractText(value.content) ??
		extractText(value.message) ??
		extractText(value.output) ??
		extractText(value.result) ??
		extractText(value.summary) ??
		extractText(value.value) ??
		extractText(value.parts)
	);
}

function formatDateParts(timestampMs: number): {
	year: string;
	month: string;
	day: string;
	dateKey: string;
} {
	const date = new Date(timestampMs);
	const year = String(date.getFullYear());
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return {
		year,
		month,
		day,
		dateKey: `${year}/${month}/${day}`,
	};
}

function compareTurnDesc(left: HistoryTurnRecord, right: HistoryTurnRecord): number {
	if (right.sortTimestampMs !== left.sortTimestampMs) {
		return right.sortTimestampMs - left.sortTimestampMs;
	}
	return right.turnId.localeCompare(left.turnId);
}

function readSessionEvents(eventsFilePath: string): {
	events: SessionEvent[];
	parseErrors: string[];
} {
	const lines = fs.readFileSync(eventsFilePath, 'utf8').split(/\r?\n/);
	const events: SessionEvent[] = [];
	const parseErrors: string[] = [];
	for (const line of lines) {
		if (!line.trim()) {
			continue;
		}
		try {
			const parsed = JSON.parse(line) as unknown;
			if (!isRecordLike(parsed) || typeof parsed.type !== 'string') {
				continue;
			}
			events.push({
				type: parsed.type,
				id: typeof parsed.id === 'string' ? parsed.id : undefined,
				parentId: typeof parsed.parentId === 'string' ? parsed.parentId : null,
				timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : undefined,
				data: isRecordLike(parsed.data) ? parsed.data : undefined,
			});
		} catch {
			parseErrors.push(line);
		}
	}
	return { events, parseErrors };
}

function isAssistantEvent(eventType: string): boolean {
	const normalized = eventType.toLowerCase();
	if (!normalized.startsWith('assistant.')) {
		return false;
	}
	return !normalized.endsWith('turn_start');
}

function isToolEvent(eventType: string): boolean {
	const normalized = eventType.toLowerCase();
	return normalized.includes('tool');
}

function extractUserMessage(event: SessionEvent): string | undefined {
	if (event.type !== 'user.message') {
		return undefined;
	}
	return (
		extractText(event.data?.content) ??
		extractText(event.data?.transformedContent) ??
		extractText(event.data?.message)
	);
}

function isDisplayableUserMessage(message: string): boolean {
	const trimmed = message.trim();
	if (!trimmed) {
		return false;
	}
	if (/^<skill-context\b[\s\S]*<\/skill-context>$/i.test(trimmed)) {
		return false;
	}
	return !/^\/[A-Za-z0-9-]+$/.test(trimmed);
}

function extractAssistantMessage(event: SessionEvent): string | undefined {
	if (!isAssistantEvent(event.type)) {
		return undefined;
	}
	return (
		extractText(event.data?.content) ??
		extractText(event.data?.message) ??
		extractText(event.data?.response) ??
		extractText(event.data?.output) ??
		extractText(event.data?.result)
	);
}

function extractToolUsage(event: SessionEvent): HistoryToolUsage | undefined {
	if (!isToolEvent(event.type)) {
		return undefined;
	}
	const label =
		extractText(event.data?.toolName) ??
		extractText(event.data?.name) ??
		extractText(event.data?.title) ??
		extractText(event.data?.command) ??
		event.type;
	const status =
		extractText(event.data?.status) ??
		event.type.replace(/^.*?\./, '').replaceAll('.', ' ');
	const detail =
		extractText(event.data?.arguments) ??
		extractText(event.data?.args) ??
		extractText(event.data?.input) ??
		extractText(event.data?.result) ??
		extractText(event.data?.error);
	return {
		label,
		status,
		localTime: formatLocalTime(event.timestamp ?? Date.now()),
		detail,
	};
}

function parseSessionDirectory(sessionDirPath: string): HistoryTurnRecord[] {
	const sessionId = path.basename(sessionDirPath);
	const eventsFilePath = path.join(sessionDirPath, 'events.jsonl');
	if (!fs.existsSync(eventsFilePath)) {
		return [];
	}

	const { events, parseErrors } = readSessionEvents(eventsFilePath);
	const turns: HistoryTurnRecord[] = [];
	let currentTurn: HistoryTurnRecord | undefined;
	let currentIndex = 0;
	const pendingIssues: HistoryIssue[] = [];
	const pendingRawEvents: string[] = [];

	const finalizeCurrentTurn = (): void => {
		if (!currentTurn) {
			return;
		}
		if (!currentTurn.listLabel) {
			currentTurn.listLabel = currentTurn.userMessage;
		}
		turns.push(currentTurn);
		currentTurn = undefined;
	};

	for (const parseErrorLine of parseErrors) {
		pendingIssues.push({
			severity: 'warning',
			message: 'One or more JSON lines could not be parsed and were skipped.',
		});
		pendingRawEvents.push(parseErrorLine);
	}

	for (const event of events) {
		const userMessage = extractUserMessage(event);
		if (userMessage && isDisplayableUserMessage(userMessage)) {
			finalizeCurrentTurn();
			const timestampMs = toTimestampMs(event.timestamp) ?? Date.now();
			const date = formatDateParts(timestampMs);
			currentTurn = {
				turnId: `${sessionId}:${String(currentIndex)}`,
				sessionId,
				filePath: eventsFilePath,
				year: date.year,
				month: date.month,
				day: date.day,
				dateKey: date.dateKey,
				localTime: formatLocalTime(timestampMs),
				sortTimestampMs: timestampMs,
				userMessage,
				userMessageLocalTime: formatLocalTime(timestampMs),
				listLabel: userMessage,
				assistantMessages: [],
				toolUsages: [],
				issues: pendingIssues.splice(0),
				rawEvents: pendingRawEvents.splice(0),
			};
			currentIndex += 1;
			continue;
		}

		if (!currentTurn) {
			continue;
		}

		const assistantMessage = extractAssistantMessage(event);
		if (assistantMessage) {
			currentTurn.assistantMessages.push({
				message: assistantMessage,
				localTime: formatLocalTime(event.timestamp ?? currentTurn.sortTimestampMs),
			});
			continue;
		}

		const toolUsage = extractToolUsage(event);
		if (toolUsage) {
			currentTurn.toolUsages.push(toolUsage);
			continue;
		}

		if (event.type === 'abort') {
			currentTurn.issues.push({
				severity: 'warning',
				message:
					extractText(event.data?.reason) ??
					'This session turn was aborted before completion.',
			});
		}
	}

	finalizeCurrentTurn();

	if (turns.length === 0) {
		return [];
	}

	if (pendingIssues.length > 0) {
		turns[turns.length - 1].issues.push(...pendingIssues);
	}

	return turns;
}

export function resolveCopilotHomeDir(
	homeDir: string = os.homedir(),
	copilotHome: string | undefined = process.env.COPILOT_HOME,
): string {
	if (typeof copilotHome === 'string' && copilotHome.trim()) {
		return copilotHome;
	}
	return path.join(homeDir, '.copilot');
}

export function resolveSessionsRoot(copilotHomeDir?: string): string {
	const baseDir = copilotHomeDir ?? resolveCopilotHomeDir();
	return path.join(baseDir, 'session-state');
}

export function formatLocalTime(input: string | number | Date): string {
	const date = new Date(input);
	if (Number.isNaN(date.getTime())) {
		return '';
	}
	const locale = (vscode.env.language ?? 'en').toLowerCase();
	if (locale.startsWith('ja')) {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');
		return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
	}
	return new Intl.DateTimeFormat(vscode.env.language ?? 'en', {
		dateStyle: 'medium',
		timeStyle: 'medium',
	}).format(date);
}

export function buildHistoryIndex(copilotHomeDir?: string): HistoryIndex {
	const sessionsRoot = resolveSessionsRoot(copilotHomeDir);
	if (!fs.existsSync(sessionsRoot)) {
		return { turns: [] };
	}

	const turns = fs
		.readdirSync(sessionsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name !== 'logs')
		.flatMap((entry) => parseSessionDirectory(path.join(sessionsRoot, entry.name)))
		.sort(compareTurnDesc);

	return { turns };
}

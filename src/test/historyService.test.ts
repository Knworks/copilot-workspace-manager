import * as assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	buildHistoryIndex,
	formatLocalTime,
	resolveSessionsRoot,
} from '../services/historyService';

function withTempDir(run: (root: string) => void): void {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-history-'));
	try {
		run(tempDir);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

function writeJsonl(filePath: string, lines: Array<unknown | string>): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(
		filePath,
		`${lines.map((line) => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n')}\n`,
		'utf8',
	);
}

suite('History service', () => {
	test('buildHistoryIndex reads session-state events.jsonl and orders user messages newest first', () => {
		withTempDir((root) => {
			const copilotHome = path.join(root, '.copilot');
			const sessionsRoot = resolveSessionsRoot(copilotHome);
			writeJsonl(path.join(sessionsRoot, 'session-new', 'events.jsonl'), [
				{
					type: 'user.message',
					timestamp: '2026-05-06T10:00:00.000Z',
					data: { content: 'new question' },
				},
				{
					type: 'assistant.message',
					timestamp: '2026-05-06T10:00:01.000Z',
					data: { content: 'new answer' },
				},
			]);
			writeJsonl(path.join(sessionsRoot, 'session-old', 'events.jsonl'), [
				{
					type: 'user.message',
					timestamp: '2026-05-05T10:00:00.000Z',
					data: { content: 'old question' },
				},
			]);

			const index = buildHistoryIndex(copilotHome);

			assert.deepStrictEqual(
				index.turns.map((turn) => turn.userMessage),
				['new question', 'old question'],
			);
		});
	});

	test('buildHistoryIndex groups assistant and tool events under the preceding user message', () => {
		withTempDir((root) => {
			const copilotHome = path.join(root, '.copilot');
			const sessionsRoot = resolveSessionsRoot(copilotHome);
			writeJsonl(path.join(sessionsRoot, 'session-tools', 'events.jsonl'), [
				{
					type: 'user.message',
					timestamp: '2026-05-06T10:00:00.000Z',
					data: { content: 'run the tool' },
				},
				{
					type: 'tool.call',
					timestamp: '2026-05-06T10:00:01.000Z',
					data: { name: 'search', status: 'started', arguments: 'abc' },
				},
				{
					type: 'assistant.message',
					timestamp: '2026-05-06T10:00:02.000Z',
					data: { content: 'tool finished' },
				},
			]);

			const index = buildHistoryIndex(copilotHome);

			assert.strictEqual(index.turns.length, 1);
			assert.deepStrictEqual(
				index.turns[0].assistantMessages.map((item) => item.message),
				['tool finished'],
			);
			assert.deepStrictEqual(
				index.turns[0].toolUsages.map((item) => item.label),
				['search'],
			);
			assert.strictEqual(index.turns[0].toolUsages[0].detail, 'abc');
		});
	});

	test('buildHistoryIndex skips sessions when events.jsonl is missing', () => {
		withTempDir((root) => {
			const copilotHome = path.join(root, '.copilot');
			const sessionsRoot = resolveSessionsRoot(copilotHome);
			fs.mkdirSync(path.join(sessionsRoot, 'missing-events'), { recursive: true });

			const index = buildHistoryIndex(copilotHome);

			assert.strictEqual(index.turns.length, 0);
		});
	});

	test('buildHistoryIndex skips malformed JSON lines and keeps them as raw events', () => {
		withTempDir((root) => {
			const copilotHome = path.join(root, '.copilot');
			const sessionsRoot = resolveSessionsRoot(copilotHome);
			writeJsonl(path.join(sessionsRoot, 'session-bad-json', 'events.jsonl'), [
				'{"type":"user.message","timestamp":"2026-05-06T10:00:00.000Z","data":{"content":"hello"}}',
				'{not-json}',
			]);

			const index = buildHistoryIndex(copilotHome);

			assert.strictEqual(index.turns.length, 1);
			assert.strictEqual(index.turns[0].userMessage, 'hello');
			assert.deepStrictEqual(index.turns[0].rawEvents, ['{not-json}']);
			assert.ok(index.turns[0].issues.some((issue) => issue.message.includes('JSON')));
		});
	});

	test('buildHistoryIndex skips slash-command-only user messages', () => {
		withTempDir((root) => {
			const copilotHome = path.join(root, '.copilot');
			const sessionsRoot = resolveSessionsRoot(copilotHome);
			fs.mkdirSync(path.join(sessionsRoot, 'session-slash'), { recursive: true });
			writeJsonl(path.join(sessionsRoot, 'session-slash', 'events.jsonl'), [
				{
					type: 'user.message',
					timestamp: '2026-05-06T11:00:00.000Z',
					data: { message: '/coding-guidlines' },
				},
				{
					type: 'assistant.message',
					timestamp: '2026-05-06T11:00:01.000Z',
					data: { message: 'skill loaded' },
				},
				{
					type: 'user.message',
					timestamp: '2026-05-06T11:01:00.000Z',
					data: { message: '/plan fix session history layout' },
				},
			]);

			const index = buildHistoryIndex(copilotHome);

			assert.deepStrictEqual(index.turns.map((turn) => turn.userMessage), ['/plan fix session history layout']);
		});
	});

	test('buildHistoryIndex skips skill-context wrapper messages', () => {
		withTempDir((root) => {
			const copilotHome = path.join(root, '.copilot');
			const sessionsRoot = resolveSessionsRoot(copilotHome);
			writeJsonl(path.join(sessionsRoot, 'session-skill-context', 'events.jsonl'), [
				{
					type: 'user.message',
					timestamp: '2026-05-06T11:00:00.000Z',
					data: {
						content: '<skill-context name="tool-serena">\n\nBase directory for this skill: C:\\Users\\Kaz\\.copilot\\skills\\tool-serena\n</skill-context>',
					},
				},
				{
					type: 'user.message',
					timestamp: '2026-05-06T11:01:00.000Z',
					data: { content: 'real question' },
				},
			]);

			const index = buildHistoryIndex(copilotHome);

			assert.deepStrictEqual(index.turns.map((turn) => turn.userMessage), ['real question']);
		});
	});

	test('buildHistoryIndex ignores logs directory under session-state', () => {
		withTempDir((root) => {
			const copilotHome = path.join(root, '.copilot');
			const sessionsRoot = resolveSessionsRoot(copilotHome);
			writeJsonl(path.join(sessionsRoot, 'logs', 'events.jsonl'), [
				{
					type: 'user.message',
					timestamp: '2026-05-06T10:00:00.000Z',
					data: { content: 'ignore me' },
				},
			]);

			const index = buildHistoryIndex(copilotHome);

			assert.strictEqual(index.turns.length, 0);
		});
	});

	test('formatLocalTime provides localized full date time text', () => {
		const formatted = formatLocalTime('2026-02-15T00:00:00.000Z');
		assert.ok(formatted.length > 0);
	});
});

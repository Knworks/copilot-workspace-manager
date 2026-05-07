import * as assert from 'assert';
import * as vscode from 'vscode';
import { HistoryPanelManager } from '../services/historyPanel';
import { HistoryIndex } from '../services/historyService';

type FakePanelHandle = {
	panel: vscode.WebviewPanel;
	getRevealCount: () => number;
	sendMessage: (message: unknown) => void;
	getPostedMessages: () => unknown[];
};

function createFakePanel(): FakePanelHandle {
	let revealCount = 0;
	let disposeListener: (() => void) | undefined;
	let receiveListener: ((message: unknown) => void) | undefined;
	const postedMessages: unknown[] = [];
	const webview = {
		html: '',
		cspSource: 'vscode-webview://test',
		asWebviewUri: (uri: vscode.Uri) => uri,
		postMessage: async (message: unknown) => {
			postedMessages.push(message);
			return true;
		},
		onDidReceiveMessage: (listener: (message: unknown) => void) => {
			receiveListener = listener;
			return { dispose: () => undefined };
		},
	} as unknown as vscode.Webview;

	const panel = {
		webview,
		reveal: () => {
			revealCount += 1;
		},
		onDidDispose: (listener: () => void) => {
			disposeListener = listener;
			return { dispose: () => undefined };
		},
		dispose: () => {
			disposeListener?.();
		},
	} as unknown as vscode.WebviewPanel;

	return {
		panel,
		getRevealCount: () => revealCount,
		sendMessage: (message: unknown) => receiveListener?.(message),
		getPostedMessages: () => postedMessages,
	};
}

function createIndex(): HistoryIndex {
	return {
		turns: [
			{
				turnId: 'turn-2',
				sessionId: 'session-b',
				filePath: '/tmp/session-b/events.jsonl',
				year: '2026',
				month: '05',
				day: '06',
				dateKey: '2026/05/06',
				localTime: '2026/05/06 11:00:00',
				sortTimestampMs: 2,
				userMessage: 'Beta session',
				userMessageLocalTime: '2026/05/06 11:00:00',
				listLabel: 'Beta session',
				assistantMessages: [{ message: 'beta answer', localTime: '2026/05/06 11:00:01' }],
				toolUsages: [{ label: 'search', status: 'done', localTime: '2026/05/06 11:00:02' }],
				issues: [],
				rawEvents: [],
			},
			{
				turnId: 'turn-1',
				sessionId: 'session-a',
				filePath: '/tmp/session-a/events.jsonl',
				year: '2026',
				month: '05',
				day: '06',
				dateKey: '2026/05/06',
				localTime: '2026/05/06 10:00:00',
				sortTimestampMs: 1,
				userMessage: 'Alpha session',
				userMessageLocalTime: '2026/05/06 10:00:00',
				listLabel: 'Alpha session',
				assistantMessages: [],
				toolUsages: [],
				issues: [{ severity: 'warning', message: 'parse warning' }],
				rawEvents: ['{bad-json}'],
			},
		],
	};
}

suite('History panel manager', () => {
	test('show reuses a single panel instance and reveals it', () => {
		const fakePanel = createFakePanel();
		let createCount = 0;
		const manager = new HistoryPanelManager(() => {
			createCount += 1;
			return fakePanel.panel;
		});

		manager.show();
		manager.show();

		assert.strictEqual(createCount, 1);
		assert.strictEqual(fakePanel.getRevealCount(), 1);
		assert.ok(fakePanel.panel.webview.html.includes('Session History'));
		assert.ok(fakePanel.panel.webview.html.includes('copyAssistantButton-'));
		assert.ok(fakePanel.panel.webview.html.includes('codicon-history'));
		assert.ok(fakePanel.panel.webview.html.includes('codicon-comment'));
		assert.ok(fakePanel.panel.webview.html.includes('codicon-copilot'));
		assert.ok(fakePanel.panel.webview.html.includes('agents_light.png'));
		assert.ok(fakePanel.panel.webview.html.includes('agents_dark.png'));
		assert.ok(fakePanel.panel.webview.html.includes('addInstructionFile'));
		assert.ok(!fakePanel.panel.webview.html.includes('chainDetailsToggle'));
		assert.ok(!fakePanel.panel.webview.html.includes('featuresTab'));
		manager.dispose();
	});

	test('webview messaging updates state for ready, search, clear, and turn selection', () => {
		const fakePanel = createFakePanel();
		const manager = new HistoryPanelManager(() => fakePanel.panel, () => createIndex());
		manager.show();

		fakePanel.sendMessage({ type: 'ready' });
		const firstState = fakePanel.getPostedMessages()[0] as {
			type: string;
			payload: {
				items: Array<{ turnId: string; displayMessage: string }>;
				selectedTurn?: { turnId: string; sessionId: string; toolUsages: unknown[] };
			};
		};
		assert.strictEqual(firstState.type, 'state');
		assert.deepStrictEqual(
			firstState.payload.items.map((item) => item.turnId),
			['turn-2', 'turn-1'],
		);
		assert.strictEqual(firstState.payload.selectedTurn?.turnId, 'turn-2');
		assert.strictEqual(firstState.payload.selectedTurn?.sessionId, 'session-b');
		assert.strictEqual(firstState.payload.selectedTurn?.toolUsages.length, 1);

		fakePanel.sendMessage({ type: 'search', query: 'alpha' });
		const filteredState = fakePanel.getPostedMessages()[1] as {
			payload: {
				appliedQuery: string;
				items: Array<{ turnId: string }>;
				selectedTurn?: { turnId: string };
			};
		};
		assert.strictEqual(filteredState.payload.appliedQuery, 'alpha');
		assert.deepStrictEqual(
			filteredState.payload.items.map((item) => item.turnId),
			['turn-1'],
		);
		assert.strictEqual(filteredState.payload.selectedTurn?.turnId, 'turn-1');

		fakePanel.sendMessage({ type: 'selectTurn', turnId: 'turn-2' });
		const selectedState = fakePanel.getPostedMessages()[2] as {
			payload: { selectedTurn?: { turnId: string } };
		};
		assert.strictEqual(selectedState.payload.selectedTurn?.turnId, 'turn-1');

		fakePanel.sendMessage({ type: 'clearSearch' });
		const clearedState = fakePanel.getPostedMessages()[3] as {
			payload: {
				appliedQuery: string;
				items: Array<{ turnId: string }>;
				selectedTurn?: { turnId: string };
			};
		};
		assert.strictEqual(clearedState.payload.appliedQuery, '');
		assert.deepStrictEqual(
			clearedState.payload.items.map((item) => item.turnId),
			['turn-2', 'turn-1'],
		);
		assert.strictEqual(clearedState.payload.selectedTurn?.turnId, 'turn-2');
		manager.dispose();
	});

	test('refreshTab refreshes only the requested core view tab', () => {
		const fakePanel = createFakePanel();
		let loadCount = 0;
		const manager = new HistoryPanelManager(
			() => fakePanel.panel,
			() => {
				loadCount += 1;
				return { turns: [] };
			},
		);
		manager.show();

		fakePanel.sendMessage({ type: 'refreshTab', tab: 'chain' });
		const chainMessage = fakePanel.getPostedMessages()[0] as {
			type: string;
			tab: string;
			payload: { entries: unknown[]; emptyStateMessage?: string; workspaceRoot?: string };
		};
		assert.strictEqual(chainMessage.type, 'tabContent');
		assert.strictEqual(chainMessage.tab, 'chain');
		assert.strictEqual(loadCount, 0);

		fakePanel.sendMessage({ type: 'refreshTab', tab: 'history' });
		const historyMessage = fakePanel.getPostedMessages()[1] as { type: string };
		assert.strictEqual(historyMessage.type, 'state');
		assert.strictEqual(loadCount, 1);
		manager.dispose();
	});

	test('limits history list to newest maxSessionHistoryCount entries when configured', () => {
		const fakePanel = createFakePanel();
		const manager = new HistoryPanelManager(
			() => fakePanel.panel,
			() => createIndex(),
			async () => undefined,
			async () => undefined,
			() => 1,
		);
		manager.show();

		fakePanel.sendMessage({ type: 'ready' });
		const state = fakePanel.getPostedMessages()[0] as {
			payload: {
				items: Array<{ turnId: string }>;
				selectedTurn?: { turnId: string };
			};
		};

		assert.deepStrictEqual(
			state.payload.items.map((item) => item.turnId),
			['turn-2'],
		);
		assert.strictEqual(state.payload.selectedTurn?.turnId, 'turn-2');
		manager.dispose();
	});

	test('copyText message writes text to clipboard and shows confirmation', async () => {
		const fakePanel = createFakePanel();
		let copiedText = '';
		let notified = false;
		const manager = new HistoryPanelManager(
			() => fakePanel.panel,
			() => createIndex(),
			async (value: string) => {
				copiedText = value;
			},
			async () => {
				notified = true;
				return undefined;
			},
		);
		manager.show();
		fakePanel.sendMessage({ type: 'copyText', text: 'copy-target' });
		await new Promise((resolve) => setTimeout(resolve, 0));

		assert.strictEqual(copiedText, 'copy-target');
		assert.strictEqual(notified, true);
		manager.dispose();
	});
});

import * as assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';
import { McpExplorerProvider } from '../views/mcpExplorerProvider';
import * as mcpService from '../services/mcpService';

suite('MCP explorer provider', () => {
	test('uses codicon mcp icons for JSON servers', () => {
		const originalReadMcpServers = mcpService.readMcpServers;
		const originalCopilotHome = process.env.COPILOT_HOME;
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-explorer-'));
		try {
			process.env.COPILOT_HOME = tempDir;
			fs.writeFileSync(path.join(tempDir, 'config.json'), '{}', 'utf8');
			(mcpService as unknown as { readMcpServers: typeof mcpService.readMcpServers }).readMcpServers =
				() => [
					{ id: 'github', enabled: true, headerLineIndex: 0 },
					{ id: 'remote', enabled: true, headerLineIndex: 1 },
				];

			const provider = new McpExplorerProvider({} as vscode.ExtensionContext);
			const items = provider.getChildren() as vscode.TreeItem[];

			assert.deepStrictEqual(
				items.map((item) => item.label),
				['github', 'remote'],
			);

			assert.ok(items[0].iconPath instanceof vscode.ThemeIcon);
			assert.strictEqual((items[0].iconPath as vscode.ThemeIcon).id, 'mcp');
			assert.strictEqual((items[0].iconPath as vscode.ThemeIcon).color, undefined);

			assert.ok(items[1].iconPath instanceof vscode.ThemeIcon);
			assert.strictEqual((items[1].iconPath as vscode.ThemeIcon).id, 'mcp');
		} finally {
			if (originalCopilotHome === undefined) {
				delete process.env.COPILOT_HOME;
			} else {
				process.env.COPILOT_HOME = originalCopilotHome;
			}
			fs.rmSync(tempDir, { recursive: true, force: true });
			(mcpService as unknown as { readMcpServers: typeof mcpService.readMcpServers }).readMcpServers =
				originalReadMcpServers;
		}
	});

	test('returns empty item when no MCP servers exist', () => {
		const originalReadMcpServers = mcpService.readMcpServers;
		const originalCopilotHome = process.env.COPILOT_HOME;
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-explorer-empty-'));
		try {
			process.env.COPILOT_HOME = tempDir;
			fs.writeFileSync(path.join(tempDir, 'config.json'), '{}', 'utf8');
			(mcpService as unknown as { readMcpServers: typeof mcpService.readMcpServers }).readMcpServers =
				() => [];

			const provider = new McpExplorerProvider({} as vscode.ExtensionContext);
			const items = provider.getChildren() as vscode.TreeItem[];

			assert.strictEqual(items.length, 1);
			assert.strictEqual(items[0].label, 'No MCP servers to display.');
		} finally {
			if (originalCopilotHome === undefined) {
				delete process.env.COPILOT_HOME;
			} else {
				process.env.COPILOT_HOME = originalCopilotHome;
			}
			fs.rmSync(tempDir, { recursive: true, force: true });
			(mcpService as unknown as { readMcpServers: typeof mcpService.readMcpServers }).readMcpServers =
				originalReadMcpServers;
		}
	});
});

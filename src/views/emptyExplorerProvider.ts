import * as vscode from 'vscode';
import { WorkspaceTreeDataProvider, WorkspaceStatusProvider } from './workspaceTreeProvider';

export class EmptyExplorerProvider extends WorkspaceTreeDataProvider<vscode.TreeItem> {
	constructor(statusProvider?: WorkspaceStatusProvider) {
		super(statusProvider);
	}

	protected getAvailableChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
		return [];
	}
}

import * as vscode from 'vscode';
import { WorkspaceTreeItem, FileViewKind } from '../models/treeItems';

export async function expandParentFolder(
	selection: WorkspaceTreeItem,
	views: Record<FileViewKind, vscode.TreeView<WorkspaceTreeItem>>,
): Promise<void> {
	if (selection.nodeType === 'root') {
		return;
	}
	if (
		selection.kind !== 'commands' &&
		selection.kind !== 'skills' &&
		selection.kind !== 'templates'
	) {
		return;
	}

	try {
		await views[selection.kind].reveal(selection, {
			expand: true,
			focus: false,
			select: false,
		});
	} catch (error) {
		console.error(error);
	}
}

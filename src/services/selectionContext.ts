import { WorkspaceTreeItem } from '../models/treeItems';

export class SelectionContext {
	private current?: WorkspaceTreeItem;

	setSelection(item?: WorkspaceTreeItem): void {
		this.current = item;
	}

	clear(): void {
		this.current = undefined;
	}

	getSelection(): WorkspaceTreeItem | undefined {
		return this.current;
	}
}

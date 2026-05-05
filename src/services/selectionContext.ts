import { WorkspaceTreeItem } from '../models/treeItems';

export class SelectionContext {
	private current?: WorkspaceTreeItem;

	setSelection(item?: WorkspaceTreeItem): void {
		this.current = item;
	}

	getSelection(): WorkspaceTreeItem | undefined {
		return this.current;
	}
}

import * as assert from 'assert';
import { WorkspaceTreeItem } from '../models/treeItems';
import { SelectionContext } from '../services/selectionContext';

suite('Selection context', () => {
	test('clear removes the current selection', () => {
		const context = new SelectionContext();
		const item = new WorkspaceTreeItem('root', 'skills', 'skills', 0, 'root');

		context.setSelection(item);
		context.clear();

		assert.strictEqual(context.getSelection(), undefined);
	});
});

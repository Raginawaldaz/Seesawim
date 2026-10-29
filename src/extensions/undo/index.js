/**
 * Undo / redo with insert-session grouping (Vim-like).
 * Command mode: u = undo, Ctrl+R = redo.
 */

const MAX_HISTORY = 1000;

export default {
  name: 'undo',
  setup(ctx) {
    const undoStack = [];
    const redoStack = [];
    let applying = false;
    /** @type {null | { changes: object[], cursorBefore: object, cursorAfter: object }} */
    let openGroup = null;
    let inInsert = ctx.state.mode === 'insert';

    function pushGroup(group) {
      if (!group || !group.changes.length) return;
      undoStack.push(group);
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
      redoStack.length = 0;
    }

    function closeGroup() {
      if (openGroup && openGroup.changes.length) {
        openGroup.cursorAfter = {
          row: ctx.state.cursor.row,
          col: ctx.state.cursor.col,
        };
        pushGroup(openGroup);
      }
      openGroup = null;
    }

    function ensureGroup(cursorBefore) {
      if (!openGroup) {
        openGroup = {
          changes: [],
          cursorBefore: cursorBefore || {
            row: ctx.state.cursor.row,
            col: ctx.state.cursor.col,
          },
          cursorAfter: null,
        };
      }
      return openGroup;
    }

    /**
     * Merge consecutive same-row single-line replacements inside a group.
     */
    function recordChange(ev) {
      if (applying) return;
      const group = ensureGroup(ev.cursorBefore);
      const last = group.changes[group.changes.length - 1];
      const isSingleLineEdit =
        ev.removed.length === 1 &&
        ev.inserted.length === 1 &&
        last &&
        last.row === ev.row &&
        last.removed.length === 1 &&
        last.inserted.length === 1;

      if (isSingleLineEdit) {
        // Keep earliest removed, latest inserted
        last.inserted = ev.inserted.slice();
        if (ev.cursorAfter) last.cursorAfter = ev.cursorAfter;
      } else {
        group.changes.push({
          row: ev.row,
          removed: ev.removed.slice(),
          inserted: ev.inserted.slice(),
          cursorBefore: ev.cursorBefore,
          cursorAfter: ev.cursorAfter,
        });
      }

      // Outside insert, each buffer mutation is its own undo group
      if (!inInsert) {
        closeGroup();
      }
    }

    ctx.on('change', recordChange);

    ctx.on('modeChange', ({ from, to }) => {
      if (from === 'insert' && to !== 'insert') {
        inInsert = false;
        closeGroup();
      } else if (to === 'insert') {
        inInsert = true;
        // Start a fresh insert group on first edit
        openGroup = null;
      } else if (!inInsert) {
        closeGroup();
      }
    });

    function applyInverse(change) {
      // Swap removed/inserted to invert
      ctx.buffer.replaceLines(change.row, change.inserted.length, change.removed, {
        cursorBefore: change.cursorAfter,
        cursorAfter: change.cursorBefore,
      });
    }

    function applyForward(change) {
      ctx.buffer.replaceLines(change.row, change.removed.length, change.inserted, {
        cursorBefore: change.cursorBefore,
        cursorAfter: change.cursorAfter,
      });
    }

    function undo() {
      closeGroup();
      if (!undoStack.length) {
        return {
          handled: true,
          enterInsert: false,
          enterEx: false,
          message: 'Already at oldest change',
        };
      }
      const group = undoStack.pop();
      applying = true;
      try {
        for (let i = group.changes.length - 1; i >= 0; i--) {
          applyInverse(group.changes[i]);
        }
        if (group.cursorBefore) {
          ctx.state.cursor = { ...group.cursorBefore };
        }
        ctx.state.dirty = true;
        if (ctx.state.mode === 'insert') {
          ctx.state.inputText = ctx.buffer.getLine(ctx.state.cursor.row);
          ctx.state.inputCol = Math.min(
            ctx.state.cursor.col,
            ctx.state.inputText.length
          );
        }
      } finally {
        applying = false;
      }
      redoStack.push(group);
      ctx.paint();
      return { handled: true, enterInsert: false, enterEx: false, message: null };
    }

    function redo() {
      closeGroup();
      if (!redoStack.length) {
        return {
          handled: true,
          enterInsert: false,
          enterEx: false,
          message: 'Already at newest change',
        };
      }
      const group = redoStack.pop();
      applying = true;
      try {
        for (const change of group.changes) {
          applyForward(change);
        }
        if (group.cursorAfter) {
          ctx.state.cursor = { ...group.cursorAfter };
        }
        ctx.state.dirty = true;
        if (ctx.state.mode === 'insert') {
          ctx.state.inputText = ctx.buffer.getLine(ctx.state.cursor.row);
          ctx.state.inputCol = Math.min(
            ctx.state.cursor.col,
            ctx.state.inputText.length
          );
        }
      } finally {
        applying = false;
      }
      undoStack.push(group);
      ctx.paint();
      return { handled: true, enterInsert: false, enterEx: false, message: null };
    }

    ctx.addCommandKey((cmdKey, rawKey) => {
      if (ctx.state.mode !== 'command') return null;
      const full = rawKey && rawKey.full;
      if (full === 'C-r') return redo();
      if (cmdKey === 'u') return undo();
      return null;
    });
  },
};

import fs from 'fs';
import path from 'path';
import { TextBuffer } from './buffer.js';
import { createCursor, clampCursor } from './cursor.js';
import { handleCommandKey } from './commands.js';
import { runExCommand, resolveSavePath } from './ex.js';
import { modeFromBlessedKey, commandKeyFromBlessed } from './keys.js';
import { createUi, restoreTerminal } from './ui/screen.js';
import { createRenderer } from './ui/renderer.js';
import { createExtensionHost } from './extensions.js';

/**
 * Run the Seesawim TUI editor on a file path.
 * All keys go through one screen handler — no nested textbox.
 */
export function startEditor(filePath) {
  const resolved = path.resolve(filePath);
  let exists = true;
  let content = '';
  try {
    content = fs.readFileSync(resolved, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      exists = false;
      content = '';
    } else {
      throw err;
    }
  }

  const buffer = TextBuffer.fromString(content);
  const ui = createUi();
  const { screen, inputRow } = ui;

  const state = {
    mode: 'command', // command | insert | ex
    buffer,
    cursor: createCursor(0, 0),
    countPrefix: '',
    filePath: resolved,
    dirty: false,
    message: exists ? '' : 'New file (not on disk yet)',
    messageKind: 'info',
    messageTimer: null,
    inputText: '',
    inputCol: 0,
    inputHScroll: 0,
  };

  let shuttingDown = false;
  let host = null;
  let renderer = null;

  function paint() {
    if (renderer) renderer.requestPaint();
  }

  function paintSync() {
    if (renderer) renderer.paintSync();
  }

  function setMessage(text, kind = 'info') {
    state.message = text || '';
    state.messageKind = kind;
    if (state.messageTimer) {
      clearTimeout(state.messageTimer);
      state.messageTimer = null;
    }
    if (!shuttingDown) paint();
  }

  host = createExtensionHost({
    state,
    buffer,
    paint,
    setMessage,
  });

  renderer = createRenderer(ui, () => state, host.hooks);
  if (host.settingsError) {
    setMessage(host.settingsError, 'error');
  }

  function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    if (renderer) renderer.setShuttingDown(true);
    if (state.messageTimer) {
      clearTimeout(state.messageTimer);
      state.messageTimer = null;
    }
    try {
      screen.program.showCursor();
      screen.program.flush();
    } catch {
      /* ignore */
    }
    try {
      if (screen && !screen.destroyed) screen.destroy();
    } catch {
      /* ignore */
    }
    restoreTerminal(screen);
    process.exit(code);
  }

  function crashOut(err) {
    try {
      if (screen && !screen.destroyed) screen.destroy();
    } catch {
      /* ignore */
    }
    restoreTerminal(screen);
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  }

  process.on('exit', () => restoreTerminal(screen));
  process.on('uncaughtException', crashOut);
  process.on('unhandledRejection', crashOut);

  const api = {
    async save(fileArg) {
      const target = resolveSavePath(state.filePath, fileArg);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const body = buffer.toString();
      fs.writeFileSync(target, body, 'utf8');
      state.filePath = target;
      state.dirty = false;
      host.emit('save', { path: target });
      if (!shuttingDown) paint();
      return {
        path: target,
        lines: buffer.lineCount,
        bytes: Buffer.byteLength(body, 'utf8'),
      };
    },
    async quit() {
      shutdown(0);
    },
  };

  function focusInput() {
    inputRow.focus();
  }

  function setMode(next) {
    const from = state.mode;
    if (from === next) return;
    state.mode = next;
    host.emit('modeChange', { from, to: next });
  }

  function enterCommandMode() {
    setMode('command');
    state.countPrefix = '';
    state.inputText = '';
    state.inputCol = 0;
    state.inputHScroll = 0;
    focusInput();
    paint();
  }

  function enterInsertMode() {
    if (state.mode === 'insert') return;
    setMode('insert');
    state.countPrefix = '';
    state.cursor = clampCursor(state.cursor, buffer);
    state.inputText = buffer.getLine(state.cursor.row);
    state.inputCol = Math.min(state.cursor.col, state.inputText.length);
    state.message = '';
    state.messageKind = 'info';
    focusInput();
    paint();
  }

  function enterExMode() {
    setMode('ex');
    state.countPrefix = '';
    state.inputText = ':';
    state.inputCol = 1;
    state.inputHScroll = 0;
    state.message = '';
    state.messageKind = 'info';
    focusInput();
    paint();
  }

  function syncInsertToBuffer() {
    const before = { row: state.cursor.row, col: state.cursor.col };
    buffer.setLine(state.cursor.row, state.inputText, {
      cursorBefore: before,
      cursorAfter: { row: state.cursor.row, col: state.inputCol },
    });
    state.cursor.col = state.inputCol;
    state.dirty = true;
  }

  function insertEnter() {
    syncInsertToBuffer();
    const before = { row: state.cursor.row, col: state.inputCol };
    const next = buffer.splitLine(state.cursor.row, state.inputCol, {
      cursorBefore: before,
    });
    state.cursor = next;
    state.inputText = buffer.getLine(state.cursor.row);
    state.inputCol = 0;
    state.inputHScroll = 0;
    state.dirty = true;
    paint();
  }

  function insertBackspaceJoin() {
    if (state.cursor.row <= 0) return false;
    syncInsertToBuffer();
    const before = { row: state.cursor.row, col: 0 };
    const next = buffer.joinWithPrevious(state.cursor.row, { cursorBefore: before });
    if (!next) return false;
    state.cursor = next;
    state.inputText = buffer.getLine(state.cursor.row);
    state.inputCol = next.col;
    state.inputHScroll = 0;
    state.dirty = true;
    paint();
    return true;
  }

  async function submitEx() {
    let raw = state.inputText;
    if (raw.startsWith(':')) raw = raw.slice(1);
    try {
      const result = await runExCommand(state, raw, api);
      if (shuttingDown || result.quit) return;
      enterCommandMode();
      if (result.message) {
        setMessage(result.message, result.ok === false ? 'error' : 'info');
      }
    } catch (err) {
      if (shuttingDown) return;
      enterCommandMode();
      const text = err && err.message ? err.message : String(err);
      setMessage(text, 'error');
    }
  }

  // Windows often emits both "return" and "enter" for one keypress.
  // Only swallow the paired alternate name within 80ms — never same-name repeats.
  let lastEnterAt = 0;
  let lastEnterName = '';
  function consumeEnter(key, ch) {
    const name =
      key.name === 'enter' || key.full === 'enter'
        ? 'enter'
        : key.name === 'return' || key.full === 'return'
          ? 'return'
          : ch === '\r'
            ? 'return'
            : ch === '\n'
              ? 'enter'
              : null;
    if (!name) return false;
    const now = Date.now();
    if (
      now - lastEnterAt < 80 &&
      lastEnterName &&
      lastEnterName !== name
    ) {
      return true; // swallow duplicate pair
    }
    lastEnterAt = now;
    lastEnterName = name;
    return 'fire';
  }

  function handleInsertKey(ch, key) {
    const toggle = modeFromBlessedKey(key.full);
    if (toggle === 'command' || key.full === 'escape') {
      syncInsertToBuffer();
      enterCommandMode();
      return;
    }
    if (toggle === 'insert') return;

    const enter = consumeEnter(key, ch);
    if (enter === 'fire') {
      insertEnter();
      return;
    }
    if (enter) return;

    if (key.full === 'backspace' || key.name === 'backspace') {
      if (state.inputCol > 0) {
        state.inputText =
          state.inputText.slice(0, state.inputCol - 1) +
          state.inputText.slice(state.inputCol);
        state.inputCol -= 1;
        syncInsertToBuffer();
        paint();
      } else {
        insertBackspaceJoin();
      }
      return;
    }

    if (key.full === 'left' || key.name === 'left') {
      state.inputCol = Math.max(0, state.inputCol - 1);
      state.cursor.col = state.inputCol;
      paint();
      return;
    }
    if (key.full === 'right' || key.name === 'right') {
      state.inputCol = Math.min(state.inputText.length, state.inputCol + 1);
      state.cursor.col = state.inputCol;
      paint();
      return;
    }

    if (key.full === 'home' || key.name === 'home') {
      state.inputCol = 0;
      state.cursor.col = 0;
      paint();
      return;
    }
    if (key.full === 'end' || key.name === 'end') {
      state.inputCol = state.inputText.length;
      state.cursor.col = state.inputCol;
      paint();
      return;
    }

    // Printable character (skip controls / CR / LF)
    if (
      ch &&
      ch.length === 1 &&
      !key.ctrl &&
      !key.meta &&
      ch >= ' ' &&
      ch !== '\r' &&
      ch !== '\n'
    ) {
      state.inputText =
        state.inputText.slice(0, state.inputCol) +
        ch +
        state.inputText.slice(state.inputCol);
      state.inputCol += 1;
      syncInsertToBuffer();
      paint();
    }
  }

  function handleExKey(ch, key) {
    const toggle = modeFromBlessedKey(key.full);
    if (toggle === 'command' || key.full === 'escape') {
      enterCommandMode();
      return;
    }

    const enter = consumeEnter(key, ch);
    if (enter === 'fire') {
      submitEx();
      return;
    }
    if (enter) return;

    if (key.full === 'backspace' || key.name === 'backspace') {
      if (state.inputText === ':' && state.inputCol <= 1) {
        enterCommandMode();
        return;
      }
      if (state.inputCol > 0) {
        state.inputText =
          state.inputText.slice(0, state.inputCol - 1) +
          state.inputText.slice(state.inputCol);
        state.inputCol -= 1;
        if (!state.inputText.startsWith(':')) {
          state.inputText = ':' + state.inputText.replace(/^:+/, '');
          state.inputCol = Math.min(state.inputCol + 1, state.inputText.length);
        }
        paint();
      }
      return;
    }

    if (key.full === 'left' || key.name === 'left') {
      state.inputCol = Math.max(1, state.inputCol - 1); // keep leading ':'
      paint();
      return;
    }
    if (key.full === 'right' || key.name === 'right') {
      state.inputCol = Math.min(state.inputText.length, state.inputCol + 1);
      paint();
      return;
    }
    if (key.full === 'home' || key.name === 'home') {
      state.inputCol = 1;
      paint();
      return;
    }
    if (key.full === 'end' || key.name === 'end') {
      state.inputCol = state.inputText.length;
      paint();
      return;
    }

    if (ch && ch.length === 1 && !key.ctrl && !key.meta && ch >= ' ') {
      state.inputText =
        state.inputText.slice(0, state.inputCol) +
        ch +
        state.inputText.slice(state.inputCol);
      state.inputCol += 1;
      paint();
    }
  }

  function handleCommandKeypress(ch, key) {
    const toggle = modeFromBlessedKey(key.full);
    if (toggle === 'command') {
      enterCommandMode();
      return;
    }
    if (toggle === 'insert') {
      enterInsertMode();
      return;
    }
    if (key.full === 'C-c') {
      shutdown(0);
      return;
    }

    // Extensions first (count digits, undo u / Ctrl+R, …)
    const extResult = host.runCommandKeys(
      commandKeyFromBlessed(ch, key) || '',
      key
    );
    if (extResult && extResult.handled) {
      if (extResult.enterInsert) {
        enterInsertMode();
        return;
      }
      if (extResult.enterEx) {
        enterExMode();
        return;
      }
      if (extResult.message != null && extResult.message !== '') {
        setMessage(extResult.message, 'info');
        return;
      }
      paint();
      return;
    }

    const cmdKey = commandKeyFromBlessed(ch, key);
    if (!cmdKey) return;

    const result = handleCommandKey(state, cmdKey);
    if (result.enterInsert) {
      enterInsertMode();
      return;
    }
    if (result.enterEx) {
      enterExMode();
      return;
    }
    if (result.message != null && result.message !== '') {
      setMessage(result.message, 'info');
      return;
    }
    paint();
  }

  screen.on('keypress', (ch, key) => {
    if (shuttingDown) return;
    if (!key) return;
    if (key.full === 'C-c') {
      shutdown(0);
      return;
    }

    host.emit('keypress', { ch, key });

    if (state.mode === 'command') {
      handleCommandKeypress(ch, key);
      return;
    }
    if (state.mode === 'insert') {
      handleInsertKey(ch, key);
      return;
    }
    if (state.mode === 'ex') {
      handleExKey(ch, key);
    }
  });

  screen.key(['C-c'], () => shutdown(0));
  screen.on('resize', () => {
    if (!shuttingDown) {
      renderer.invalidate();
      paint();
    }
  });

  screen.enableKeys();
  focusInput();
  enterCommandMode();
  if (!exists) setMessage('New file (not on disk yet)', 'info');
  // First frame must be synchronous so the UI appears before any key
  paintSync();
}

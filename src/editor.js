import fs from 'fs';
import path from 'path';
import {
  splitContent,
  joinLines,
  getLine,
  setLine,
  advanceAfterEnter,
} from './buffer.js';
import { createCursor, clampCursor } from './cursor.js';
import { handleCommandKey, runExCommand, resolveSavePath } from './commands.js';
import { modeFromBlessedKey, commandKeyFromBlessed } from './keys.js';
import {
  createUi,
  renderCode,
  renderTitle,
  renderStatus,
  renderInput,
  placeCursor,
  hideRealCursor,
  restoreTerminal,
} from './ui.js';

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

  const ui = createUi();
  const { screen, title, code, status, ruleTop, inputRow, ruleBottom } = ui;
  const inputParts = { ruleTop, inputRow, ruleBottom, screen };

  const state = {
    mode: 'command', // command | insert | ex
    lines: splitContent(content),
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

  function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
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
      const body = joinLines(state.lines);
      fs.writeFileSync(target, body, 'utf8');
      state.filePath = target;
      state.dirty = false;
      if (!shuttingDown) paint();
      return {
        path: target,
        lines: state.lines.length,
        bytes: Buffer.byteLength(body, 'utf8'),
      };
    },
    async quit() {
      shutdown(0);
    },
  };

  function setMessage(text, kind = 'info') {
    state.message = text || '';
    state.messageKind = kind;
    if (state.messageTimer) {
      clearTimeout(state.messageTimer);
      state.messageTimer = null;
    }
    if (!shuttingDown) paint();
  }

  function clearMessage() {
    if (!state.message) return;
    state.message = '';
    state.messageKind = 'info';
    if (state.messageTimer) {
      clearTimeout(state.messageTimer);
      state.messageTimer = null;
    }
    paint();
  }

  function focusInput() {
    inputRow.focus();
  }

  function paint() {
    if (shuttingDown) return;
    state.cursor = clampCursor(state.cursor, state.lines);
    renderTitle(title, state.filePath, state.dirty);
    renderCode(code, state.lines, state.cursor);
    renderStatus(status, state);
    const caret = renderInput(
      inputParts,
      state.mode === 'command' ? '' : state.inputText,
      state.inputCol,
      state.mode,
      state
    );
    // Hide during draw so blessed does not restore a leftover position.
    // Don't flush yet — screen.render() sends civis in the same write.
    hideRealCursor(screen, false);
    screen.render();
    if (caret && caret.cursorVisible) {
      placeCursor(screen, inputRow, caret.cursorCol);
    } else {
      hideRealCursor(screen);
    }
  }

  function enterCommandMode() {
    state.mode = 'command';
    state.countPrefix = '';
    state.inputText = '';
    state.inputCol = 0;
    state.inputHScroll = 0;
    focusInput();
    paint();
  }

  function enterInsertMode() {
    if (state.mode === 'insert') return;
    state.mode = 'insert';
    state.countPrefix = '';
    state.cursor = clampCursor(state.cursor, state.lines);
    state.inputText = getLine(state.lines, state.cursor.row);
    state.inputCol = Math.min(state.cursor.col, state.inputText.length);
    state.message = '';
    state.messageKind = 'info';
    focusInput();
    paint();
  }

  function enterExMode() {
    state.mode = 'ex';
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
    setLine(state.lines, state.cursor.row, state.inputText);
    state.cursor.col = state.inputCol;
    state.dirty = true;
  }

  function insertEnter() {
    syncInsertToBuffer();
    const nextRow = advanceAfterEnter(state.lines, state.cursor.row);
    state.cursor = { row: nextRow, col: 0 };
    state.inputText = getLine(state.lines, state.cursor.row);
    state.inputCol = 0;
    state.inputHScroll = 0;
    state.dirty = true;
    paint();
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
  let lastEnterAt = 0;
  function consumeEnter(key, ch) {
    const isEnter =
      key.name === 'enter' ||
      key.name === 'return' ||
      key.full === 'enter' ||
      key.full === 'return' ||
      ch === '\r' ||
      ch === '\n';
    if (!isEnter) return false;
    const now = Date.now();
    if (now - lastEnterAt < 80) return true; // swallow duplicate
    lastEnterAt = now;
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

    clearMessage();

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
    if (!shuttingDown) paint();
  });

  screen.enableKeys();
  focusInput();
  enterCommandMode();
  if (!exists) setMessage('New file (not on disk yet)', 'info');
  paint();
}

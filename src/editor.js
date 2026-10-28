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
import { handleCommandKey, runExCommand } from './commands.js';
import { modeFromBlessedKey, commandKeyFromBlessed } from './keys.js';
import {
  createUi,
  renderCode,
  renderTitle,
  renderStatus,
  renderInput,
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
    messageTimer: null,
    inputText: '',
    inputCol: 0,
  };

  const api = {
    async save() {
      fs.mkdirSync(path.dirname(state.filePath), { recursive: true });
      fs.writeFileSync(state.filePath, joinLines(state.lines), 'utf8');
      state.dirty = false;
      paint();
    },
    async quit() {
      screen.destroy();
      process.exit(0);
    },
  };

  function setMessage(text, ms = 3500) {
    state.message = text || '';
    if (state.messageTimer) clearTimeout(state.messageTimer);
    paint();
    if (ms && state.message) {
      state.messageTimer = setTimeout(() => {
        state.message = '';
        paint();
      }, ms);
    }
  }

  function focusInput() {
    // Keep focus on the bottom row so any leaked real cursor stays there,
    // not in the middle of the code pane.
    inputRow.focus();
    screen.program.hideCursor();
  }

  function paint() {
    state.cursor = clampCursor(state.cursor, state.lines);
    renderTitle(title, state.filePath, state.dirty);
    renderCode(code, state.lines, state.cursor);
    renderStatus(status, state);
    renderInput(
      inputParts,
      state.mode === 'command' ? '' : state.inputText,
      state.inputCol,
      state.mode
    );
    screen.render();
    screen.program.hideCursor();
  }

  function enterCommandMode() {
    state.mode = 'command';
    state.countPrefix = '';
    state.inputText = '';
    state.inputCol = 0;
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
    focusInput();
    paint();
  }

  function enterExMode() {
    state.mode = 'ex';
    state.countPrefix = '';
    state.inputText = ':';
    state.inputCol = 1;
    state.message = '';
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
    state.dirty = true;
    paint();
  }

  async function submitEx() {
    let raw = state.inputText;
    if (raw.startsWith(':')) raw = raw.slice(1);
    const result = await runExCommand(state, raw, api);
    enterCommandMode();
    if (result.message) setMessage(result.message);
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
      api.quit();
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
    if (result.message != null) setMessage(result.message);
    paint();
  }

  // Single key router on screen (keys still reach here when grabKeys is false)
  screen.on('keypress', (ch, key) => {
    if (!key) return;
    if (key.full === 'C-c') {
      api.quit();
      return;
    }

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

  screen.key(['C-c'], () => api.quit());

  screen.enableKeys();
  focusInput();
  enterCommandMode();
  if (!exists) setMessage('New file (not on disk yet)');
  paint();
}

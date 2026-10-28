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
  setInputActive,
} from './ui.js';

/**
 * Run the Seesawim TUI editor on a file path.
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
  const { screen, title, code, status, inputFrame, cmdline } = ui;

  const state = {
    mode: 'command',
    lines: splitContent(content),
    cursor: createCursor(0, 0),
    countPrefix: '',
    filePath: resolved,
    dirty: false,
    message: exists ? '' : 'New file (not on disk yet)',
    messageTimer: null,
    _suppressCmdKeys: false,
    _ignoreReadCallback: false,
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

  function paint() {
    state.cursor = clampCursor(state.cursor, state.lines);
    renderTitle(title, state.filePath, state.dirty);
    renderCode(code, state.lines, state.cursor, {
      showCaret: false,
    });
    renderStatus(status, state);
    setInputActive(inputFrame, state.mode === 'insert' || state.mode === 'ex');
    screen.render();
  }

  function clearCmdline() {
    state._suppressCmdKeys = true;
    cmdline.clearValue();
    cmdline.setValue('');
    state._suppressCmdKeys = false;
  }

  function setCmdlineValue(value) {
    state._suppressCmdKeys = true;
    cmdline.setValue(value);
    state._suppressCmdKeys = false;
  }

  /** Stop textbox readInput without treating it as user cancel. */
  function stopReading() {
    if (!cmdline._reading) return;
    state._ignoreReadCallback = true;
    try {
      cmdline.cancel();
    } catch {
      /* ignore */
    }
    state._ignoreReadCallback = false;
  }

  function enterCommandMode() {
    if (state.mode === 'command' && !cmdline._reading) {
      paint();
      return;
    }
    stopReading();
    state.mode = 'command';
    state.countPrefix = '';
    clearCmdline();
    screen.grabKeys = false;
    screen.program.hideCursor();
    code.focus();
    paint();
  }

  function enterInsertMode() {
    if (state.mode === 'insert' && cmdline._reading) {
      // Already inserting — ignore repeat Ctrl+Down / C-j
      return;
    }
    stopReading();
    state.mode = 'insert';
    state.countPrefix = '';
    state.cursor = clampCursor(state.cursor, state.lines);
    const line = getLine(state.lines, state.cursor.row);
    setCmdlineValue(line);
    screen.program.showCursor();
    state.message = '';
    paint();
    // Defer so cancel/focus settle before grabbing keys
    setImmediate(() => {
      if (state.mode !== 'insert') return;
      cmdline.focus();
      readCmdline();
      paint();
    });
  }

  function enterExMode() {
    stopReading();
    state.mode = 'ex';
    state.countPrefix = '';
    setCmdlineValue(':');
    screen.program.showCursor();
    state.message = '';
    paint();
    setImmediate(() => {
      if (state.mode !== 'ex') return;
      cmdline.focus();
      readCmdline();
      paint();
    });
  }

  function syncInsertFromCmdline() {
    if (state.mode !== 'insert' || state._suppressCmdKeys) return;
    const value = cmdline.getValue();
    setLine(state.lines, state.cursor.row, value);
    state.cursor.col = value.length;
    state.dirty = true;
    paint();
  }

  function insertEnter() {
    const value = cmdline.getValue();
    setLine(state.lines, state.cursor.row, value);
    const nextRow = advanceAfterEnter(state.lines, state.cursor.row);
    state.cursor = { row: nextRow, col: 0 };
    state.dirty = true;
    const line = getLine(state.lines, state.cursor.row);
    setCmdlineValue(line);
    paint();
    setImmediate(() => {
      if (state.mode !== 'insert') return;
      readCmdline();
    });
  }

  async function submitEx(rawValue) {
    let raw = rawValue ?? cmdline.getValue();
    if (raw.startsWith(':')) raw = raw.slice(1);
    const result = await runExCommand(state, raw, api);
    const name = raw.trim();
    if (result.ok && (name === 'w' || name === 'write')) {
      enterCommandMode();
      setMessage(result.message || '');
      return;
    }
    enterCommandMode();
    if (result.message) setMessage(result.message);
  }

  function readCmdline() {
    if (state.mode !== 'insert' && state.mode !== 'ex') return;
    if (cmdline._reading) return;

    cmdline.readInput((err, value) => {
      if (state._ignoreReadCallback) return;

      // escape / cancel => (null, null); Enter => (null, string)
      if (err || value == null) {
        if (state.mode === 'insert' || state.mode === 'ex') {
          enterCommandMode();
        }
        return;
      }
      if (state.mode === 'insert') {
        setCmdlineValue(value);
        insertEnter();
        return;
      }
      if (state.mode === 'ex') {
        submitEx(value);
      }
    });
  }

  cmdline.on('keypress', (ch, key) => {
    if (state._suppressCmdKeys || !key) return;

    const toggle = modeFromBlessedKey(key.full);
    if (toggle === 'command') {
      enterCommandMode();
      return;
    }
    if (toggle === 'insert') {
      // Already handled by global binder; avoid re-entry from textbox
      return;
    }

    if (key.full === 'escape') {
      enterCommandMode();
      return;
    }

    if (state.mode === 'ex') {
      setImmediate(() => {
        if (state.mode !== 'ex') return;
        const v = cmdline.getValue();
        if (!v.startsWith(':')) {
          setCmdlineValue(':' + v.replace(/^:+/, ''));
        }
      });
      return;
    }

    if (state.mode === 'insert') {
      setImmediate(() => syncInsertFromCmdline());
    }
  });

  function onCommandKeys(ch, key) {
    if (state.mode !== 'command') return;
    if (!key) return;

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

  // Command keys only on the focused code pane (single listener — no double-fire).
  code.on('keypress', onCommandKeys);

  // Guard against the same physical key being delivered twice to screen.key
  let modeToggleLock = false;
  function withModeLock(fn) {
    return () => {
      if (modeToggleLock) return;
      modeToggleLock = true;
      try {
        fn();
      } finally {
        setImmediate(() => {
          modeToggleLock = false;
        });
      }
    };
  }

  // Mode toggles once on screen only (binding on both screen+code caused
  // enterInsert → cancel → crash on the second Ctrl+Down).
  screen.key(['C-up', 'C-k'], withModeLock(() => enterCommandMode()));
  screen.key(['C-down', 'C-j'], withModeLock(() => enterInsertMode()));
  screen.key(['C-c'], () => api.quit());

  enterCommandMode();
  if (!exists) setMessage('New file (not on disk yet)');
  paint();
}

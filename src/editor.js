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
  const { screen, title, code, status, cmdline } = ui;

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
      showCaret: state.mode === 'insert',
    });
    renderStatus(status, state);
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

  function enterCommandMode() {
    state.mode = 'command';
    state.countPrefix = '';
    try {
      if (cmdline._reading) cmdline.cancel();
    } catch {
      /* ignore if not reading */
    }
    clearCmdline();
    screen.grabKeys = false;
    screen.program.hideCursor();
    // Keep focus on the code pane so command keys are delivered
    code.focus();
    paint();
  }

  function enterInsertMode() {
    state.mode = 'insert';
    state.countPrefix = '';
    state.cursor = clampCursor(state.cursor, state.lines);
    const line = getLine(state.lines, state.cursor.row);
    setCmdlineValue(line);
    screen.program.showCursor();
    cmdline.focus();
    // Start reading input into the textbox
    readCmdline();
    setMessage('');
    paint();
  }

  function enterExMode() {
    state.mode = 'ex';
    state.countPrefix = '';
    setCmdlineValue(':');
    screen.program.showCursor();
    cmdline.focus();
    readCmdline();
    setMessage('');
    paint();
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
    // Keep reading for the next line
    readCmdline();
  }

  async function submitEx(rawValue) {
    let raw = rawValue ?? cmdline.getValue();
    if (raw.startsWith(':')) raw = raw.slice(1);
    const result = await runExCommand(state, raw, api);
    setMessage(result.message || '');
    const name = raw.trim();
    if (result.ok && (name === 'w' || name === 'write')) {
      enterCommandMode();
      return;
    }
    // After failed or quit-bound commands, return to command (quit exits process)
    enterCommandMode();
    if (result.message) setMessage(result.message);
  }

  /**
   * neo-blessed textbox.readInput captures keys until submit/cancel.
   * We re-enter it for insert (after each Enter) and for ex.
   */
  function readCmdline() {
    if (state.mode !== 'insert' && state.mode !== 'ex') return;

    cmdline.readInput((err, value) => {
      // escape / cancel yields (null, null); Enter yields (null, string)
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

  // Live sync while typing in insert/ex (keypress bubbles during readInput)
  cmdline.on('keypress', (ch, key) => {
    if (state._suppressCmdKeys) return;
    if (!key) return;

    const toggle = modeFromBlessedKey(key.full);
    if (toggle === 'command') {
      try {
        cmdline.cancel();
      } catch {
        /* ignore */
      }
      enterCommandMode();
      return;
    }
    if (toggle === 'insert' && state.mode !== 'insert') {
      try {
        cmdline.cancel();
      } catch {
        /* ignore */
      }
      enterInsertMode();
      return;
    }

    if (key.full === 'escape') {
      try {
        cmdline.cancel();
      } catch {
        /* ignore */
      }
      enterCommandMode();
      return;
    }

    if (state.mode === 'ex') {
      // Defer to next tick so textbox value has updated
      setImmediate(() => {
        if (state.mode !== 'ex') return;
        let v = cmdline.getValue();
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

  // Listen on both screen and code — Cursor / Windows terminals often
  // deliver keys only to the focused widget.
  screen.on('keypress', onCommandKeys);
  code.on('keypress', onCommandKeys);

  function bindGlobal(keys, fn) {
    screen.key(keys, fn);
    code.key(keys, fn);
  }

  // Ctrl+Arrow can be swallowed by some terminals; also offer C-k / C-j.
  bindGlobal(['C-up', 'C-k'], () => {
    try {
      if (cmdline._reading) cmdline.cancel();
    } catch {
      /* ignore */
    }
    enterCommandMode();
  });
  bindGlobal(['C-down', 'C-j'], () => {
    try {
      if (cmdline._reading) cmdline.cancel();
    } catch {
      /* ignore */
    }
    enterInsertMode();
  });

  bindGlobal(['C-c'], () => {
    api.quit();
  });

  // Explicit command bindings (more reliable than keypress alone on Windows)
  const commandChars = [
    'h', 'j', 'k', 'l', 'i', ':',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  ];
  for (const ch of commandChars) {
    bindGlobal([ch], () => {
      if (state.mode !== 'command') return;
      onCommandKeys(ch, { name: ch, full: ch });
    });
  }

  enterCommandMode();
  if (!exists) setMessage('New file (not on disk yet)');
  paint();
}

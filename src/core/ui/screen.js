import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const blessed = require('neo-blessed');
const childProcess = require('child_process');

const RESTORE_TERM = '\x1b[?25h\x1b[?1049l\x1b[0m';

/**
 * neo-blessed's Windows enter/leave runs `cls`, which wipes the original
 * scrollback *before* smcup and *after* rmcup. Skip it so the alternate
 * screen can actually save and restore the user's terminal.
 */
function suppressBlessedWindowsCls() {
  if (childProcess.execSync.__seesawimSkipCls) return;
  const orig = childProcess.execSync;
  function patched(command, ...rest) {
    if (typeof command === 'string' && command.trim() === 'cls') {
      return Buffer.alloc(0);
    }
    return orig.call(this, command, ...rest);
  }
  patched.__seesawimSkipCls = true;
  childProcess.execSync = patched;
}

function pickTerminal() {
  const envTerm = process.env.TERM || '';
  if (
    process.platform === 'win32' ||
    !envTerm ||
    envTerm === 'dumb' ||
    envTerm === 'windows-ansi'
  ) {
    return 'xterm-256color';
  }
  return envTerm;
}

/**
 * Flat TUI layout — no nested textbox (avoids Windows cursor bugs).
 * Bottom “box” is three plain rows: top rule, "> input", bottom rule.
 * Code pane is not scrollable — the renderer paints only the viewport.
 */
export function createUi() {
  suppressBlessedWindowsCls();

  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    forceUnicode: true,
    terminal: pickTerminal(),
    ignoreLocked: ['C-c', 'C-up', 'C-down', 'C-k', 'C-j', 'escape'],
    title: 'Seesawim',
    input: process.stdin,
    output: process.stdout,
  });

  const title = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    wrap: false,
    style: { fg: 'white', bg: 'black' },
  });

  // title(1) + status(1) + frame(3) = 5
  const code = blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    width: '100%',
    height: '100%-5',
    tags: true,
    wrap: false,
    scrollable: false,
    keys: false,
    keyable: false,
    mouse: false,
    style: { fg: 'white', bg: 'black' },
  });

  const status = blessed.box({
    parent: screen,
    bottom: 3,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    wrap: false,
    style: { fg: 'white', bg: 'black' },
  });

  const ruleTop = blessed.box({
    parent: screen,
    bottom: 2,
    left: 0,
    width: '100%',
    height: 1,
    tags: false,
    wrap: false,
    style: { fg: 'white', bg: 'black' },
  });

  const inputRow = blessed.box({
    parent: screen,
    bottom: 1,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    wrap: false,
    keys: true,
    keyable: true,
    style: { fg: 'white', bg: 'black' },
  });

  const ruleBottom = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: false,
    wrap: false,
    style: { fg: 'white', bg: 'black' },
  });

  return { screen, title, code, status, ruleTop, inputRow, ruleBottom, blessed };
}

/** Move the real terminal cursor onto the input caret after a render. */
export function placeCursor(screen, inputRow, col) {
  const program = screen.program;
  const lpos = inputRow.lpos;
  const row =
    lpos && typeof lpos.yi === 'number'
      ? lpos.yi
      : Math.max(0, (screen.height || 1) - 2);
  const left = lpos && typeof lpos.xi === 'number' ? lpos.xi : 0;
  const maxCol = Math.max(0, (screen.width || 1) - 1);
  const maxRow = Math.max(0, (screen.height || 1) - 1);
  const x = Math.max(0, Math.min(left + col, maxCol));
  const y = Math.max(0, Math.min(row, maxRow));
  program.cup(y, x);
  program.showCursor();
  program.flush();
}

export function hideRealCursor(screen, flush = true) {
  try {
    screen.program.hideCursor();
    if (flush) screen.program.flush();
  } catch {
    /* ignore */
  }
}

/** Leave the alternate screen and show the cursor, even if blessed fails. */
export function restoreTerminal(screen) {
  try {
    if (screen && screen.program && !screen.destroyed) {
      screen.program.showCursor();
      screen.program.normalBuffer();
      screen.program.flush();
    }
  } catch {
    /* ignore */
  }
  try {
    if (process.stdout && process.stdout.writable) {
      process.stdout.write(RESTORE_TERM);
    }
  } catch {
    /* ignore */
  }
}

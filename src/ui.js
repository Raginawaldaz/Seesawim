import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const blessed = require('neo-blessed');
const childProcess = require('child_process');

const RESTORE_TERM = '\x1b[?25h\x1b[?1049l\x1b[0m';
const PROMPT_WIDTH = 2; // "> "

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
    scrollable: true,
    alwaysScroll: true,
    // Not keyable — focusing the code pane parks the real cursor mid-screen
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

export function escapeTags(text) {
  return String(text).replace(/[{}]/g, (ch) => `{'${ch}'}`);
}

export function displayWidth(text) {
  return blessed.unicode.strWidth(String(text ?? ''));
}

/** Slice `str` by terminal display columns (CJK = 2). */
export function sliceDisplay(str, startCol, maxWidth) {
  const s = String(str ?? '');
  const start = Math.max(0, startCol || 0);
  const limit = Math.max(0, maxWidth || 0);
  if (!s || limit === 0) return '';

  let col = 0;
  let out = '';
  let taken = 0;
  for (let i = 0; i < s.length; ) {
    const w = Math.max(0, blessed.unicode.charWidth(s, i) || 0);
    const sur = blessed.unicode.isSurrogate(s, i);
    const ch = s.slice(i, i + (sur ? 2 : 1));
    i += sur ? 2 : 1;

    if (col + w <= start) {
      col += w;
      continue;
    }
    if (col < start) {
      col += w;
      continue;
    }
    if (taken + w > limit) break;
    out += ch;
    taken += w;
    col += w;
  }
  return out;
}

function ruleLine(width) {
  const w = Math.max(1, width || 40);
  return '-'.repeat(w);
}

export function renderCode(codeBox, lines, cursor) {
  const row = cursor.row;
  const gutterWidth = Math.max(3, String(Math.max(lines.length, 1)).length + 1);
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const num = String(i + 1).padStart(gutterWidth, ' ');
    const isCurrent = i === row;
    const marker = isCurrent ? '>' : ' ';
    const body = escapeTags(line) || ' ';

    if (isCurrent) {
      out.push(`{white-fg}${num}{/white-fg} {bold}>{/bold} ${body}`);
    } else {
      out.push(`{grey-fg}${num}{/grey-fg} ${marker} ${body}`);
    }
  }

  codeBox.setContent(out.join('\n') || ' ');
  const height = codeBox.lpos?.height || codeBox.height || 20;
  const viewH = Math.max(1, typeof height === 'number' ? height : 20);
  codeBox.setScroll(Math.max(0, row - Math.floor(viewH / 2)));
}

export function renderTitle(titleBox, filePath, dirty) {
  // ASCII dirty mark only — Unicode ● breaks column math on Windows consoles
  const mark = dirty ? ' *' : '';
  const pathText = escapeTags(filePath || '(untitled)');
  titleBox.setContent(` Seesawim  ${pathText}${mark}`);
}

export function renderStatus(statusBox, state) {
  const modeNames = { command: 'COMMAND', insert: 'INSERT', ex: 'EX' };
  const mode = modeNames[state.mode] || state.mode.toUpperCase();
  const pos = `${state.cursor.row + 1}:${state.cursor.col + 1}`;
  const count = state.countPrefix ? `  x${state.countPrefix}` : '';
  const kind = state.messageKind || 'info';
  let msg = '';
  if (state.message) {
    const color = kind === 'error' ? 'red' : 'white';
    msg = `  {${color}-fg}${escapeTags(state.message)}{/${color}-fg}`;
  }
  statusBox.style.fg = 'white';
  statusBox.style.bg = 'black';
  statusBox.setContent(` {inverse} ${mode} {/inverse}  ${pos}${count}${msg}`);
}

/**
 * Draw the framed input row. Returns where the real cursor should sit.
 * Border: white while inserting text; red in command/ex as a reminder.
 * @param {object} parts
 * @param {string} text
 * @param {number} caretCol
 * @param {'command'|'insert'|'ex'} mode
 * @param {object} [state]
 * @returns {{ cursorVisible: boolean, cursorCol: number }}
 */
export function renderInput(parts, text, caretCol, mode, state) {
  const { ruleTop, inputRow, ruleBottom, screen } = parts;
  const width = screen.width || 80;
  const typingText = mode === 'insert';
  const borderFg = typingText ? 'white' : 'red';
  const prompt = typingText ? '>' : '{red-fg}>{/red-fg}';

  ruleTop.setContent(ruleLine(width));
  ruleTop.style.fg = borderFg;
  ruleBottom.setContent(ruleLine(width));
  ruleBottom.style.fg = borderFg;

  if (mode === 'command') {
    if (state) state.inputHScroll = 0;
    inputRow.setContent(`${prompt} `);
    return { cursorVisible: false, cursorCol: 0 };
  }

  const value = String(text ?? '');
  const col = Math.max(0, Math.min(caretCol ?? value.length, value.length));
  const avail = Math.max(1, width - PROMPT_WIDTH);
  const caretW = displayWidth(value.slice(0, col));

  let hscroll = state && Number.isFinite(state.inputHScroll) ? state.inputHScroll : 0;
  if (caretW < hscroll) hscroll = caretW;
  if (caretW - hscroll >= avail) hscroll = caretW - avail + 1;
  if (hscroll < 0) hscroll = 0;
  if (state) state.inputHScroll = hscroll;

  const visible = sliceDisplay(value, hscroll, avail);
  inputRow.setContent(`${prompt} ${escapeTags(visible)}`);

  return {
    cursorVisible: true,
    cursorCol: PROMPT_WIDTH + (caretW - hscroll),
  };
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

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const blessed = require('neo-blessed');

/**
 * Flat TUI layout — no nested textbox (avoids Windows cursor bugs).
 * Bottom “box” is three plain rows: top rule, "> input", bottom rule.
 */
export function createUi() {
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    ignoreLocked: ['C-c', 'C-up', 'C-down', 'C-k', 'C-j', 'escape'],
    title: 'Seesawim',
    input: process.stdin,
    output: process.stdout,
  });

  // Hide the real terminal cursor; we draw our own block in the input row.
  screen.program.hideCursor();
  screen.on('render', () => {
    try {
      screen.program.hideCursor();
    } catch {
      /* ignore */
    }
  });

  const title = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
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
    style: { fg: 'grey', bg: 'black' },
  });

  const ruleTop = blessed.box({
    parent: screen,
    bottom: 2,
    left: 0,
    width: '100%',
    height: 1,
    tags: false,
    style: { fg: 'white', bg: 'black' },
  });

  const inputRow = blessed.box({
    parent: screen,
    bottom: 1,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
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
    style: { fg: 'white', bg: 'black' },
  });

  return { screen, title, code, status, ruleTop, inputRow, ruleBottom, blessed };
}

export function escapeTags(text) {
  return String(text).replace(/[{}]/g, (ch) => `{'${ch}'}`);
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
  const count = state.countPrefix ? ` x${state.countPrefix}` : '';
  const msg = state.message ? `  ${escapeTags(state.message)}` : '';
  statusBox.setContent(` ${mode}  ${pos}${count}${msg}`);
}

/**
 * Draw the framed input row:  > text█
 * Border: white while inserting text; red in command/ex as a reminder.
 * @param {object} parts
 * @param {string} text
 * @param {number} caretCol
 * @param {'command'|'insert'|'ex'} mode
 */
export function renderInput(parts, text, caretCol, mode) {
  const { ruleTop, inputRow, ruleBottom, screen } = parts;
  const width = screen.width || 80;
  // White only while typing buffer text (insert).
  // Red otherwise — reminds you you're in command / ex, not editing.
  const typingText = mode === 'insert';
  const borderFg = typingText ? 'white' : 'red';
  const prompt = typingText ? '>' : '{red-fg}>{/red-fg}';

  ruleTop.setContent(ruleLine(width));
  ruleTop.style.fg = borderFg;
  ruleBottom.setContent(ruleLine(width));
  ruleBottom.style.fg = borderFg;

  const value = String(text ?? '');
  const col = Math.max(0, Math.min(caretCol ?? value.length, value.length));
  const before = escapeTags(value.slice(0, col));
  const at = value.slice(col, col + 1);
  const after = escapeTags(value.slice(col + 1));
  const showCaret = mode === 'insert' || mode === 'ex';
  const caret = showCaret
    ? `{inverse}${at ? escapeTags(at) : ' '}{/inverse}`
    : '';

  if (mode === 'insert' || mode === 'ex') {
    inputRow.setContent(`${prompt} ${before}${caret}${after}`);
  } else {
    inputRow.setContent(`${prompt} `);
  }
}

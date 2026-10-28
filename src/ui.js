import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const blessed = require('neo-blessed');

/**
 * Build the Seesawim TUI layout.
 * @returns {{ screen, title, code, status, cmdline, blessed }}
 */
export function createUi() {
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    forceUnicode: true,
    ignoreLocked: true,
    dockBorders: true,
    title: 'Seesawim',
    input: process.stdin,
    output: process.stdout,
    cursor: {
      artificial: true,
      shape: 'line',
      blink: true,
      color: null,
    },
  });

  const title = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: {
      fg: 'cyan',
      bg: 'black',
    },
  });

  const code = blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    width: '100%',
    height: '100%-3',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    keyable: true,
    mouse: true,
    focusable: true,
    scrollbar: {
      ch: ' ',
      track: { bg: 'grey' },
      style: { inverse: true },
    },
    style: {
      fg: 'white',
      bg: 'black',
    },
  });

  const status = blessed.box({
    parent: screen,
    bottom: 1,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: {
      fg: 'black',
      bg: 'blue',
    },
  });

  const cmdline = blessed.textbox({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    inputOnFocus: false,
    keys: true,
    mouse: true,
    style: {
      fg: 'white',
      bg: 'black',
    },
  });

  return { screen, title, code, status, cmdline, blessed };
}

/** Escape blessed tag-sensitive braces in plain text. */
export function escapeTags(text) {
  return String(text).replace(/[{}]/g, (ch) => `{'${ch}'}`);
}

/**
 * Render line buffer into the code box with gutter + current-line highlight.
 */
export function renderCode(codeBox, lines, cursor, { showCaret = false } = {}) {
  const row = cursor.row;
  const gutterWidth = Math.max(3, String(lines.length).length + 1);
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const num = String(i + 1).padStart(gutterWidth, ' ');
    const isCurrent = i === row;

    let body = escapeTags(line);
    if (isCurrent && showCaret) {
      const col = Math.min(cursor.col, line.length);
      const before = escapeTags(line.slice(0, col));
      const at = line.slice(col, col + 1);
      const after = escapeTags(line.slice(col + 1));
      const caretChar = at ? escapeTags(at) : ' ';
      body = `${before}{inverse}${caretChar}{/inverse}${after}`;
    }

    if (isCurrent) {
      out.push(`{cyan-fg}${num}{/cyan-fg} {blue-bg}{white-fg}${body || ' '}{/white-fg}{/blue-bg}`);
    } else {
      out.push(`{grey-fg}${num}{/grey-fg} ${body}`);
    }
  }

  codeBox.setContent(out.join('\n') || ' ');
  const visible = Math.max(1, codeBox.height - (codeBox.iheight - codeBox.height || 0));
  const height = typeof codeBox.height === 'number' ? codeBox.height : codeBox.lpos?.height || 20;
  const viewH = Math.max(1, height);
  const target = Math.max(0, row - Math.floor(viewH / 2));
  codeBox.setScroll(target);
}

export function renderTitle(titleBox, filePath, dirty) {
  const mark = dirty ? ' {red-fg}●{/red-fg}' : '';
  titleBox.setContent(` {bold}{cyan-fg}Seesawim{/cyan-fg}{/bold}  ${escapeTags(filePath || '(untitled)')}${mark}`);
}

export function renderStatus(statusBox, state) {
  const modeNames = { command: 'COMMAND', insert: 'INSERT', ex: 'EX' };
  const mode = modeNames[state.mode] || state.mode.toUpperCase();
  const pos = `${state.cursor.row + 1}:${state.cursor.col + 1}`;
  const count = state.countPrefix ? ` ×${state.countPrefix}` : '';
  const msg = state.message ? `  ${escapeTags(state.message)}` : '';
  statusBox.setContent(` ${mode}  ${pos}${count}${msg}`);
}

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const blessed = require('neo-blessed');

/**
 * Build the Seesawim TUI layout.
 * Bottom input is a bordered frame with a `>` prompt (no blue fill).
 * @returns {{ screen, title, code, status, inputFrame, prompt, cmdline, blessed }}
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

  // title(1) + status(1) + input frame(3) = 5
  const code = blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    width: '100%',
    height: '100%-5',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    keyable: true,
    mouse: true,
    focusable: true,
    scrollbar: {
      ch: '│',
      style: { fg: 'grey' },
    },
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

  const inputFrame = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    tags: false,
    border: {
      type: 'line',
    },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'white' },
    },
  });

  const prompt = blessed.box({
    parent: inputFrame,
    top: 0,
    left: 0,
    width: 2,
    height: 1,
    content: '>',
    style: { fg: 'white', bg: 'black' },
  });

  const cmdline = blessed.textbox({
    parent: inputFrame,
    top: 0,
    left: 2,
    width: '100%-2',
    height: 1,
    inputOnFocus: false,
    keys: true,
    mouse: true,
    style: {
      fg: 'white',
      bg: 'black',
    },
  });

  return { screen, title, code, status, inputFrame, prompt, cmdline, blessed };
}

/** Escape blessed tag-sensitive braces in plain text. */
export function escapeTags(text) {
  return String(text).replace(/[{}]/g, (ch) => `{'${ch}'}`);
}

/**
 * Render buffer. Current line uses a `>` marker — no blue background.
 */
export function renderCode(codeBox, lines, cursor, { showCaret = false } = {}) {
  const row = cursor.row;
  const gutterWidth = Math.max(3, String(lines.length).length + 1);
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const num = String(i + 1).padStart(gutterWidth, ' ');
    const isCurrent = i === row;
    const marker = isCurrent ? '>' : ' ';

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
      out.push(`{white-fg}${num}{/white-fg} {bold}{white-fg}${marker}{/white-fg}{/bold} ${body || ' '}`);
    } else {
      out.push(`{grey-fg}${num}{/grey-fg} ${marker} ${body}`);
    }
  }

  codeBox.setContent(out.join('\n') || ' ');
  const height = typeof codeBox.height === 'number' ? codeBox.height : codeBox.lpos?.height || 20;
  const viewH = Math.max(1, height);
  const target = Math.max(0, row - Math.floor(viewH / 2));
  codeBox.setScroll(target);
}

export function renderTitle(titleBox, filePath, dirty) {
  const mark = dirty ? ' {red-fg}●{/red-fg}' : '';
  titleBox.setContent(
    ` {bold}Seesawim{/bold}  {grey-fg}${escapeTags(filePath || '(untitled)')}{/grey-fg}${mark}`
  );
}

export function renderStatus(statusBox, state) {
  const modeNames = { command: 'COMMAND', insert: 'INSERT', ex: 'EX' };
  const mode = modeNames[state.mode] || state.mode.toUpperCase();
  const pos = `${state.cursor.row + 1}:${state.cursor.col + 1}`;
  const count = state.countPrefix ? ` ×${state.countPrefix}` : '';
  const msg = state.message ? `  ${escapeTags(state.message)}` : '';
  statusBox.setContent(` ${mode}  ${pos}${count}${msg}`);
}

/** Show / hide the block caret feel on the framed input. */
export function setInputActive(inputFrame, active) {
  inputFrame.style.border = { fg: active ? 'white' : 'grey' };
}

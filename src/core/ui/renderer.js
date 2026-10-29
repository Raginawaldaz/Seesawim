import { escapeTags, displayWidth, sliceDisplay } from './text.js';
import { placeCursor, hideRealCursor } from './screen.js';

const PROMPT_WIDTH = 2; // "> "

function ruleLine(width) {
  const w = Math.max(1, width || 40);
  return '-'.repeat(w);
}

/**
 * Viewport + dirty-region renderer with paint coalescing.
 * @param {object} ui
 * @param {() => object} getState - returns current editor state
 * @param {{ gutters: Function[], lineDecorators: Function[] }} hooks
 */
export function createRenderer(ui, getState, hooks) {
  const { screen, title, code, status, ruleTop, inputRow, ruleBottom } = ui;
  const inputParts = { ruleTop, inputRow, ruleBottom, screen };

  const cache = {
    titleKey: null,
    statusKey: null,
    inputKey: null,
    codeKey: null,
  };

  let paintScheduled = false;
  let lastCaret = null;
  let shuttingDown = false;

  function setShuttingDown(v) {
    shuttingDown = !!v;
  }

  function renderTitle(state) {
    const mark = state.dirty ? ' *' : '';
    const pathText = escapeTags(state.filePath || '(untitled)');
    const content = ` Seesawim  ${pathText}${mark}`;
    const key = content;
    if (key === cache.titleKey) return;
    cache.titleKey = key;
    title.setContent(content);
  }

  function renderStatus(state) {
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
    const content = ` {inverse} ${mode} {/inverse}  ${pos}${count}${msg}`;
    const key = content;
    if (key === cache.statusKey) return;
    cache.statusKey = key;
    status.style.fg = 'white';
    status.style.bg = 'black';
    status.setContent(content);
  }

  function renderInput(state) {
    const mode = state.mode;
    const text = mode === 'command' ? '' : state.inputText;
    const caretCol = state.inputCol;
    const width = screen.width || 80;
    const typingText = mode === 'insert';
    const borderFg = typingText ? 'white' : 'red';
    const prompt = typingText ? '>' : '{red-fg}>{/red-fg}';

    const inputKey = `${mode}|${text}|${caretCol}|${state.inputHScroll}|${width}|${borderFg}`;
    if (inputKey === cache.inputKey) {
      return lastCaret;
    }
    cache.inputKey = inputKey;

    ruleTop.setContent(ruleLine(width));
    ruleTop.style.fg = borderFg;
    ruleBottom.setContent(ruleLine(width));
    ruleBottom.style.fg = borderFg;

    if (mode === 'command') {
      state.inputHScroll = 0;
      inputRow.setContent(`${prompt} `);
      lastCaret = { cursorVisible: false, cursorCol: 0 };
      return lastCaret;
    }

    const value = String(text ?? '');
    const col = Math.max(0, Math.min(caretCol ?? value.length, value.length));
    const avail = Math.max(1, width - PROMPT_WIDTH);
    const caretW = displayWidth(value.slice(0, col));

    let hscroll = Number.isFinite(state.inputHScroll) ? state.inputHScroll : 0;
    if (caretW < hscroll) hscroll = caretW;
    if (caretW - hscroll >= avail) hscroll = caretW - avail + 1;
    if (hscroll < 0) hscroll = 0;
    state.inputHScroll = hscroll;

    const visible = sliceDisplay(value, hscroll, avail);
    inputRow.setContent(`${prompt} ${escapeTags(visible)}`);

    lastCaret = {
      cursorVisible: true,
      cursorCol: PROMPT_WIDTH + (caretW - hscroll),
    };
    return lastCaret;
  }

  function stripTags(s) {
    return String(s ?? '').replace(/\{[^}]*\}/g, '');
  }

  function guttersFor(row) {
    const parts = [];
    for (const fn of hooks.gutters) {
      try {
        const t = fn(row);
        if (t != null && t !== '') parts.push(String(t));
      } catch {
        /* ignore */
      }
    }
    return parts.join('');
  }

  function decorateBody(row, body) {
    let out = body;
    for (const fn of hooks.lineDecorators) {
      try {
        out = fn(row, out);
      } catch {
        /* ignore */
      }
    }
    return out;
  }

  function renderCode(state) {
    const buffer = state.buffer;
    const cursor = state.cursor;
    const height = code.lpos?.height || code.height || 20;
    const viewH = Math.max(1, typeof height === 'number' ? height : 20);
    const width = screen.width || 80;
    const lineCount = buffer.lineCount;
    const maxTop = Math.max(0, lineCount - viewH);
    let top = Math.max(0, cursor.row - Math.floor(viewH / 2));
    if (top > maxTop) top = maxTop;

    const gutterSample = guttersFor(Math.max(0, lineCount - 1));
    // Tags like {grey-fg} must not count toward display columns
    const gutterW = displayWidth(stripTags(gutterSample));
    const bodyWidth = Math.max(1, width - gutterW);

    const key = [
      buffer.version,
      cursor.row,
      top,
      viewH,
      width,
      state.mode,
      hooks.gutters.length,
      hooks.lineDecorators.length,
    ].join('|');
    if (key === cache.codeKey) return;
    cache.codeKey = key;

    const out = [];
    const end = Math.min(lineCount, top + viewH);
    for (let i = top; i < end; i++) {
      const line = buffer.getLine(i) ?? '';
      const gutter = guttersFor(i);
      const clipped = sliceDisplay(line, 0, bodyWidth);
      const escaped = escapeTags(clipped) || ' ';
      const body = decorateBody(i, escaped);
      out.push(`${gutter}${body}`);
    }
    // Pad remaining viewport rows so leftover content does not linger
    while (out.length < viewH) out.push(' ');

    code.setContent(out.join('\n') || ' ');
  }

  function paintNow() {
    if (shuttingDown) return;
    const state = getState();
    renderTitle(state);
    renderCode(state);
    renderStatus(state);
    const caret = renderInput(state);
    hideRealCursor(screen, false);
    screen.render();
    if (caret && caret.cursorVisible) {
      placeCursor(screen, inputRow, caret.cursorCol);
    } else {
      hideRealCursor(screen);
    }
  }

  function requestPaint() {
    if (shuttingDown) return;
    if (paintScheduled) return;
    paintScheduled = true;
    setImmediate(() => {
      paintScheduled = false;
      if (!shuttingDown) paintNow();
    });
  }

  /** Force an immediate paint (e.g. before quit messages). */
  function paintSync() {
    paintScheduled = false;
    paintNow();
  }

  function invalidate() {
    cache.titleKey = null;
    cache.statusKey = null;
    cache.inputKey = null;
    cache.codeKey = null;
  }

  return {
    requestPaint,
    paintSync,
    invalidate,
    setShuttingDown,
    inputParts,
  };
}

import path from 'path';
import { moveHorizontal, moveVertical } from './cursor.js';

/**
 * Parse and apply a single command-mode keystroke.
 * Returns { handled, enterInsert, enterEx, message }.
 */
export function handleCommandKey(state, key) {
  const result = {
    handled: false,
    enterInsert: false,
    enterEx: false,
    message: null,
  };

  if (key >= '1' && key <= '9') {
    state.countPrefix += key;
    result.handled = true;
    return result;
  }
  if (key === '0' && state.countPrefix) {
    state.countPrefix += '0';
    result.handled = true;
    return result;
  }

  const count = state.countPrefix ? Math.max(1, parseInt(state.countPrefix, 10) || 1) : 1;

  if (key === 'h' || key === 'l' || key === 'j' || key === 'k') {
    for (let i = 0; i < count; i++) {
      if (key === 'h') state.cursor = moveHorizontal(state.cursor, state.lines, -1);
      else if (key === 'l') state.cursor = moveHorizontal(state.cursor, state.lines, 1);
      else if (key === 'j') state.cursor = moveVertical(state.cursor, state.lines, 1);
      else if (key === 'k') state.cursor = moveVertical(state.cursor, state.lines, -1);
    }
    state.countPrefix = '';
    result.handled = true;
    return result;
  }

  if (key === 'i') {
    state.countPrefix = '';
    result.handled = true;
    result.enterInsert = true;
    return result;
  }

  if (key === ':') {
    state.countPrefix = '';
    result.handled = true;
    result.enterEx = true;
    return result;
  }

  if (state.countPrefix) {
    state.countPrefix = '';
    result.handled = true;
    result.message = '';
  }
  return result;
}

function stripQuotes(s) {
  const t = String(s || '').trim();
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function formatWritten(stats) {
  return `"${stats.path}" ${stats.lines}L, ${stats.bytes}B written`;
}

/** Execute an ex command string like "w", "q", "wq" (without leading colon). */
export async function runExCommand(state, cmd, api) {
  const raw = String(cmd || '').trim();
  if (!raw) return { ok: true, message: '' };

  const m = /^(write|wq|quit|xit|x|w|q)(!?)(?:\s+(.*))?$/i.exec(raw);
  if (!m) {
    return { ok: false, message: `E492: Not an editor command: ${raw}` };
  }

  const name = m[1].toLowerCase();
  const bang = m[2] === '!';
  const arg = stripQuotes(m[3] || '');

  const isWrite = name === 'w' || name === 'write';
  const isQuit = name === 'q' || name === 'quit';
  const isWq = name === 'wq';
  const isX = name === 'x' || name === 'xit';

  if (isWrite) {
    const stats = await api.save(arg || undefined);
    return { ok: true, message: formatWritten(stats) };
  }

  if (isQuit) {
    if (arg) {
      return { ok: false, message: 'E488: Trailing characters' };
    }
    if (state.dirty && !bang) {
      return {
        ok: false,
        message: 'E37: No write since last change (add ! to override)',
      };
    }
    await api.quit();
    return { ok: true, quit: true };
  }

  if (isWq) {
    await api.save(arg || undefined);
    await api.quit();
    return { ok: true, quit: true };
  }

  if (isX) {
    if (state.dirty || arg) {
      await api.save(arg || undefined);
    }
    await api.quit();
    return { ok: true, quit: true };
  }

  return { ok: false, message: `E492: Not an editor command: ${raw}` };
}

export function resolveSavePath(currentPath, fileArg) {
  if (!fileArg) return currentPath;
  return path.resolve(fileArg);
}

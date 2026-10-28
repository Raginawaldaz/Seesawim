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

/** Execute an ex command string like "w", "q", "wq" (without leading colon). */
export async function runExCommand(state, cmd, api) {
  const name = String(cmd || '').trim();
  if (!name) return { ok: true, message: '' };

  if (name === 'w' || name === 'write') {
    await api.save();
    return { ok: true, message: `"${state.filePath}" written` };
  }

  if (name === 'q' || name === 'quit') {
    if (state.dirty) {
      return { ok: false, message: 'No write since last change (:wq to save & quit)' };
    }
    await api.quit();
    return { ok: true, message: 'Quitting…' };
  }

  if (name === 'wq' || name === 'x') {
    await api.save();
    await api.quit();
    return { ok: true, message: 'Saved & quitting…' };
  }

  if (name === 'q!' || name === 'quit!') {
    await api.quit();
    return { ok: true, message: 'Quitting…' };
  }

  return { ok: false, message: `Not an editor command: ${name}` };
}

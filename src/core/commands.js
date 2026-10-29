import { moveHorizontal, moveVertical } from './cursor.js';

/** Read and clear the count prefix; default 1 when empty or extension disabled. */
export function takeCount(state) {
  const raw = state.countPrefix;
  state.countPrefix = '';
  if (!raw) return 1;
  return Math.max(1, parseInt(raw, 10) || 1);
}

/**
 * Parse and apply a single command-mode keystroke (core motions + i / :).
 * Count digits are handled by the count extension when enabled.
 * Returns { handled, enterInsert, enterEx, message }.
 */
export function handleCommandKey(state, key) {
  const result = {
    handled: false,
    enterInsert: false,
    enterEx: false,
    message: null,
  };

  const count = takeCount(state);

  if (key === 'h' || key === 'l' || key === 'j' || key === 'k') {
    for (let i = 0; i < count; i++) {
      if (key === 'h') state.cursor = moveHorizontal(state.cursor, state.buffer, -1);
      else if (key === 'l') state.cursor = moveHorizontal(state.cursor, state.buffer, 1);
      else if (key === 'j') state.cursor = moveVertical(state.cursor, state.buffer, 1);
      else if (key === 'k') state.cursor = moveVertical(state.cursor, state.buffer, -1);
    }
    result.handled = true;
    return result;
  }

  if (key === 'i') {
    result.handled = true;
    result.enterInsert = true;
    return result;
  }

  if (key === ':') {
    result.handled = true;
    result.enterEx = true;
    return result;
  }

  // Unknown key after a count prefix: drop the prefix (Vim-like)
  if (state.countPrefix) {
    state.countPrefix = '';
    result.handled = true;
    result.message = '';
  }
  return result;
}

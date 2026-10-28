/**
 * Blessed / neo-blessed key routing helpers.
 */

/** @returns {'command'|'insert'|null} */
export function modeFromBlessedKey(full) {
  if (full === 'C-up') return 'command';
  if (full === 'C-down') return 'insert';
  return null;
}

/** Normalize blessed ch/key into a single character or name for command mode. */
export function commandKeyFromBlessed(ch, key) {
  if (key && key.full && (key.ctrl || key.meta || key.name === 'escape')) {
    return null;
  }
  if (ch && ch.length === 1) return ch;
  if (key && key.name && key.name.length === 1) return key.name;
  return null;
}

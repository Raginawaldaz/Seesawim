import undo from './undo/index.js';
import count from './count/index.js';
import lineNumbers from './lineNumbers/index.js';
import cursorLine from './cursorLine/index.js';
import autoClearMessage from './autoClearMessage/index.js';

/** Ordered registry of all known extensions. */
export const allExtensions = [
  count,
  lineNumbers,
  cursorLine,
  autoClearMessage,
  undo,
];

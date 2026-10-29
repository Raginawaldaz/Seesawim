import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const blessed = require('neo-blessed');

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

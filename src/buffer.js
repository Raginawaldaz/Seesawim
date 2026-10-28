/** Line-based text buffer helpers. */

export function splitContent(content) {
  if (content == null || content === '') return [''];
  const normalized = String(content).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  return lines.length ? lines : [''];
}

export function joinLines(lines) {
  return (lines && lines.length ? lines : ['']).join('\n');
}

export function ensureLine(lines, row) {
  while (lines.length <= row) lines.push('');
  return lines;
}

export function getLine(lines, row) {
  if (!lines.length) return '';
  const r = Math.max(0, Math.min(row, lines.length - 1));
  return lines[r] ?? '';
}

export function setLine(lines, row, text) {
  ensureLine(lines, row);
  lines[row] = text;
  return lines;
}

/** After finishing a line in insert mode: advance, insert blank if past end. */
export function advanceAfterEnter(lines, row) {
  const next = row + 1;
  if (next >= lines.length) {
    lines.push('');
  }
  return next;
}

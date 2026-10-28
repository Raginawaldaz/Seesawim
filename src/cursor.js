/** Cursor position with clamping against a line buffer. */

export function createCursor(row = 0, col = 0) {
  return { row, col };
}

export function clampCursor(cursor, lines) {
  const maxRow = Math.max(0, (lines?.length || 1) - 1);
  const row = Math.max(0, Math.min(cursor.row, maxRow));
  const lineLen = (lines[row] ?? '').length;
  const col = Math.max(0, Math.min(cursor.col, Math.max(0, lineLen)));
  return { row, col };
}

export function moveBy(cursor, lines, dRow, dCol) {
  let { row, col } = cursor;
  row += dRow;
  col += dCol;
  return clampCursor({ row, col }, lines);
}

export function moveVertical(cursor, lines, delta) {
  const maxRow = Math.max(0, (lines?.length || 1) - 1);
  const row = Math.max(0, Math.min(cursor.row + delta, maxRow));
  const lineLen = (lines[row] ?? '').length;
  const col = Math.max(0, Math.min(cursor.col, Math.max(0, lineLen)));
  return { row, col };
}

export function moveHorizontal(cursor, lines, delta) {
  const row = Math.max(0, Math.min(cursor.row, Math.max(0, lines.length - 1)));
  const lineLen = (lines[row] ?? '').length;
  const col = Math.max(0, Math.min(cursor.col + delta, Math.max(0, lineLen)));
  return { row, col };
}

/** Cursor position with clamping against a TextBuffer. */

export function createCursor(row = 0, col = 0) {
  return { row, col };
}

/**
 * @param {{row:number,col:number}} cursor
 * @param {{ lineCount: number, getLine: (i:number) => string }} buffer
 */
export function clampCursor(cursor, buffer) {
  const maxRow = Math.max(0, (buffer?.lineCount || 1) - 1);
  const row = Math.max(0, Math.min(cursor.row, maxRow));
  const lineLen = (buffer.getLine(row) ?? '').length;
  const col = Math.max(0, Math.min(cursor.col, Math.max(0, lineLen)));
  return { row, col };
}

export function moveBy(cursor, buffer, dRow, dCol) {
  let { row, col } = cursor;
  row += dRow;
  col += dCol;
  return clampCursor({ row, col }, buffer);
}

export function moveVertical(cursor, buffer, delta) {
  const maxRow = Math.max(0, (buffer?.lineCount || 1) - 1);
  const row = Math.max(0, Math.min(cursor.row + delta, maxRow));
  const lineLen = (buffer.getLine(row) ?? '').length;
  const col = Math.max(0, Math.min(cursor.col, Math.max(0, lineLen)));
  return { row, col };
}

export function moveHorizontal(cursor, buffer, delta) {
  const maxRow = Math.max(0, (buffer?.lineCount || 1) - 1);
  const row = Math.max(0, Math.min(cursor.row, maxRow));
  const lineLen = (buffer.getLine(row) ?? '').length;
  const col = Math.max(0, Math.min(cursor.col + delta, Math.max(0, lineLen)));
  return { row, col };
}

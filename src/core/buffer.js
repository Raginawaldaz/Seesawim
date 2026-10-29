/** Text buffer with a single replaceLines primitive and change events. */

export class TextBuffer {
  /**
   * @param {string[]} [lines]
   */
  constructor(lines) {
    this._lines = lines && lines.length ? lines.slice() : [''];
    this._version = 0;
    /** @type {Set<(ev: object) => void>} */
    this._listeners = new Set();
  }

  /** @param {string|null|undefined} content */
  static fromString(content) {
    if (content == null || content === '') return new TextBuffer(['']);
    const normalized = String(content).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    return new TextBuffer(lines.length ? lines : ['']);
  }

  get lineCount() {
    return this._lines.length;
  }

  get version() {
    return this._version;
  }

  /**
   * @param {number} row
   * @returns {string}
   */
  getLine(row) {
    if (!this._lines.length) return '';
    const r = Math.max(0, Math.min(row, this._lines.length - 1));
    return this._lines[r] ?? '';
  }

  toString() {
    return this._lines.join('\n');
  }

  /** Snapshot of lines (copy). */
  toArray() {
    return this._lines.slice();
  }

  /**
   * @param {(ev: object) => void} fn
   * @returns {() => void} unsubscribe
   */
  on(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /**
   * @param {object} ev
   */
  _emit(ev) {
    for (const fn of this._listeners) {
      try {
        fn(ev);
      } catch {
        /* ignore extension errors */
      }
    }
  }

  /**
   * Replace `deleteCount` lines starting at `row` with `inserted`.
   * @param {number} row
   * @param {number} deleteCount
   * @param {string[]} inserted
   * @param {{ cursorBefore?: {row:number,col:number}, cursorAfter?: {row:number,col:number} }} [meta]
   */
  replaceLines(row, deleteCount, inserted, meta = {}) {
    const start = Math.max(0, Math.min(row, this._lines.length));
    const del = Math.max(0, Math.min(deleteCount, this._lines.length - start));
    const ins = Array.isArray(inserted) ? inserted.slice() : [];
    const removed = this._lines.slice(start, start + del);

    if (del === 0 && ins.length === 0) return;

    this._lines.splice(start, del, ...ins);
    if (this._lines.length === 0) this._lines.push('');

    this._version += 1;
    this._emit({
      row: start,
      removed,
      inserted: ins,
      cursorBefore: meta.cursorBefore ?? null,
      cursorAfter: meta.cursorAfter ?? null,
    });
  }

  /**
   * @param {number} row
   * @param {string} text
   * @param {object} [meta]
   */
  setLine(row, text, meta = {}) {
    const r = Math.max(0, row);
    while (this._lines.length <= r) {
      this.replaceLines(this._lines.length, 0, [''], meta);
    }
    const next = String(text ?? '');
    if (this._lines[r] === next) return;
    this.replaceLines(r, 1, [next], meta);
  }

  /**
   * @param {number} row
   * @param {string} text
   * @param {object} [meta]
   */
  insertLine(row, text, meta = {}) {
    const r = Math.max(0, Math.min(row, this._lines.length));
    this.replaceLines(r, 0, [String(text ?? '')], meta);
  }

  /**
   * Split line at col: left stays, right becomes new line at row+1.
   * @param {number} row
   * @param {number} col
   * @param {object} [meta]
   * @returns {{ row: number, col: number }} new cursor
   */
  splitLine(row, col, meta = {}) {
    const r = Math.max(0, Math.min(row, this._lines.length - 1));
    const line = this._lines[r] ?? '';
    const c = Math.max(0, Math.min(col, line.length));
    const left = line.slice(0, c);
    const right = line.slice(c);
    const cursorAfter = { row: r + 1, col: 0 };
    this.replaceLines(r, 1, [left, right], {
      cursorBefore: meta.cursorBefore ?? { row: r, col: c },
      cursorAfter: meta.cursorAfter ?? cursorAfter,
    });
    return cursorAfter;
  }

  /**
   * Join row with the previous line; cursor lands at the seam.
   * @param {number} row
   * @param {object} [meta]
   * @returns {{ row: number, col: number }|null}
   */
  joinWithPrevious(row, meta = {}) {
    if (row <= 0 || row >= this._lines.length) return null;
    const prev = this._lines[row - 1] ?? '';
    const cur = this._lines[row] ?? '';
    const cursorAfter = { row: row - 1, col: prev.length };
    this.replaceLines(row - 1, 2, [prev + cur], {
      cursorBefore: meta.cursorBefore ?? { row, col: 0 },
      cursorAfter: meta.cursorAfter ?? cursorAfter,
    });
    return cursorAfter;
  }
}

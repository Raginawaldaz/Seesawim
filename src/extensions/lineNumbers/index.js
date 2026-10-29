/**
 * Left gutter with 1-based line numbers.
 */
export default {
  name: 'lineNumbers',
  setup(ctx) {
    ctx.addGutter((row) => {
      const n = ctx.buffer.lineCount;
      const width = Math.max(3, String(Math.max(n, 1)).length + 1);
      const num = String(row + 1).padStart(width, ' ');
      const isCurrent = row === ctx.state.cursor.row;
      if (isCurrent) return `{white-fg}${num}{/white-fg}`;
      return `{grey-fg}${num}{/grey-fg}`;
    });
  },
};

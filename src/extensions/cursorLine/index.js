/**
 * Current-line marker (">") and bold body in the code viewport.
 */
export default {
  name: 'cursorLine',
  setup(ctx) {
    ctx.addGutter((row) => {
      const isCurrent = row === ctx.state.cursor.row;
      return isCurrent ? ' {bold}>{/bold} ' : '   ';
    });

    ctx.addLineDecorator((row, body) => {
      if (row === ctx.state.cursor.row) {
        return `{bold}${body}{/bold}`;
      }
      return body;
    });
  },
};

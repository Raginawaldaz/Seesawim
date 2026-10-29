/**
 * Clear the status message on the next keypress.
 */
export default {
  name: 'autoClearMessage',
  setup(ctx) {
    ctx.on('keypress', () => {
      if (!ctx.state.message) return;
      ctx.state.message = '';
      ctx.state.messageKind = 'info';
      if (ctx.state.messageTimer) {
        clearTimeout(ctx.state.messageTimer);
        ctx.state.messageTimer = null;
      }
      ctx.paint();
    });
  },
};

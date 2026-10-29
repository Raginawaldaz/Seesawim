/**
 * Digit count prefix for command-mode motions (e.g. 5j).
 * Core uses takeCount(state) which defaults to 1 when this is off.
 */
export default {
  name: 'count',
  setup(ctx) {
    ctx.addCommandKey((cmdKey) => {
      if (cmdKey >= '1' && cmdKey <= '9') {
        ctx.state.countPrefix += cmdKey;
        return { handled: true, enterInsert: false, enterEx: false, message: null };
      }
      if (cmdKey === '0' && ctx.state.countPrefix) {
        ctx.state.countPrefix += '0';
        return { handled: true, enterInsert: false, enterEx: false, message: null };
      }
      return null;
    });
  },
};

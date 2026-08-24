/**
 * dsh-plugin-textcolor — HOST half.
 * Minimal: just logs load. The color work happens client-side.
 */

module.exports = {
  name: "dsh-plugin-textcolor",
  apply(ctx) {
    ctx.logger.info("[dsh-plugin-textcolor] loaded");
  }
};

/**
 * dsh-plugin-teamchat — HOST half.
 *
 * Auto-starts the team-chat relay so a single `dsh --profile web`
 * (or `npx @deepseek-ai/dsh web`) boots BOTH the harness and the relay.
 */

module.exports = {
  name: "dsh-plugin-teamchat",

  apply(ctx) {
    ctx.logger.info("[dsh-plugin-teamchat] Team chat plugin loaded");

    // Auto-start the WebSocket relay in-process. If something else is already
    // serving :7780 (e.g. a standalone relay you started), we just skip — the
    // existing one keeps working.
    try {
      require("./relay.js");
      ctx.logger.info("[dsh-plugin-teamchat] relay auto-started");
    } catch (e) {
      ctx.logger.warn("[dsh-plugin-teamchat] relay auto-start skipped: " + e.message);
    }
  }
};

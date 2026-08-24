/**
 * dsh-plugin-textcolor — CLIENT half.
 *
 * Registers a "文字颜色" page inside the Harness Settings panel (settings.section).
 * Provides a WPS-style color picker: standard color grid + custom color, applied
 * to all Harness UI text via CSS variable overrides (with a subtle glow for
 * readability on a wallpaper background).
 */

window.__ModuleLoader__.load({
  id: "dsh-plugin-textcolor",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var react = require("react");
    var useState = react.useState;
    var h = react.createElement;

    var STORAGE_KEY = "dsh_textcolor";

    // WPS-style standard color palette (20 swatches)
    var STANDARD = [
      "#000000", "#434343", "#808080", "#bfbfbf", "#ffffff",
      "#c00000", "#e60000", "#ff7f50", "#ffc000", "#ffe699",
      "#ff00ff", "#c000c0", "#7030a0", "#00b0f0", "#0070c0",
      "#002060", "#00ff00", "#00b050", "#548235", "#a9d08e"
    ];

    function loadColor() {
      try { return localStorage.getItem(STORAGE_KEY) || ""; }
      catch (e) { return ""; }
    }
    function saveColor(c) {
      try {
        if (c) localStorage.setItem(STORAGE_KEY, c);
        else localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    }

    // Apply chosen color to all Harness text (or revert when empty)
    function applyColor(color) {
      var el = document.getElementById("dsh-textcolor-styles");
      if (!color) {
        if (el) el.remove();
        return;
      }
      if (!el) {
        el = document.createElement("style");
        el.id = "dsh-textcolor-styles";
        document.head.appendChild(el);
      }
      el.textContent =
        ":root{" +
          "--dsw-alias-label-primary:" + color + "!important;" +
          "--dsw-alias-label-secondary:" + color + "!important;" +
          "--dsw-alias-label-tertiary:" + color + "!important;" +
          "--dsw-alias-label-quaternary:" + color + "!important;" +
          "--dsw-alias-label-brand:" + color + "!important;" +
          "--dsw-alias-text-primary:" + color + "!important;" +
          "--dsw-alias-text-secondary:" + color + "!important;" +
          "--dsw-alias-text-brand:" + color + "!important;" +
          "--dsw-alias-foreground-primary:" + color + "!important;" +
          "--dsw-alias-foreground-brand:" + color + "!important;" +
        "}" +
        "span,p,a,label,div,h1,h2,h3,[class*='sidebar'] span,[class*='sidebar'] button" +
        "{color:" + color + "!important;}";
    }

    // ── Settings page component ────────────────────────────────────────────────
    function TextColorSettings(props) {
      var saved = loadColor();
      var [color, setColor] = useState(saved || "#e5e5e5");
      var [custom, setCustom] = useState(saved || "#e5e5e5");
      var [status, setStatus] = useState("");

      var apply = function (c) {
        c = c || color;
        saveColor(c);
        applyColor(c);
        setColor(c);
        setStatus("已应用 " + c);
        setTimeout(function () { setStatus(""); }, 2000);
      };

      var reset = function () {
        saveColor("");
        applyColor("");
        setStatus("已恢复默认");
        setTimeout(function () { setStatus(""); }, 2000);
      };

      var btn = {
        padding: "9px 18px", borderRadius: "8px", border: "none",
        background: "#10a37f", color: "#fff", fontSize: "13px", cursor: "pointer"
      };

      var swatch = function (c) {
        var active = color.toLowerCase() === c.toLowerCase();
        return h("button", {
          onClick: function () { apply(c); },
          title: c,
          style: {
            width: "28px", height: "28px", borderRadius: "6px",
            background: c,
            border: active ? "2px solid #10a37f" : "1px solid #555",
            cursor: "pointer",
            boxShadow: active ? "0 0 0 2px rgba(16,163,127,0.5)" : "none"
          }
        });
      };

      return h("div", { style: { padding: "8px 0", color: "var(--dsw-alias-label-primary, #e5e5e5)" } },
        // Preview
        h("div", {
          style: {
            margin: "10px 0 18px", padding: "16px", borderRadius: "10px",
            background: "#1a1a1a", border: "1px solid #333"
          }
        },
          h("div", { style: { fontSize: "20px", fontWeight: 600, color: color } }, "文字颜色预览 Aa"),
          h("div", { style: { fontSize: "13px", marginTop: "6px", color: color, opacity: 0.85 } },
            "探索未至之境 · 描述你想要构建的内容")
        ),
        // Standard colors
        h("div", { style: { fontSize: "13px", color: "#888", marginBottom: "8px" } }, "标准颜色"),
        h("div", {
          style: { display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: "6px", marginBottom: "18px" }
        }, STANDARD.map(function (c) { return swatch(c); })),
        // Custom color
        h("div", { style: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" } },
          h("span", { style: { fontSize: "13px", color: "#888" } }, "自定义颜色"),
          h("input", {
            type: "color", value: custom,
            onChange: function (e) { setCustom(e.target.value); },
            style: { width: "48px", height: "32px", background: "none", border: "1px solid #444", borderRadius: "6px", cursor: "pointer" }
          }),
          h("button", { onClick: function () { apply(custom); }, style: btn }, "应用此颜色")
        ),
        // Actions
        h("div", { style: { display: "flex", gap: "10px" } },
          h("button", { onClick: function () { apply(color); }, style: btn }, "应用"),
          h("button", { onClick: reset, style: Object.assign({}, btn, { background: "#555" }) }, "恢复默认")
        ),
        status ? h("div", { style: { marginTop: "10px", fontSize: "12px", color: "#10a37f" } }, status) : null
      );
    }

    // ── Apply saved color on load ────────────────────────────────────────────────
    function bootApply() {
      var saved = loadColor();
      if (saved) applyColor(saved);
    }

    // ── Plugin apply ─────────────────────────────────────────────────────────────
    var inject = ["slots"];

    function apply(ctx) {
      bootApply();
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register(
          { name: "settings.section", id: "textcolor", order: 81, label: "文字颜色" },
          TextColorSettings
        );
      });
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});

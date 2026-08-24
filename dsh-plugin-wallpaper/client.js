/**
 * dsh-plugin-wallpaper — CLIENT half.
 *
 * - Registers a "壁纸" page inside the Harness Settings panel (settings.section).
 * - Auto-uses the Windows desktop wallpaper when "自动使用桌面壁纸" is on.
 * - Applies the wallpaper full-screen behind the chat UI.
 */

window.__ModuleLoader__.load({
  id: "dsh-plugin-wallpaper",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var react = require("react");
    var useEffect = react.useEffect;
    var useState = react.useState;
    var useRef = react.useRef;
    var h = react.createElement;

    var STORAGE_KEY = "dsh_wallpaper_config";
    var AUTO_KEY = "dsh_wallpaper_auto";
    var WP_URL = "http://127.0.0.1:3085/__wallpaper__";
    var WP_META = "http://127.0.0.1:3085/__wallpaper_meta__";

    function loadConfig() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
      catch (e) { return {}; }
    }
    function saveConfig(cfg) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch (e) {}
    }
    function isAuto() { return localStorage.getItem(AUTO_KEY) !== "0"; }
    function setAuto(v) { localStorage.setItem(AUTO_KEY, v ? "1" : "0"); }

    // ── HD Sharpen (3x3 unsharp convolution) ─────────────────────────────────
    function sharpen(data, w, h) {
      var src = new Uint8ClampedArray(data);
      var out = new Uint8ClampedArray(data.length);
      var kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
      for (var y = 1; y < h - 1; y++) {
        for (var x = 1; x < w - 1; x++) {
          for (var c = 0; c < 3; c++) {
            var sum = 0, ki = 0;
            for (var ky = -1; ky <= 1; ky++)
              for (var kx = -1; kx <= 1; kx++)
                sum += src[((y + ky) * w + (x + kx)) * 4 + c] * kernel[ki++];
            out[(y * w + x) * 4 + c] = sum;
          }
          out[((y * w + x) * 4) + 3] = src[((y * w + x) * 4) + 3];
        }
      }
      for (var i = 0; i < data.length; i++) if (out[i] === 0 && data[i] !== 0) out[i] = data[i];
      return out;
    }

    function makeTransparent() {
      var root = document.querySelector("#root") || document.body;
      root.style.background = "transparent";
      var candidates = [
        '[class*="pI_x6G"]', '[class*="pXSMma"]', '[class*="uV2eYG"]',
        '[class*="wSkVaW"]', '[class*="_7KE1Ra"]', '[class*="ydkMvW"]',
        '[class*="qDHVXG"]', '[class*="hHd-Xa"]'
      ];
      candidates.forEach(function (sel) {
        document.querySelectorAll(sel).forEach(function (el) { el.style.background = "transparent"; });
      });
    }

    // Apply a resolved wallpaper (url, type, mode, opacity, hd)
    function applyResolved(url, type, mode, opacity, hd) {
      var existing = document.querySelectorAll(".dsh-wallpaper-bg, .dsh-wallpaper-overlay");
      existing.forEach(function (el) { el.remove(); });
      if (!url) { makeTransparent(); return; }

      var overlay = document.createElement("div");
      overlay.className = "dsh-wallpaper-overlay";
      overlay.style.cssText =
        "position:fixed;top:0;left:0;width:100vw;height:100vh;" +
        "background:rgba(0,0,0," + opacity + ");z-index:0;pointer-events:none;";
      document.body.appendChild(overlay);

      var bg;
      if (type === "video") {
        bg = document.createElement("video");
        bg.src = url; bg.autoplay = true; bg.loop = true; bg.muted = true; bg.playsInline = true;
        if (hd) bg.style.filter = "contrast(1.12) saturate(1.15) brightness(1.03)";
        bg.onerror = function () { console.error("[Wallpaper] video failed"); };
      } else {
        bg = document.createElement("img");
        bg.crossOrigin = "anonymous";
        if (hd) {
          bg.onload = function () {
            if (bg.src.indexOf("data:") === 0) return;
            try {
              var c = document.createElement("canvas");
              var w = bg.naturalWidth, ht = bg.naturalHeight;
              c.width = w; c.height = ht;
              var cx = c.getContext("2d");
              cx.drawImage(bg, 0, 0);
              var src = cx.getImageData(0, 0, w, ht);
              var out = sharpen(src.data, w, ht);
              cx.putImageData(new ImageData(out, w, ht), 0, 0);
              bg.src = c.toDataURL("image/jpeg", 0.95);
            } catch (e) { console.warn("[Wallpaper] HD skipped", e); }
          };
        }
        bg.src = url;
        bg.onerror = function () { console.error("[Wallpaper] image failed"); };
      }
      bg.className = "dsh-wallpaper-bg";
      bg.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;object-fit:" + mode + ";z-index:-1;pointer-events:none;";
      document.body.appendChild(bg);
      makeTransparent();
    }

    // ── Settings page component (rendered inside the Settings panel) ───────────
    function WallpaperSettings(props) {
      var cfg = loadConfig();
      var [auto, setAutoState] = useState(isAuto());
      var [url, setUrl] = useState(cfg.url || "");
      var [type, setType] = useState(cfg.type || "image");
      var [mode, setMode] = useState(cfg.mode || "contain");
      var [opacity, setOpacity] = useState(cfg.opacity || 0.5);
      var [hd, setHd] = useState(cfg.hd || false);
      var [status, setStatus] = useState("");
      var lastPath = useRef("");

      var doApply = function (useDesktop) {
        var cfgUrl = url;
        if (useDesktop) {
          cfgUrl = WP_URL;
          setUrl(WP_URL);
        }
        var c = { url: cfgUrl, type: type, mode: mode, opacity: opacity, hd: hd };
        saveConfig(useDesktop ? {} : c);
        applyResolved(cfgUrl, type, mode, opacity, hd);
        setStatus(useDesktop ? "已应用桌面壁纸" : "已应用");
        setTimeout(function () { setStatus(""); }, 2000);
      };

      var toggleAuto = function () {
        var next = !auto;
        setAutoState(next);
        setAuto(next);
        if (next) doApply(true);
        else doApply(false);
      };

      var clear = function () {
        setUrl(""); saveConfig({});
        var existing = document.querySelectorAll(".dsh-wallpaper-bg, .dsh-wallpaper-overlay");
        existing.forEach(function (el) { el.remove(); });
        makeTransparent();
        setStatus("已清除");
        setTimeout(function () { setStatus(""); }, 2000);
      };

      var row = { display: "flex", alignItems: "center", gap: "10px", margin: "14px 0" };
      var label = { fontSize: "13px", color: "var(--dsw-alias-label-primary, #e5e5e5)", minWidth: "72px" };
      var input = { flex: 1, padding: "9px 12px", borderRadius: "8px", border: "1px solid #444", background: "#222", color: "#fff", fontSize: "13px", boxSizing: "border-box" };
      var select = { padding: "8px", borderRadius: "8px", border: "1px solid #444", background: "#222", color: "#fff", fontSize: "13px" };
      var btn = { padding: "9px 18px", borderRadius: "8px", border: "none", background: "#10a37f", color: "#fff", fontSize: "13px", cursor: "pointer" };

      return h("div", { style: { padding: "8px 0", color: "var(--dsw-alias-label-primary, #e5e5e5)" } },
        // Auto row
        h("div", { style: row },
          h("label", { style: Object.assign({}, label, { flex: 1 }) }, "自动使用桌面壁纸"),
          h("input", {
            type: "checkbox", checked: auto,
            onChange: toggleAuto, style: { width: "18px", height: "18px" }
          })
        ),
        h("div", { style: { fontSize: "12px", color: "#888", margin: "-6px 0 14px" } },
          "开启后自动同步你电脑当前的桌面壁纸（由插件在本地读取，无需联网）"),

        // Manual url
        h("div", { style: row },
          h("span", { style: label }, "图片/视频"),
          h("input", {
            type: "text", value: url, disabled: auto,
            onChange: function (e) { setUrl(e.target.value); },
            placeholder: "粘贴 URL，或开启上方自动同步", style: Object.assign({}, input, auto ? { opacity: 0.5 } : {})
          })
        ),
        h("div", { style: row },
          h("span", { style: label }, "类型"),
          h("select", { value: type, onChange: function (e) { setType(e.target.value); }, style: select, disabled: auto },
            h("option", { value: "image" }, "图片"),
            h("option", { value: "video" }, "视频")
          ),
          h("span", { style: label }, "填充"),
          h("select", { value: mode, onChange: function (e) { setMode(e.target.value); }, style: select },
            h("option", { value: "cover" }, "填充"),
            h("option", { value: "contain" }, "适应"),
            h("option", { value: "100% 100%" }, "拉伸")
          )
        ),
        h("div", { style: row },
          h("span", { style: label }, "高清锐化"),
          h("input", { type: "checkbox", checked: hd, onChange: function (e) { setHd(e.target.checked); }, style: { width: "18px", height: "18px" } })
        ),
        h("div", { style: row },
          h("span", { style: label }, "透明度"),
          h("input", {
            type: "range", min: "0", max: "1", step: "0.05", value: opacity,
            onChange: function (e) { setOpacity(parseFloat(e.target.value)); }, style: { flex: 1 }
          }),
          h("span", { style: { fontSize: "12px", color: "#888", minWidth: "40px", textAlign: "right" } }, Math.round(opacity * 100) + "%")
        ),
        h("div", { style: { display: "flex", gap: "10px", marginTop: "18px" } },
          h("button", { onClick: function () { doApply(auto); }, style: btn }, "应用"),
          h("button", { onClick: clear, style: Object.assign({}, btn, { background: "#555" }) }, "清除")
        ),
        status ? h("div", { style: { marginTop: "10px", fontSize: "12px", color: "#10a37f" } }, status) : null
      );
    }

    // ── Styles ─────────────────────────────────────────────────────────────────
    function injectStyles() {
      if (document.getElementById("dsh-wallpaper-styles")) return;
      var style = document.createElement("style");
      style.id = "dsh-wallpaper-styles";
      style.textContent =
        ".dsh-wallpaper-bg{position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;z-index:-1!important;pointer-events:none!important}" +
        ".dsh-wallpaper-overlay{position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;z-index:0!important;pointer-events:none!important}";
      document.head.appendChild(style);
    }

    // ── Apply on load + keep transparent ────────────────────────────────────────
    var lastAutoPath = "";
    function bootApply() {
      injectStyles();
      if (isAuto()) {
        applyResolved(WP_URL, "image", "contain", 0.5, false);
      } else {
        var cfg = loadConfig();
        if (cfg.url) applyResolved(cfg.url, cfg.type || "image", cfg.mode || "contain", cfg.opacity || 0.5, cfg.hd || false);
      }
      // Poll the desktop wallpaper metadata; only re-apply when it changes.
      setInterval(function () {
        if (isAuto()) {
          try {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", WP_META, false);
            xhr.send();
            var meta = JSON.parse(xhr.responseText || "{}");
            if (meta.path && meta.path !== lastAutoPath) {
              lastAutoPath = meta.path;
              applyResolved(WP_URL, "image", "contain", 0.5, false);
            }
          } catch (e) { /* server may be restarting */ }
        }
        makeTransparent();
      }, 5000);
    }

    // ── Plugin apply ─────────────────────────────────────────────────────────────
    var inject = ["slots"];

    function apply(ctx) {
      bootApply();
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register(
          { name: "settings.section", id: "wallpaper", order: 80, label: "壁纸" },
          WallpaperSettings
        );
      });
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});

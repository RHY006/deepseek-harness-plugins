/**
 * dsh-plugin-wallpaper — CLIENT half.
 *
 * - Upload an image from your computer, adjust crop/position/scale, set as wallpaper.
 * - Settings panel in Harness Settings (gear icon) → "壁纸".
 */

window.__ModuleLoader__.load({
  id: "dsh-plugin-wallpaper",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var react = require("react");
    var useState = react.useState;
    var useRef = react.useRef;
    var h = react.createElement;

    var STORAGE_KEY = "dsh_wallpaper_config";
    var WP_URL = "http://127.0.0.1:3085/__wallpaper__";
    var WP_UPLOAD = "http://127.0.0.1:3085/__wallpaper_upload__";
    var WP_META = "http://127.0.0.1:3085/__wallpaper_meta__";
    var UPLOADED_IMG = WP_UPLOAD; // GET returns the uploaded image

    function loadConfig() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
      catch (e) { return {}; }
    }
    function saveConfig(cfg) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch (e) {}
    }

    function makeTransparent() {
      var root = document.querySelector("#root") || document.body;
      root.style.background = "transparent";
      var selectors = [
        '[class*="pI_x6G"]', '[class*="pXSMma"]', '[class*="uV2eYG"]',
        '[class*="wSkVaW"]', '[class*="_7KE1Ra"]', '[class*="ydkMvW"]',
        '[class*="qDHVXG"]', '[class*="hHd-Xa"]'
      ];
      selectors.forEach(function (s) {
        document.querySelectorAll(s).forEach(function (el) { el.style.background = "transparent"; });
      });
    }

    // Apply wallpaper with crop settings
    function applyWallpaper(url, cfg) {
      var existing = document.querySelectorAll(".dsh-wallpaper-bg, .dsh-wallpaper-overlay");
      existing.forEach(function (el) { el.remove(); });
      if (!url) { makeTransparent(); return; }

      var opacity = cfg.opacity != null ? cfg.opacity : 0.5;
      var overlay = document.createElement("div");
      overlay.className = "dsh-wallpaper-overlay";
      overlay.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0," + opacity + ");z-index:0;pointer-events:none;";
      document.body.appendChild(overlay);

      var bg = document.createElement("img");
      bg.crossOrigin = "anonymous";
      bg.className = "dsh-wallpaper-bg";
      bg.src = url;

      var mode = cfg.mode || "cover";
      var posX = cfg.posX || 0;
      var posY = cfg.posY || 0;
      var scale = cfg.scale || 1;

      bg.style.cssText =
        "position:fixed;top:0;left:0;width:100vw;height:100vh;" +
        "object-fit:" + mode + ";" +
        "object-position:" + (50 + posX) + "% " + (50 + posY) + "%;" +
        "transform:scale(" + scale + ");" +
        "z-index:-1;pointer-events:none;";

      bg.onerror = function () { console.error("[Wallpaper] load failed"); };
      document.body.appendChild(bg);
      makeTransparent();
    }

    // ── Settings page component ────────────────────────────────────────────────
    function WallpaperSettings(props) {
      var cfg = loadConfig();
      var [url, setUrl] = useState(cfg.url || "");
      var [mode, setMode] = useState(cfg.mode || "cover");
      var [opacity, setOpacity] = useState(cfg.opacity || 0.5);
      var [scale, setScale] = useState(cfg.scale || 1);
      var [posX, setPosX] = useState(cfg.posX || 0);
      var [posY, setPosY] = useState(cfg.posY || 0);
      var [status, setStatus] = useState("");
      var [uploading, setUploading] = useState(false);
      var fileRef = useRef(null);

      var doApply = function (overrideUrl) {
        var applyUrl = overrideUrl || url;
        var c = { url: applyUrl, mode: mode, opacity: opacity, scale: scale, posX: posX, posY: posY };
        saveConfig(c);
        applyWallpaper(applyUrl, c);
        setStatus("已应用");
        setTimeout(function () { setStatus(""); }, 2000);
      };

      var clear = function () {
        setUrl(""); saveConfig({});
        var existing = document.querySelectorAll(".dsh-wallpaper-bg, .dsh-wallpaper-overlay");
        existing.forEach(function (el) { el.remove(); });
        makeTransparent();
        setStatus("已清除");
        setTimeout(function () { setStatus(""); }, 2000);
      };

      var handleUpload = function (e) {
        var file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        var reader = new FileReader();
        reader.onload = function (ev) {
          var dataUrl = ev.target.result;
          // Save to server
          fetch(WP_UPLOAD, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataUrl: dataUrl })
          }).then(function (r) { return r.json(); })
          .then(function (d) {
            if (d.ok) {
              var imgUrl = UPLOADED_IMG + "?t=" + Date.now();
              setUrl(imgUrl);
              doApply(imgUrl);
              setUploading(false);
            }
          }).catch(function () {
            // Fallback: use data URL directly (may be large)
            setUrl(dataUrl);
            doApply(dataUrl);
            setUploading(false);
          });
        };
        reader.readAsDataURL(file);
      };

      var row = { display: "flex", alignItems: "center", gap: "10px", margin: "12px 0" };
      var label = { fontSize: "13px", color: "var(--dsw-alias-label-primary, #e5e5e5)", minWidth: "72px" };
      var input = { flex: 1, padding: "9px 12px", borderRadius: "8px", border: "1px solid #444", background: "#222", color: "#fff", fontSize: "13px", boxSizing: "border-box" };
      var select = { padding: "8px", borderRadius: "8px", border: "1px solid #444", background: "#222", color: "#fff", fontSize: "13px" };
      var btn = { padding: "9px 18px", borderRadius: "8px", border: "none", background: "#10a37f", color: "#fff", fontSize: "13px", cursor: "pointer" };

      // Preview area
      var previewStyle = {
        width: "100%", height: "160px", borderRadius: "10px", border: "1px solid #333",
        overflow: "hidden", position: "relative", background: "#000", marginBottom: "16px"
      };
      var previewImgStyle = {
        width: "100%", height: "100%",
        objectFit: mode,
        objectPosition: (50 + posX) + "% " + (50 + posY) + "%",
        transform: "scale(" + scale + ")"
      };

      return h("div", { style: { padding: "8px 0", color: "var(--dsw-alias-label-primary, #e5e5e5)" } },
        // Preview
        url ? h("div", { style: previewStyle },
          h("img", { src: url, style: previewImgStyle })
        ) : h("div", { style: Object.assign({}, previewStyle, { display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: "13px" }) }, "暂无壁纸，点击下方上传"),

        // Upload button
        h("input", { ref: fileRef, type: "file", accept: "image/*", onChange: handleUpload, style: { display: "none" } }),
        h("div", { style: row },
          h("button", {
            onClick: function () { fileRef.current.click(); },
            style: Object.assign({}, btn, { background: uploading ? "#555" : "#10a37f" }),
            disabled: uploading
          }, uploading ? "上传中..." : "选择图片上传"),
          url ? h("button", { onClick: clear, style: Object.assign({}, btn, { background: "#555" }) }, "清除") : null
        ),

        // URL input (manual)
        h("div", { style: row },
          h("span", { style: label }, "或粘贴 URL"),
          h("input", {
            type: "text", value: url.indexOf("?t=") > -1 ? url.split("?t=")[0] : url,
            onChange: function (e) { setUrl(e.target.value); },
            placeholder: "https://example.com/wallpaper.jpg", style: input
          })
        ),

        // Mode
        h("div", { style: row },
          h("span", { style: label }, "适应模式"),
          h("select", { value: mode, onChange: function (e) { setMode(e.target.value); }, style: select },
            h("option", { value: "cover" }, "填充 (裁切)"),
            h("option", { value: "contain" }, "适应 (留黑边)"),
            h("option", { value: "fill" }, "拉伸"),
            h("option", { value: "none" }, "原始尺寸")
          )
        ),

        // Scale
        h("div", { style: row },
          h("span", { style: label }, "缩放"),
          h("input", {
            type: "range", min: "0.3", max: "3", step: "0.05", value: scale,
            onChange: function (e) { setScale(parseFloat(e.target.value)); },
            style: { flex: 1 }
          }),
          h("span", { style: { fontSize: "12px", color: "#888", minWidth: "40px", textAlign: "right" } }, scale.toFixed(1) + "x")
        ),

        // Position X
        h("div", { style: row },
          h("span", { style: label }, "左右"),
          h("input", {
            type: "range", min: "-50", max: "50", step: "1", value: posX,
            onChange: function (e) { setPosX(parseInt(e.target.value)); },
            style: { flex: 1 }
          }),
          h("span", { style: { fontSize: "12px", color: "#888", minWidth: "40px", textAlign: "right" } }, posX + "%")
        ),

        // Position Y
        h("div", { style: row },
          h("span", { style: label }, "上下"),
          h("input", {
            type: "range", min: "-50", max: "50", step: "1", value: posY,
            onChange: function (e) { setPosY(parseInt(e.target.value)); },
            style: { flex: 1 }
          }),
          h("span", { style: { fontSize: "12px", color: "#888", minWidth: "40px", textAlign: "right" } }, posY + "%")
        ),

        // Opacity
        h("div", { style: row },
          h("span", { style: label }, "遮罩透明度"),
          h("input", {
            type: "range", min: "0", max: "1", step: "0.05", value: opacity,
            onChange: function (e) { setOpacity(parseFloat(e.target.value)); },
            style: { flex: 1 }
          }),
          h("span", { style: { fontSize: "12px", color: "#888", minWidth: "40px", textAlign: "right" } }, Math.round(opacity * 100) + "%")
        ),

        // Apply
        h("div", { style: { display: "flex", gap: "10px", marginTop: "16px" } },
          h("button", { onClick: function () { doApply(); }, style: btn }, "应用"),
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

    // ── Version check ──────────────────────────────────────────────────────────
    var PLUGIN_VER = "1.1.0";
    var VER_KEY = "dsh_wallpaper_ver";
    (function () {
      try {
        var prev = localStorage.getItem(VER_KEY);
        if (prev && prev !== PLUGIN_VER) {
          localStorage.setItem(VER_KEY, PLUGIN_VER);
          location.reload(true);
          return;
        }
        localStorage.setItem(VER_KEY, PLUGIN_VER);
      } catch (e) {}
    })();

    // ── Boot apply ──────────────────────────────────────────────────────────────
    function bootApply() {
      injectStyles();
      var cfg = loadConfig();
      if (cfg.url) applyWallpaper(cfg.url, cfg);
      setInterval(function () { makeTransparent(); }, 5000);
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

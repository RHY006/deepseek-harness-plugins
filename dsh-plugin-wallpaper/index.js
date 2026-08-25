/**
 * dsh-plugin-wallpaper — HOST half.
 *
 * - Reads the Windows desktop wallpaper path from the registry.
 * - Serves the wallpaper image via a small HTTP server (port 3085).
 * - The client fetches it automatically and applies as the chat background.
 */

var http = require("http");
var fs = require("fs");
var path = require("path");
var child_process = require("child_process");

var WALLPAPER_PORT = 3085;
var currentWallpaperPath = null;

// Read the Windows desktop wallpaper path from registry
function readDesktopWallpaper() {
  try {
    var regExe = "C:\\Windows\\System32\\reg.exe";
    var result = child_process.execSync(
      '"' + regExe + '" query "HKCU\\Control Panel\\Desktop" /v Wallpaper',
      { encoding: "utf8", timeout: 5000 }
    );
    var match = result.match(/Wallpaper\s+REG_SZ\s+(.+)/);
    if (match) {
      var p = match[1].trim();
      if (p && p !== "(未设置)" && p !== "(none)" && fs.existsSync(p)) {
        return p;
      }
    }
  } catch (e) {
    // ignore
  }
  // Fallback: the Windows theme transcoded wallpaper (always a valid image)
  try {
    var userDir = process.env.USERPROFILE || process.env.HOME;
    var fallback = userDir + "\\AppData\\Roaming\\Microsoft\\Windows\\Themes\\TranscodedWallpaper";
    if (fs.existsSync(fallback)) return fallback;
  } catch (e2) {
    // ignore
  }
  return null;
}

// MIME types for wallpaper images
var MIME = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".bmp": "image/bmp",
  ".gif": "image/gif", ".webp": "image/webp"
};

module.exports = {
  name: "dsh-plugin-wallpaper",

  apply(ctx) {
    ctx.logger.info("[dsh-plugin-wallpaper] loaded");

    // Read current wallpaper
    currentWallpaperPath = readDesktopWallpaper();
    if (currentWallpaperPath) {
      ctx.logger.info("[dsh-plugin-wallpaper] desktop wallpaper: " + currentWallpaperPath);
    } else {
      ctx.logger.info("[dsh-plugin-wallpaper] no desktop wallpaper detected");
    }

    // Periodically check for wallpaper changes (every 30 seconds)
    setInterval(function () {
      var newPath = readDesktopWallpaper();
      if (newPath && newPath !== currentWallpaperPath) {
        currentWallpaperPath = newPath;
        ctx.logger.info("[dsh-plugin-wallpaper] wallpaper changed: " + newPath);
      }
    }, 30000);

    // Start HTTP server to serve the wallpaper image + plugin JS with no-cache
    var CORS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache, no-store, must-revalidate" };
    var NO_CACHE_HEADERS = {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Content-Type": "application/javascript"
    };
    var pluginClientPath = path.join(__dirname, "client.js");
    var server = http.createServer(function (req, res) {
      if (req.url === "/__wallpaper__" && currentWallpaperPath) {
        var ext = path.extname(currentWallpaperPath).toLowerCase();
        var contentType = MIME[ext] || "application/octet-stream";
        fs.readFile(currentWallpaperPath, function (err, data) {
          if (err) {
            res.writeHead(404, CORS);
            res.end("Not found");
          } else {
            res.writeHead(200, Object.assign({ "Content-Type": contentType }, CORS));
            res.end(data);
          }
        });
      } else if (req.url === "/__wallpaper_meta__") {
        res.writeHead(200, Object.assign({ "Content-Type": "application/json" }, CORS));
        res.end(JSON.stringify({ path: currentWallpaperPath }));
      } else if (req.url === "/__wallpaper_client__") {
        // Serve client.js with no-cache headers to bust browser cache
        fs.readFile(pluginClientPath, "utf8", function (err, data) {
          if (err) {
            res.writeHead(404, NO_CACHE_HEADERS);
            res.end("// not found");
          } else {
            res.writeHead(200, NO_CACHE_HEADERS);
            res.end(data);
          }
        });
      } else {
        res.writeHead(404, CORS);
        res.end("Not found");
      }
    });

    server.on("error", function (err) {
      if (err.code === "EADDRINUSE") {
        ctx.logger.warn("[dsh-plugin-wallpaper] port " + WALLPAPER_PORT + " in use, skipping server");
      }
    });

    server.listen(WALLPAPER_PORT, function () {
      ctx.logger.info("[dsh-plugin-wallpaper] serving wallpaper on http://127.0.0.1:" + WALLPAPER_PORT);
    });
  }
};

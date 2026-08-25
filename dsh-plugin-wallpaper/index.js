/**
 * dsh-plugin-wallpaper — HOST half.
 *
 * - Reads the Windows desktop wallpaper path from the registry.
 * - Serves the wallpaper image via a small HTTP server (port 3085).
 * - Accepts uploaded wallpaper images and serves them back.
 */

var http = require("http");
var fs = require("fs");
var path = require("path");
var child_process = require("child_process");

var WALLPAPER_PORT = 3085;
var currentWallpaperPath = null;
var UPLOAD_PATH = path.join(process.env.USERPROFILE || process.env.HOME, ".dsh", "wallpaper-upload.jpg");

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
      if (p && p !== "(未设置)" && p !== "(none)" && fs.existsSync(p)) return p;
    }
  } catch (e) {}
  try {
    var fallback = (process.env.USERPROFILE || process.env.HOME) +
      "\\AppData\\Roaming\\Microsoft\\Windows\\Themes\\TranscodedWallpaper";
    if (fs.existsSync(fallback)) return fallback;
  } catch (e) {}
  return null;
}

var MIME = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".bmp": "image/bmp",
  ".gif": "image/gif", ".webp": "image/webp"
};

function readBody(req, cb) {
  var chunks = [];
  req.on("data", function (c) { chunks.push(c); });
  req.on("end", function () { cb(Buffer.concat(chunks)); });
}

module.exports = {
  name: "dsh-plugin-wallpaper",
  apply(ctx) {
    ctx.logger.info("[dsh-plugin-wallpaper] loaded");
    currentWallpaperPath = readDesktopWallpaper();
    if (currentWallpaperPath) {
      ctx.logger.info("[dsh-plugin-wallpaper] desktop wallpaper: " + currentWallpaperPath);
    }

    setInterval(function () {
      var newPath = readDesktopWallpaper();
      if (newPath && newPath !== currentWallpaperPath) {
        currentWallpaperPath = newPath;
        ctx.logger.info("[dsh-plugin-wallpaper] wallpaper changed: " + newPath);
      }
    }, 30000);

    var CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
    var NO_CACHE = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0" };

    var server = http.createServer(function (req, res) {
      // Handle CORS preflight
      if (req.method === "OPTIONS") {
        res.writeHead(204, CORS);
        return res.end();
      }

      // Upload wallpaper image
      if (req.url === "/__wallpaper_upload__" && req.method === "POST") {
        readBody(req, function (buf) {
          try {
            var body = JSON.parse(buf.toString("utf8"));
            var dataUrl = body.dataUrl || "";
            var match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
            if (!match) {
              res.writeHead(400, Object.assign({ "Content-Type": "application/json" }, CORS));
              return res.end(JSON.stringify({ error: "invalid data URL" }));
            }
            var imgBuf = Buffer.from(match[1], "base64");
            fs.writeFileSync(UPLOAD_PATH, imgBuf);
            res.writeHead(200, Object.assign({ "Content-Type": "application/json" }, CORS));
            res.end(JSON.stringify({ ok: true, path: UPLOAD_PATH, bytes: imgBuf.length }));
          } catch (e) {
            res.writeHead(500, Object.assign({ "Content-Type": "application/json" }, CORS));
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }

      // Serve uploaded wallpaper
      if (req.url === "/__wallpaper_upload__" && req.method === "GET") {
        if (fs.existsSync(UPLOAD_PATH)) {
          var ext = path.extname(UPLOAD_PATH).toLowerCase();
          res.writeHead(200, Object.assign({ "Content-Type": MIME[ext] || "image/jpeg", "Cache-Control": "no-cache" }, CORS));
          fs.createReadStream(UPLOAD_PATH).pipe(res);
        } else {
          res.writeHead(404, Object.assign({ "Content-Type": "text/plain" }, CORS));
          res.end("no upload");
        }
        return;
      }

      // Serve desktop wallpaper
      if (req.url === "/__wallpaper__" && currentWallpaperPath) {
        var ext2 = path.extname(currentWallpaperPath).toLowerCase();
        fs.readFile(currentWallpaperPath, function (err, data) {
          if (err) { res.writeHead(404, CORS); res.end("Not found"); }
          else { res.writeHead(200, Object.assign({ "Content-Type": MIME[ext2] || "application/octet-stream", "Cache-Control": "no-cache" }, CORS)); res.end(data); }
        });
        return;
      }

      if (req.url === "/__wallpaper_meta__") {
        res.writeHead(200, Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-cache" }, CORS));
        return res.end(JSON.stringify({ path: currentWallpaperPath }));
      }

      if (req.url === "/__wallpaper_client__") {
        fs.readFile(path.join(__dirname, "client.js"), "utf8", function (err, data) {
          if (err) { res.writeHead(404, NO_CACHE); res.end("// not found"); }
          else { res.writeHead(200, Object.assign({ "Content-Type": "application/javascript" }, NO_CACHE)); res.end(data); }
        });
        return;
      }

      res.writeHead(404, CORS);
      res.end("Not found");
    });

    server.on("error", function (err) {
      if (err.code === "EADDRINUSE") ctx.logger.warn("[dsh-plugin-wallpaper] port " + WALLPAPER_PORT + " in use");
    });

    server.listen(WALLPAPER_PORT, function () {
      ctx.logger.info("[dsh-plugin-wallpaper] serving on http://127.0.0.1:" + WALLPAPER_PORT);
    });
  }
};

/**
 * dsh-plugin-teamchat — standalone WebSocket relay with rooms + persistence.
 *
 * Run:  node relay.js            (listens on :7780)
 *       PORT=9000 node relay.js
 *
 * - Rooms: every message carries a `room`. The server only forwards a message
 *   to clients currently in that room, and sends that room's history on join.
 * - History is kept per-room in memory + on disk (teamchat-history.json).
 * - Message kinds: join, msg (text), image (data URL), file (name+data URL),
 *   history (snapshot), rooms (roster), sys.
 */
var http = require("http");
var fs = require("fs");
var ws = require("ws");

var PORT = process.env.PORT || 7780;
var HISTORY_FILE = process.env.HISTORY_FILE || "teamchat-history.json";
var MAX_HISTORY = parseInt(process.env.MAX_HISTORY || "200", 10);

// history: { [room]: message[] }
var history = { __global__: [] };
try {
  history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  if (!history || typeof history !== "object") history = { __global__: [] };
} catch (e) {
  history = { __global__: [] };
}

function pushHistory(room, msg) {
  if (!history[room]) history[room] = [];
  history[room].push(msg);
  if (history[room].length > MAX_HISTORY) history[room] = history[room].slice(-MAX_HISTORY);
  persist();
}

function persist() {
  try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(history), "utf8"); }
  catch (e) { console.warn("[relay] persist failed:", e.message); }
}

function roomRoster() {
  return Object.keys(history).filter(function (r) { return r !== "__global__"; });
}

var server = http.createServer(function (req, res) {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("dsh-plugin-teamchat relay (rooms) on ws://" + (req.headers.host || "localhost:" + PORT) + "\n");
});

var wss = new ws.Server({ server: server });

function broadcast(room, obj, exceptConn) {
  wss.clients.forEach(function (c) {
    if (c !== exceptConn && c.readyState === ws.OPEN && c.room === room) {
      try { c.send(JSON.stringify(obj)); } catch (e) { /* ignore */ }
    }
  });
}

function sendRooms(conn) {
  try { conn.send(JSON.stringify({ type: "rooms", rooms: roomRoster() })); } catch (e) {}
}

wss.on("connection", function (conn) {
  conn.room = null;
  console.log("[relay] client connected, total:", wss.clients.size);

  conn.on("message", function (data) {
    var text = data.toString();
    var msg;
    try { msg = JSON.parse(text); } catch (e) { return; }
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "join") {
      conn.room = msg.room || "__global__";
      // send history + roster to the joining client only
      try {
        conn.send(JSON.stringify({ type: "history", room: conn.room, messages: history[conn.room] || [] }));
      } catch (e) {}
      sendRooms(conn);
      broadcast(conn.room, { type: "sys", text: (msg.user || "有人") + " 加入了房间", ts: Date.now() }, conn);
      return;
    }

    if (!conn.room) conn.room = "__global__";
    msg.room = conn.room;

    if (msg.type === "msg" || msg.type === "image" || msg.type === "file") {
      pushHistory(conn.room, msg);
      broadcast(conn.room, msg); // peers (not echo — sender renders locally)
    }
  });

  conn.on("close", function () {
    console.log("[relay] client disconnected, total:", wss.clients.size);
  });
  conn.on("error", function () { /* ignore */ });
});

function relayError(err) {
  if (err.code === "EADDRINUSE") {
    console.warn("[relay] port " + PORT + " already in use — assuming another relay is running. Skipping auto-start.");
  } else {
    console.error("[relay] server error:", err.message);
  }
}
server.on("error", relayError);
wss.on("error", relayError);

server.listen(PORT, function () {
  console.log("[relay] listening on ws://0.0.0.0:" + PORT + " (rooms: " + roomRoster().length + ")");
});

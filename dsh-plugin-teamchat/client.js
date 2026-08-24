/**
 * dsh-plugin-teamchat — CLIENT half.
 *
 * Multi-room team chat in the Harness SIDEBAR:
 *   - multiple rooms (channels); switch / create / join
 *   - text + emoji + image + file messages
 *   - "问智能体" mode: routes the prompt to the member's OWN local Harness
 *     agent and posts the answer back into the room
 * Messages sync across members through the WebSocket relay.
 */

window.__ModuleLoader__.load({
  id: "dsh-plugin-teamchat",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var react = require("react");
    var useEffect = react.useEffect;
    var useState = react.useState;
    var useRef = react.useRef;
    var h = react.createElement;

    var WS_KEY = "dsh_team_ws";
    var NAME_KEY = "dsh_team_name";
    var PANEL_KEY = "dsh_team_panel_open";
    var ROOM_KEY = "dsh_team_room";

    function togglePanel() { window.dispatchEvent(new Event("dsh-teamchat-toggle")); }
    function loadWs() { return localStorage.getItem(WS_KEY) || "ws://localhost:7780"; }
    function loadName() { return localStorage.getItem(NAME_KEY) || ("用户" + Math.floor(Math.random() * 1000)); }
    function loadRoom() { return localStorage.getItem(ROOM_KEY) || "通用大厅"; }

    // Read the same wallpaper config the wallpaper plugin uses
    function loadWallpaper() {
      try {
        var cfg = JSON.parse(localStorage.getItem("dsh_wallpaper_config"));
        if (cfg && cfg.url) return cfg;
      } catch (e) {}
      return null;
    }

    function colorFor(name) {
      var sum = 0;
      for (var i = 0; i < name.length; i++) sum = (sum * 31 + name.charCodeAt(i)) % 360;
      return "hsl(" + sum + ",70%,65%)";
    }
    function fmtSize(b) {
      if (!b && b !== 0) return "";
      if (b < 1024) return b + " B";
      if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
      return (b / 1048576).toFixed(1) + " MB";
    }
    var EMOJIS = ["😀","😂","😍","🤔","👍","🙏","🎉","🔥","💡","✅","❌","⚠️","🚀","💬","📎","🖼️","🌟","😎","🤝","❤️","💯","📌","⏰","🐛"];

    // ── Inherit the Harness's own look ────────────────────────────────────────
    function findSurface() {
      var root = document.getElementById("root") || document.body;
      var best = null, bestArea = 0;
      function walk(el, d) {
        if (d > 6 || !el.children) return;
        for (var i = 0; i < el.children.length; i++) {
          var c = el.children[i];
          var bg = getComputedStyle(c).backgroundColor;
          if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
            var r = c.getBoundingClientRect();
            var area = r.width * r.height;
            if (area > bestArea) { bestArea = area; best = c; }
          }
          walk(c, d + 1);
        }
      }
      walk(root, 0);
      return best || root;
    }
    function readHarnessTheme() {
      try {
        if (document.querySelector(".dsh-wallpaper-bg, .dsh-wallpaper-overlay")) {
          return { bg: "transparent", fg: getComputedStyle(document.body).color || "#e5e5e5", wallpaper: true };
        }
        var cs = getComputedStyle(findSurface());
        return { bg: cs.backgroundColor, fg: cs.color, wallpaper: false };
      } catch (e) { return { bg: "transparent", fg: "#e5e5e5", wallpaper: false }; }
    }
    function readHarnessBubbles() {
      var other = null, self = null;
      try {
        var els = document.querySelectorAll('[class*="bubble"], [class*="message"], [class*="msg"], [class*="Message"]');
        var seen = {};
        els.forEach(function (el) {
          var bg = getComputedStyle(el).backgroundColor;
          if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent" && !seen[bg]) {
            seen[bg] = true;
            if (!other) other = bg; else if (!self && bg !== other) self = bg;
          }
        });
      } catch (e) {}
      return { other: other, self: self };
    }

    // Best-effort: ask the member's OWN local Harness agent (client runtime).
    var ctxRef = null;
    function runAgent(prompt, cb) {
      var ctx = ctxRef;
      if (!ctx) { cb(null, "（智能体不可用）"); return; }
      var sess = ctx.sessions || ctx.conversation;
      if (!sess) { cb(null, "（智能体不可用：无 sessions 服务）"); return; }
      try {
        var cur = sess.current || (sess.get && sess.currentId ? sess.get(sess.currentId) : null);
        var conv = cur && (cur.conversation || cur);
        if (!conv || typeof conv.prompt !== "function") { cb(null, "（智能体不可用：无 conversation）"); return; }
        conv.prompt(prompt);
        var acc = "";
        var done = false;
        function gather() {
          var snap = conv.getSnapshot ? conv.getSnapshot() : (conv.snapshot || null);
          if (snap) {
            var t = (snap.partial && (snap.partial.text || snap.partial.content)) ||
                    (snap.legacy && snap.legacy.text) || "";
            if (t) acc = t;
            if (snap.running === false && !done) { done = true; cb(acc, null); }
          }
        }
        var unsub = conv.subscribe ? conv.subscribe(gather) : null;
        setTimeout(function () {
          if (!done) { done = true; if (unsub) unsub(); cb(acc || "（未收到智能体回复）", null); }
        }, 90000);
      } catch (e) { cb(null, "（智能体出错：" + e.message + "）"); }
    }

    // ── Sidebar footer button ────────────────────────────────────────────────
    function TeamChatSidebarButton(props) {
      var wide = props ? props.wide : true;
      return h("button", {
        onClick: togglePanel, title: "团队聊天",
        style: {
          display: "flex", alignItems: "center", gap: "8px", width: "100%",
          padding: wide ? "8px 10px" : "8px", justifyContent: wide ? "flex-start" : "center",
          background: "transparent", border: "none", color: "#e5e5e5",
          fontSize: "13px", cursor: "pointer", borderRadius: "8px"
        }
      },
        h("span", { style: { fontSize: "16px" } }, "\uD83E\uDD1D"),
        wide ? h("span", null, "团队聊天") : null
      );
    }

    // ── Team chat (multi-room) ───────────────────────────────────────────────
    function TeamChat() {
      var [panelOpen, setPanelOpen] = useState(function () {
        var v = localStorage.getItem(PANEL_KEY); return v === null ? false : v === "1";
      });
      var [wsUrl, setWsUrl] = useState(loadWs);
      var [name, setName] = useState(loadName);
      var [connected, setConnected] = useState(false);
      var [rooms, setRooms] = useState([loadRoom()]);
      var [currentRoom, setCurrentRoom] = useState(loadRoom);
      var [messages, setMessages] = useState([]);
      var [input, setInput] = useState("");
      var [agentMode, setAgentMode] = useState(false);
      var [emojiOpen, setEmojiOpen] = useState(false);

      var wsRef = useRef(null);
      var logRef = useRef(null);
      var fileRef = useRef(null);

      var [theme, setTheme] = useState({ bg: "transparent", fg: "#e5e5e5" });
      var [bubbles, setBubbles] = useState({ self: null, other: null });
      var [wallpaper, setWallpaper] = useState(null);

      useEffect(function () {
        function onToggle() {
          setPanelOpen(function (p) { var n = !p; localStorage.setItem(PANEL_KEY, n ? "1" : "0"); return n; });
        }
        function onKeydown(e) {
          if (e.key === "Escape" && panelOpen) {
            setPanelOpen(false);
            localStorage.setItem(PANEL_KEY, "0");
          }
        }
        window.addEventListener("dsh-teamchat-toggle", onToggle);
        window.addEventListener("keydown", onKeydown);
        return function () {
          window.removeEventListener("dsh-teamchat-toggle", onToggle);
          window.removeEventListener("keydown", onKeydown);
        };
      }, [panelOpen]);

      useEffect(function () {
        if (panelOpen) {
          setTheme(readHarnessTheme());
          setBubbles(readHarnessBubbles());
          setWallpaper(loadWallpaper());
        }
      }, [panelOpen]);

      function connect() {
        try {
          var ws = new WebSocket(wsUrl);
          wsRef.current = ws;
          ws.onopen = function () { setConnected(true); ws.send(JSON.stringify({ type: "join", room: currentRoom, user: name })); };
          ws.onclose = function () { setConnected(false); };
          ws.onerror = function () { setConnected(false); };
          ws.onmessage = function (ev) {
            var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
            if (m.type === "history" && m.room === currentRoom) {
              setMessages(m.messages || []);
            } else if (m.type === "rooms") {
              setRooms(m.rooms && m.rooms.length ? m.rooms : [currentRoom]);
            } else if ((m.type === "msg" || m.type === "image" || m.type === "file" || m.type === "sys") && m.room === currentRoom) {
              setMessages(function (arr) { return arr.concat([m]); });
            }
          };
        } catch (e) { setConnected(false); }
      }
      function disconnect() { if (wsRef.current) { wsRef.current.close(); wsRef.current = null; } setConnected(false); }

      function switchRoom(room) {
        if (room === currentRoom) return;
        setCurrentRoom(room); localStorage.setItem(ROOM_KEY, room);
        setMessages([]);
        if (wsRef.current && wsRef.current.readyState === 1) {
          wsRef.current.send(JSON.stringify({ type: "join", room: room, user: name }));
        }
      }
      function createRoom() {
        var r = (window.prompt("新房间名称：") || "").trim();
        if (!r) return;
        if (rooms.indexOf(r) < 0) setRooms(rooms.concat([r]));
        switchRoom(r);
      }

      function post(m) { if (wsRef.current && wsRef.current.readyState === 1) wsRef.current.send(JSON.stringify(m)); }

      function send() {
        var text = input.trim();
        if (!text) return;
        var mine = { type: "msg", room: currentRoom, user: name, text: text, ts: Date.now() };
        setMessages(function (a) { return a.concat([mine]); });
        post(mine);
        setInput("");
        if (agentMode) {
          runAgent(text, function (reply, err) {
            var ans = err ? err : (reply || "（无回复）");
            var agentMsg = { type: "msg", room: currentRoom, user: name + " 的智能体", text: ans, ts: Date.now(), agent: true };
            setMessages(function (a) { return a.concat([agentMsg]); });
            post(agentMsg);
          });
        }
      }

      function sendFile(kind, file) {
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var m = kind === "image"
            ? { type: "image", room: currentRoom, user: name, src: reader.result, ts: Date.now() }
            : { type: "file", room: currentRoom, user: name, name: file.name, size: file.size, src: reader.result, ts: Date.now() };
          setMessages(function (a) { return a.concat([m]); });
          post(m);
        };
        reader.readAsDataURL(file);
      }

      useEffect(function () { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [messages]);

      if (!panelOpen) return null;

      var subtleBorder = "1px solid rgba(128,128,128,0.18)";
      var inputStyle = { width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid #444", background: "#2a2a2a", color: "#e5e5e5", fontSize: "14px", boxSizing: "border-box" };
      var btnStyle = { padding: "8px 14px", borderRadius: "10px", border: "none", background: "#10a37f", color: "#fff", fontSize: "13px", cursor: "pointer" };
      var selfBg = "#10a37f";
      var otherBg = "#333";
      var msgAreaBg = "#1e1e1e";

      function renderMsg(m, i) {
        if (m.type === "sys") return h("div", { key: i, style: { textAlign: "center", opacity: 0.5, fontSize: "12px", margin: "8px 0" } }, m.text);
        if (m.type === "image") return h("div", { key: i, style: { margin: "10px 0", textAlign: m.user === name ? "right" : "left" } },
          h("div", { style: { fontSize: "13px", color: colorFor(m.user), marginBottom: "4px" } }, m.user),
          h("img", { src: m.src, style: { maxWidth: "260px", borderRadius: "12px", display: "inline-block", border: "2px solid rgba(128,128,128,0.2)" } }));
        if (m.type === "file") return h("div", { key: i, style: { margin: "10px 0", textAlign: m.user === name ? "right" : "left" } },
          h("div", { style: { fontSize: "13px", color: colorFor(m.user), marginBottom: "4px" } }, m.user),
          h("a", { href: m.src, download: m.name, style: { display: "inline-block", padding: "10px 14px", borderRadius: "12px", background: otherBg, color: theme.fg, textDecoration: "none", fontSize: "13px" } },
            "\uD83D\uDCCE " + (m.name || "文件") + (m.size ? " (" + fmtSize(m.size) + ")" : "")));
        var mine = m.user === name;
        return h("div", { key: i, style: { margin: "10px 0", textAlign: mine ? "right" : "left" } },
          h("div", { style: { fontSize: "13px", color: m.agent ? "#10a37f" : colorFor(m.user), marginBottom: "4px" } }, m.user),
          h("span", { style: { display: "inline-block", maxWidth: "78%", padding: "11px 15px", borderRadius: "14px", background: m.agent ? "rgba(16,163,127,0.18)" : (mine ? selfBg : otherBg), color: mine || m.agent ? theme.fg : theme.fg, wordBreak: "break-word", textAlign: "left", fontSize: "15px", lineHeight: "1.5" } }, m.text));
      }

      // Full-screen panel with solid dark background (clean, no bleed-through)
      var panelBg = "#1a1a1a";

      return h("div", {
        style: {
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 99999,
          display: "flex", flexDirection: "column",
          background: panelBg, color: "#e5e5e5",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif", overflow: "hidden"
        }
      },
        // Subtle wallpaper tint in message area only (not full background)
        null,
        // Header
        h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #333", background: "#1a1a1a" } },
          h("div", { style: { display: "flex", alignItems: "center", gap: "12px" } },
            h("button", {
              onClick: function () { setPanelOpen(false); localStorage.setItem(PANEL_KEY, "0"); },
              title: "返回主界面 (ESC)",
              style: { background: "rgba(255,255,255,0.1)", border: "none", color: theme.fg, fontSize: "16px", cursor: "pointer", padding: "6px 12px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "6px" }
            }, "← 返回"),
            h("span", { style: { fontSize: "18px", fontWeight: 600 } }, "\uD83E\uDD1D 团队聊天")
          ),
          h("div", { style: { display: "flex", alignItems: "center", gap: "12px" } },
            h("span", { style: { fontSize: "12px", opacity: 0.6 } }, "ESC 退出"),
            h("button", {
              onClick: function () { setPanelOpen(false); localStorage.setItem(PANEL_KEY, "0"); },
              style: { background: "none", border: "none", color: theme.fg, opacity: 0.6, fontSize: "22px", cursor: "pointer" }
            }, "\u2715")
          )
        ),
        // Connection bar
        h("div", { style: { display: "flex", gap: "8px", padding: "8px 14px", borderBottom: "1px solid #333", alignItems: "center", flexWrap: "wrap", background: "#222" } },
          h("input", { value: wsUrl, onChange: function (e) { setWsUrl(e.target.value); localStorage.setItem(WS_KEY, e.target.value); }, placeholder: "ws://host:port", style: Object.assign({}, inputStyle, { flex: "1 1 200px", fontSize: "13px", padding: "8px 10px" }) }),
          h("input", { value: name, onChange: function (e) { setName(e.target.value); localStorage.setItem(NAME_KEY, e.target.value); }, placeholder: "昵称", style: Object.assign({}, inputStyle, { flex: "1 1 120px", fontSize: "13px", padding: "8px 10px" }) }),
          h("button", { onClick: connected ? disconnect : connect, style: Object.assign({}, btnStyle, { background: connected ? "#c0392b" : "#10a37f", whiteSpace: "nowrap" }) }, connected ? "断开" : "连接"),
          h("span", { style: { fontSize: "12px", color: connected ? "#3fd17a" : "#e74c3c" } }, connected ? "● " + currentRoom : "○ 未连接")
        ),
        // Body: room list + chat
        h("div", { style: { flex: 1, display: "flex", minHeight: 0, background: "#1a1a1a" } },
          // Room list
          h("div", { style: { width: "180px", borderRight: "1px solid #333", overflowY: "auto", padding: "10px 8px", flexShrink: 0, background: "#111" } },
            rooms.map(function (r, i) {
              var active = r === currentRoom;
              return h("div", {
                key: i, onClick: function () { switchRoom(r); },
                style: { padding: "9px 10px", borderRadius: "8px", cursor: "pointer", marginBottom: "4px", fontSize: "13px", background: active ? "rgba(16,163,127,0.25)" : "transparent", color: theme.fg }
              }, "# " + r);
            }),
            h("div", { onClick: createRoom, style: { padding: "9px 10px", borderRadius: "8px", cursor: "pointer", marginTop: "6px", fontSize: "13px", color: "#10a37f" } }, "+ 新建房间")
          ),
          // Chat column
          h("div", { style: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 } },
            h("div", { ref: logRef, style: { flex: 1, overflowY: "auto", padding: "16px 18px", fontSize: "15px", lineHeight: "1.6", background: msgAreaBg, borderRadius: "8px", margin: "6px 8px" } },
              messages.map(renderMsg)
            ),
            // Input row
            h("div", { style: { position: "relative", display: "flex", gap: "6px", padding: "12px 14px", borderTop: "1px solid #333", alignItems: "center", background: "#222" } },
              h("input", { ref: fileRef, type: "file", style: { display: "none" }, onChange: function (e) { var f = e.target.files && e.target.files[0]; if (f) sendFile(f.type.indexOf("image") === 0 ? "image" : "file", f); e.target.value = ""; } }),
              // Emoji popover
              emojiOpen ? h("div", {
                style: { position: "absolute", bottom: "58px", left: "14px", background: "#2a2a2a", border: "1px solid #444", borderRadius: "10px", padding: "8px", display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "2px", maxWidth: "320px", zIndex: 10 },
                onClick: function (e) { e.stopPropagation(); }
              },
                EMOJIS.map(function (em, i) { return h("span", { key: i, onClick: function () { setInput(input + em); setEmojiOpen(false); }, style: { cursor: "pointer", fontSize: "20px", padding: "4px", textAlign: "center", borderRadius: "4px" } }, em); })
              ) : null,
              h("button", { onClick: function () { setEmojiOpen(!emojiOpen); }, title: "表情", style: { background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: theme.fg, flexShrink: 0 } }, "\uD83D\uDE00"),
              h("button", { onClick: function () { if (fileRef.current) { fileRef.current.accept = "image/*"; fileRef.current.click(); } }, title: "图片", style: { background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.fg, flexShrink: 0 } }, "\uD83D\uDDBC"),
              h("button", { onClick: function () { if (fileRef.current) { fileRef.current.accept = "*/*"; fileRef.current.click(); } }, title: "文件", style: { background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: theme.fg, flexShrink: 0 } }, "\uD83D\uDCCE"),
              h("input", {
                value: input, onChange: function (e) { setInput(e.target.value); },
                onKeyDown: function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } },
                placeholder: agentMode ? "问我的智能体…" : "输入消息，回车发送…",
                style: Object.assign({}, inputStyle, { flex: 1 })
              }),
              h("label", { style: { display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: theme.fg, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 },
                onClick: function (e) { e.stopPropagation(); } },
                h("input", { type: "checkbox", checked: agentMode, onChange: function (e) { setAgentMode(e.target.checked); } }), "问智能体"
              ),
              h("button", { onClick: send, style: btnStyle }, "发送")
            )
          )
        )
      );
    }

    var inject = ["slots"];

    function TeamChatLauncher() {
      return h("button", {
        onClick: togglePanel, title: "团队聊天",
        style: { position: "fixed", bottom: "12px", right: "12px", zIndex: 99999, width: "44px", height: "44px", borderRadius: "50%", border: "none", background: "rgba(20,20,20,0.85)", color: "#fff", fontSize: "20px", cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }
      }, "\uD83E\uDD1D");
    }

    function apply(ctx) {
      ctxRef = ctx;
      var registered = false;
      try {
        ctx.slots.register({ name: "sidebar.footer.action", id: "team-chat-action", inject: function () { return {}; } }, TeamChatSidebarButton);
        registered = true;
      } catch (e) { console.warn("[team-chat] sidebar action skipped:", e); }

      if (!registered) {
        ctx.slots.inject("shell.overlay", function () {
          return ctx.slots.register({ name: "shell.overlay", id: "team-chat-launcher", inject: function () { return {}; } }, TeamChatLauncher);
        });
      }

      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register({ name: "shell.overlay", id: "team-chat", inject: function () { return {}; } }, TeamChat);
      });
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});

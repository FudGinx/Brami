// Брами та дворики: статична гра + кімнати через WebSocket.
// Господар веде партію у своєму браузері; сервер пересилає повідомлення
// і зберігає останній стан кімнати, щоб господар і гості могли перепідключитися.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const INDEX = fs.readFileSync(path.join(__dirname, "public", "index.html"));
const ART = path.join(__dirname, "public", "art");
const MIME = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json; charset=utf-8" };
const ROOM_TTL = 45 * 60 * 1000; // кімната живе 45 хв без господаря

const server = http.createServer((req, res) => {
  if (req.url === "/health") { res.writeHead(200); return res.end("ok"); }
  if (req.url.startsWith("/art/")) {
    const rel = decodeURIComponent(req.url.split("?")[0].slice(5));
    const file = path.normalize(path.join(ART, rel));
    if (!file.startsWith(ART + path.sep)) { res.writeHead(403); return res.end(); }
    return fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
      // браузер щоразу перепитує сервер (304, якщо файл той самий) — старі картинки не застрягають у кеші
      const tag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
      const head = { "Cache-Control": "no-cache", ETag: tag, "Last-Modified": st.mtime.toUTCString() };
      if (req.headers["if-none-match"] === tag) { res.writeHead(304, head); return res.end(); }
      fs.readFile(file, (e2, buf) => {
        if (e2) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { ...head, "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        res.end(buf);
      });
    });
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(INDEX);
});

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 1024 * 1024 });
// code -> { hostTok, host, guests: Map(tok -> ws|null), names: Map(tok -> name), state, full, awaySince }
const rooms = new Map();
const ABC = "abcdefghjkmnpqrstuvwxyz23456789";
const rnd = n => Array.from({ length: n }, () => ABC[Math.floor(Math.random() * ABC.length)]).join("");
const send = (ws, m) => { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); } catch (e) {} };
const tokOf = t => String(t || "").replace(/[^a-z0-9]/gi, "").slice(0, 40) || rnd(16);
const toGuests = (r, m) => r.guests.forEach(g => send(g, m));

wss.on("connection", ws => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", raw => {
    let d; try { d = JSON.parse(raw); } catch (e) { return; }
    if (!d || typeof d !== "object") return;

    if (d.t === "host") {
      const tok = tokOf(d.tok);
      const want = String(d.code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      let r = want && rooms.get(want);
      if (r && r.hostTok === tok) {               // господар повертається
        if (r.host && r.host !== ws) try { r.host.close(); } catch (e) {}
        r.host = ws; r.awaySince = 0; ws.room = want; ws.role = "host"; ws.tok = tok;
        send(ws, { t: "hosted", code: want, resume: true, full: r.full || null, lobby: r.lobby || null });
        r.guests.forEach((g, gt) => { if (g && g.readyState === 1) send(ws, { t: "hello", from: gt, name: r.names.get(gt) || "" }); });
        toGuests(r, { t: "hostback" });
        return;
      }
      let code = want && !rooms.has(want) ? want : null; // після перезапуску сервера господар відновлює свою кімнату
      if (!code) do { code = rnd(4); } while (rooms.has(code));
      rooms.set(code, { hostTok: tok, host: ws, guests: new Map(), names: new Map(), state: null, full: null, lobby: null, awaySince: 0 });
      ws.room = code; ws.role = "host"; ws.tok = tok;
      return send(ws, { t: "hosted", code });
    }

    if (d.t === "join") {
      const code = String(d.code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const r = rooms.get(code);
      if (!r) return send(ws, { t: "nf" });
      const tok = tokOf(d.tok), name = String(d.name || "").slice(0, 16);
      const old = r.guests.get(tok); if (old && old !== ws) try { old.close(); } catch (e) {}
      r.guests.set(tok, ws); r.names.set(tok, name); ws.room = code; ws.role = "guest"; ws.tok = tok;
      send(ws, { t: "joined", id: tok });
      if (r.state) send(ws, { t: "state", data: r.state });
      if (r.host && r.host.readyState === 1) send(r.host, { t: "hello", from: tok, name });
      else send(ws, { t: "hostaway" });
      return;
    }

    const r = rooms.get(ws.room); if (!r) return;
    if (ws.role === "host" && r.host === ws) {
      if (d.t === "state") { r.state = d.data; if (d.full) r.full = d.full; if (d.data && d.data.lobby) r.lobby = d.data.lobby; toGuests(r, { t: "state", data: d.data }); }
      if (d.t === "to") send(r.guests.get(d.to), d.data);
      if (d.t === "close") { toGuests(r, { t: "hostgone" }); rooms.delete(ws.room); }
    } else if (ws.role === "guest" && d.t === "move") {
      if (r.host && r.host.readyState === 1) send(r.host, { t: "move", from: ws.tok, m: d.m });
      else send(ws, { t: "hostaway" });
    }
  });
  ws.on("close", () => {
    const r = rooms.get(ws.room); if (!r) return;
    if (ws.role === "host" && r.host === ws) { r.host = null; r.awaySince = Date.now(); toGuests(r, { t: "hostaway" }); }
    else if (ws.role === "guest" && r.guests.get(ws.tok) === ws) { r.guests.set(ws.tok, null); send(r.host, { t: "left", from: ws.tok }); }
  });
});

setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); });
  const now = Date.now();
  rooms.forEach((r, code) => { if (!r.host && r.awaySince && now - r.awaySince > ROOM_TTL) { toGuests(r, { t: "hostgone" }); rooms.delete(code); } });
}, 30000);
server.listen(PORT, () => console.log("Брами та дворики: порт " + PORT));

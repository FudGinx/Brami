// Брами та дворики: статична гра + кімнати через WebSocket.
// Господар кімнати веде партію у своєму браузері; сервер лише пересилає повідомлення.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const INDEX = fs.readFileSync(path.join(__dirname, "public", "index.html"));

const ART = path.join(__dirname, "public", "art");
const MIME = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json; charset=utf-8" };
const server = http.createServer((req, res) => {
  if (req.url === "/health") { res.writeHead(200); return res.end("ok"); }
  if (req.url.startsWith("/art/")) {
    const rel = decodeURIComponent(req.url.split("?")[0].slice(5));
    const file = path.normalize(path.join(ART, rel));
    if (!file.startsWith(ART + path.sep)) { res.writeHead(403); return res.end(); }
    return fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": rel === "manifest.json" ? "no-cache" : "public, max-age=86400" });
      res.end(buf);
    });
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(INDEX);
});

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 256 * 1024 });
const rooms = new Map(); // code -> { host, guests: Map(id -> ws) }
const ABC = "abcdefghjkmnpqrstuvwxyz23456789";
const rnd = n => Array.from({ length: n }, () => ABC[Math.floor(Math.random() * ABC.length)]).join("");
const send = (ws, m) => { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); } catch (e) {} };

wss.on("connection", ws => {
  ws.id = rnd(10);
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", raw => {
    let d; try { d = JSON.parse(raw); } catch (e) { return; }
    if (!d || typeof d !== "object") return;
    if (d.t === "host") {
      let code; do { code = rnd(4); } while (rooms.has(code));
      rooms.set(code, { host: ws, guests: new Map() });
      ws.room = code; ws.role = "host";
      return send(ws, { t: "hosted", code });
    }
    if (d.t === "join") {
      const code = String(d.code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const r = rooms.get(code);
      if (!r) return send(ws, { t: "nf" });
      r.guests.set(ws.id, ws); ws.room = code; ws.role = "guest";
      send(ws, { t: "joined", id: ws.id });
      return send(r.host, { t: "hello", from: ws.id, name: String(d.name || "").slice(0, 16) });
    }
    const r = rooms.get(ws.room); if (!r) return;
    if (ws.role === "host") {
      if (d.t === "state") r.guests.forEach(g => send(g, { t: "state", data: d.data }));
      if (d.t === "to") send(r.guests.get(d.to), d.data);
    } else if (ws.role === "guest" && d.t === "move") {
      send(r.host, { t: "move", from: ws.id, m: d.m });
    }
  });
  ws.on("close", () => {
    const r = rooms.get(ws.room); if (!r) return;
    if (ws.role === "host") { r.guests.forEach(g => send(g, { t: "hostgone" })); rooms.delete(ws.room); }
    else { r.guests.delete(ws.id); send(r.host, { t: "left", from: ws.id }); }
  });
});

setInterval(() => wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }), 30000);
server.listen(PORT, () => console.log("Брами та дворики: порт " + PORT));

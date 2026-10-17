// Servidor: Express (REST + frontend compilado) y WebSocket (juego en tiempo real).
// Con DB_HOST o DATABASE_URL guarda todo en MySQL; sin ellos funciona solo en memoria.
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { NOOP_STORE, Room, studentMsg, teacherMsg } from "./game.js";
import { createStore, dbConfigured, poolFromEnv } from "./db.js";

const PORT = process.env.PORT || 3000;
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const rooms = new Map();
const teacherTokens = new Set();

// ----- base de datos (opcional) -----
let store = NOOP_STORE;
if (dbConfigured()) {
  try {
    store = createStore(await poolFromEnv(), { ttlDays: Number(process.env.ROOM_TTL_DAYS) || 7 });
    for (const room of await store.load()) rooms.set(room.code, room);
    console.log(`MySQL conectado: ${rooms.size} sala(s) recuperada(s)`);
  } catch (e) {
    console.error("✘ No se pudo usar MySQL:", e.message);
    console.error("  ¿Ejecutaste `npm run db:init` y revisaste el archivo .env?");
    process.exit(1);
  }
} else {
  console.log("Sin base de datos: el estado vive en memoria (define DB_HOST en .env para guardar en MySQL).");
}

// ----- REST -----
const app = express();
app.use(express.json());
app.use((req, res, next) => { res.set("Access-Control-Allow-Origin", "*"); res.set("Access-Control-Allow-Headers", "Content-Type, Authorization"); res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); if (req.method === "OPTIONS") return res.sendStatus(204); next(); });

app.get("/api/health", (req, res) => res.json({ ok: true, db: store.enabled, rooms: rooms.size }));

app.post("/api/teacher/login", (req, res) => {
  const { email, password } = req.body || {};
  const expectedEmail = process.env.TEACHER_EMAIL;
  const expectedPassword = process.env.TEACHER_PASSWORD;
  if (!expectedEmail || !expectedPassword) return res.status(503).json({ error: "El acceso docente no está configurado en el servidor." });
  const emailOk = typeof email === "string" && email.trim().toLowerCase() === expectedEmail.trim().toLowerCase();
  const suppliedPassword = Buffer.from(typeof password === "string" ? password : "");
  const configuredPassword = Buffer.from(expectedPassword);
  const passwordOk = suppliedPassword.length === configuredPassword.length && crypto.timingSafeEqual(suppliedPassword, configuredPassword);
  if (!emailOk || !passwordOk) return res.status(401).json({ error: "Correo o contraseña incorrectos." });
  const token = crypto.randomBytes(32).toString("base64url");
  teacherTokens.add(token);
  res.json({ token });
});

app.post("/api/rooms", (req, res) => {
  const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || !teacherTokens.has(token)) return res.status(401).json({ error: "Inicia sesión como docente para crear una sala." });
  if (rooms.size > 200) return res.status(429).json({ error: "Demasiadas salas activas" });
  let code;
  do { code = Array.from({ length: 4 }, () => LETTERS[crypto.randomInt(LETTERS.length)]).join(""); } while (rooms.has(code));
  const room = new Room(code, crypto.randomBytes(6).toString("base64url"), { store });
  rooms.set(code, room);
  res.json({ code, key: room.key });
});

app.get("/api/rooms/:code", (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: "Sala no encontrada" });
  res.json({ code: room.code, locked: room.locked });
});

// CSV con los resultados de la sala (solo con la llave del docente): /api/rooms/ABCD/export.csv?key=...
app.get("/api/rooms/:code/export.csv", (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room || req.query.key !== room.key) return res.status(403).send("No autorizado");
  const esc = (v) => `"${(/^[=+\-@\t\r]/.test(String(v)) ? "'" : "") + String(v).replace(/"/g, '""')}"`; // evita inyección de fórmulas
  const lines = ["nombre,puntos,tiros,resueltos,niveles_creados",
    ...room.teacherView().players.map((p) => [esc(p.name), p.score, p.shots, p.solved, p.created].join(","))];
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sala-${room.code}.csv"` })
    .send("\ufeff" + lines.join("\n"));
});

// Sirve el frontend compilado (npm run build) desde el mismo servidor
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client", "dist");
if (fs.existsSync(dist)) app.use(express.static(dist));

// ----- WebSocket -----
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");
  const m = url.pathname.match(/^\/ws\/([^/]+)$/);
  if (!m) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => onConnect(ws, m[1].toUpperCase(), url.searchParams));
});

function onConnect(ws, code, q) {
  const room = rooms.get(code);
  if (!room) return ws.close(4404);
  const role = q.get("role") || "student";
  let player = null;

  if (role === "teacher") {
    if (q.get("key") !== room.key) return ws.close(4403);
    room.teachers.add(ws);
  } else {
    const name = (q.get("name") || "").trim().slice(0, 20);
    if (!name || name === "Docente" || (room.locked && !room.players.has(name))) return ws.close(4403);
    player = room.getPlayer(name);
    player.ws = ws;
  }
  room.broadcast();

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== "object") return;
    try {
      player ? studentMsg(room, player, ws, msg) : teacherMsg(room, msg);
    } catch (err) {
      console.error("Error procesando mensaje:", err);
    }
  });

  ws.on("close", () => {
    room.teachers.delete(ws);
    if (player && player.ws === ws) player.ws = null;
    room.broadcast();
  });
}

server.listen(PORT, "0.0.0.0", () => console.log(`Mini Golf Parabólico en http://localhost:${PORT}`));

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => { server.close(); await store.close(); process.exit(0); });
}

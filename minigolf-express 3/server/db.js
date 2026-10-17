// Persistencia en MySQL/MariaDB. Escritura "write-through": el juego corre en memoria (rápido)
// y cada cambio se encola y se guarda en orden. Al arrancar, las salas se reconstruyen desde la BD.
import { hydrate, setCounters } from "./game.js";

const b = (v) => (v ? 1 : 0);
const dec = (v) => Math.max(-99.9, Math.min(99.9, v)); // columnas DECIMAL(3,1)

export const dbConfigured = (env = process.env) => Boolean(env.DATABASE_URL || env.DB_HOST);

export async function poolFromEnv(env = process.env) {
  const mysql = (await import("mysql2/promise")).default;
  if (env.DATABASE_URL) return mysql.createPool(env.DATABASE_URL);
  return mysql.createPool({
    host: env.DB_HOST, port: Number(env.DB_PORT) || 3306, user: env.DB_USER || "root",
    password: env.DB_PASSWORD || "", database: env.DB_NAME || "minigolf",
    waitForConnections: true, connectionLimit: 5, charset: "utf8mb4",
  });
}

export function createStore(pool, { ttlDays = 7 } = {}) {
  let chain = Promise.resolve();
  // Cola serial: garantiza el orden (jugador antes que su progreso, nivel antes que sus obstáculos).
  const run = (fn) => { chain = chain.then(fn).catch((e) => console.error("[db]", e.code ?? "", e.message)); };
  const ex = (sql, params = []) => pool.execute(sql, params);

  return {
    enabled: true,

    roomCreated: (room) => run(() => ex(
      "INSERT INTO rooms (id, code, teacher_key, locked, creating_open, moderate) VALUES (?, ?, ?, ?, ?, ?)",
      [room.id, room.code, room.key, b(room.locked), b(room.creating), b(room.moderate)])),

    roomUpdated: (room) => run(() => ex(
      "UPDATE rooms SET locked = ?, creating_open = ?, moderate = ?, featured_level_id = ? WHERE id = ?",
      [b(room.locked), b(room.creating), b(room.moderate), room.featured ?? null, room.id])),

    // "Nueva ronda": borra niveles (y por cascada obstáculos, progreso, calificaciones y tiros)
    roomReset: (room) => run(async () => {
      await ex("UPDATE rooms SET featured_level_id = NULL WHERE id = ?", [room.id]);
      await ex("DELETE FROM shots WHERE room_id = ?", [room.id]);
      await ex("DELETE FROM levels WHERE room_id = ?", [room.id]);
    }),

    playerAdded: (room, p) => run(() => ex(
      "INSERT INTO players (id, room_id, name) VALUES (?, ?, ?)", [p.id, room.id, p.name])),

    levelAdded: (room, lv) => run(async () => {
      await ex(
        `INSERT INTO levels (id, room_id, author_player_id, title, tee, hole, builtin, status, n_solutions, difficulty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [lv.id, room.id, lv.authorId ?? null, lv.title, lv.tee, lv.hole, b(lv.builtin), lv.status, lv.nSol, lv.difficulty]);
      for (const r of lv.rects) {
        await ex("INSERT INTO level_rects (level_id, x0, y0, x1, y1) VALUES (?, ?, ?, ?, ?)", [lv.id, ...r]);
      }
    }),

    levelStatus: (lv) => run(() => ex("UPDATE levels SET status = ? WHERE id = ?", [lv.status, lv.id])),

    progress: (p, lv, pr) => run(() => ex(
      `INSERT INTO player_levels (player_id, level_id, shots, solved, points, equation_ok, rated, sol_h, sol_k)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE shots = VALUES(shots), solved = VALUES(solved), points = VALUES(points),
         equation_ok = VALUES(equation_ok), rated = VALUES(rated), sol_h = VALUES(sol_h), sol_k = VALUES(sol_k)`,
      [p.id, lv.id, pr.shots, b(pr.solved), pr.points, b(pr.eq), b(pr.rated), pr.sol?.[0] ?? null, pr.sol?.[1] ?? null])),

    shot: (room, p, lv, h, k, result) => run(() => ex(
      "INSERT INTO shots (room_id, player_id, level_id, h, k, result) VALUES (?, ?, ?, ?, ?, ?)",
      [room.id, p.id, lv.id, dec(h), dec(k), result])),

    rating: (lv, p, stars, diff) => run(() => ex(
      `INSERT INTO ratings (level_id, player_id, stars, difficulty_vote) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE stars = VALUES(stars), difficulty_vote = VALUES(difficulty_vote)`,
      [lv.id, p.id, stars, diff])),

    // Al arrancar: borra salas viejas y reconstruye las demás.
    async load() {
      await pool.query("DELETE FROM rooms WHERE created_at < NOW() - INTERVAL ? DAY", [ttlDays]);
      const q = async (sql) => (await pool.query(sql))[0];
      const [rooms, players, levels, rects, progress, ratings, errors, [max]] = await Promise.all([
        q("SELECT * FROM rooms"), q("SELECT id, room_id, name FROM players ORDER BY id"),
        q("SELECT * FROM levels ORDER BY id"), q("SELECT level_id, x0, y0, x1, y1 FROM level_rects ORDER BY id"),
        q("SELECT * FROM player_levels"),
        q("SELECT level_id, player_id, stars, difficulty_vote FROM ratings ORDER BY id"),
        q("SELECT room_id, result, COUNT(*) AS total FROM shots GROUP BY room_id, result"),
        q(`SELECT (SELECT COALESCE(MAX(id), 0) FROM rooms) AS room, (SELECT COALESCE(MAX(id), 0) FROM players) AS player,
                  (SELECT COALESCE(MAX(id), 0) FROM levels) AS level`),
      ]);
      setCounters({ room: Number(max.room), player: Number(max.player), level: Number(max.level) });

      const levelRoom = new Map(levels.map((l) => [l.id, l.room_id]));
      const playerRoom = new Map(players.map((p) => [p.id, p.room_id]));
      return rooms.map((r) => hydrate({
        room: r,
        players: players.filter((p) => p.room_id === r.id),
        levels: levels.filter((l) => l.room_id === r.id),
        rects: rects.filter((x) => levelRoom.get(x.level_id) === r.id),
        progress: progress.filter((g) => playerRoom.get(g.player_id) === r.id),
        ratings: ratings.filter((x) => levelRoom.get(x.level_id) === r.id),
        errors: errors.filter((e) => e.room_id === r.id),
      }, this));
    },

    ping: () => pool.query("SELECT 1"),
    async close() { await chain; await pool.end(); },
  };
}

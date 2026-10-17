// Lógica del juego: salas, puntos, niveles, calificaciones.
// No depende de Express, ws ni MySQL: la persistencia entra por el objeto `store` (ver db.js).
import * as ph from "./physics.js";

export const RESULTS = ["hole", "short", "long", "wall", "out", "invalid"];
export const MAX_LEVELS_PER_PLAYER = 3;

const SEEDS = [ // niveles del docente: progresivos y ligados a las parábolas
  { title: "1. Calentamiento parabólico", tee: 3, hole: 15, rects: [] },
  { title: "2. Salta el muro", tee: 2, hole: 14, rects: [[7, 0, 8, 5]] },
  { title: "3. Túnel de precisión", tee: 2, hole: 16, rects: [[7, 0, 8, 5], [9, 8, 12, 10]] },
  { title: "4. Doble obstáculo", tee: 2, hole: 16, rects: [[5, 0, 6, 3], [10, 0, 11, 4]] },
  { title: "5. La escalera", tee: 3, hole: 17, rects: [[5, 0, 6, 3], [8, 4, 9, 7], [12, 0, 13, 2]] },
  { title: "6. Puente elevado", tee: 2, hole: 18, rects: [[6, 0, 7, 4], [9, 7, 13, 8], [14, 0, 15, 3]] },
  { title: "7. Zigzag imposible", tee: 2, hole: 16, rects: [[4, 0, 5, 3], [8, 5, 9, 8], [12, 0, 13, 4]] },
  { title: "8. Maestría del vértice", tee: 1, hole: 19, rects: [[4, 0, 5, 4], [7, 6, 10, 7], [12, 0, 13, 5], [15, 7, 17, 8]] },
];

const blank = () => ({ shots: 0, solved: false, points: 0, eq: false, rated: false, sol: null });
const emptyErrors = () => Object.fromEntries(RESULTS.map((r) => [r, 0]));

// Ids únicos globales: se asignan aquí (no en la BD) para no esperar un INSERT.
const counters = { room: 0, player: 0, level: 0 };
export const setCounters = (c) => Object.assign(counters, c);
const nextId = (kind) => ++counters[kind];

// Store sin base de datos (estado solo en memoria). db.js implementa los mismos métodos con MySQL.
const noop = () => {};
export const NOOP_STORE = {
  enabled: false, roomCreated: noop, roomUpdated: noop, roomReset: noop, playerAdded: noop,
  levelAdded: noop, levelStatus: noop, progress: noop, shot: noop, rating: noop, close: async () => {},
};

export function send(ws, payload) {
  try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload)); } catch { /* conexión caída */ }
}

export class Player {
  constructor(name, id = nextId("player")) { this.id = id; this.name = name; this.ws = null; this.progress = new Map(); }
  prog(levelId) {
    if (!this.progress.has(levelId)) this.progress.set(levelId, blank());
    return this.progress.get(levelId);
  }
}

export class Room {
  constructor(code, key, { store = NOOP_STORE, id = null, seed = true } = {}) {
    this.id = id ?? nextId("room"); this.code = code; this.key = key; this.store = store;
    this.players = new Map(); this.teachers = new Set();
    this.locked = false; this.creating = true; this.moderate = false;
    this.levels = new Map(); this.featured = null; this.errors = emptyErrors();
    if (seed) { store.roomCreated(this); this.seedLevels(); }
  }

  seedLevels() {
    for (const s of SEEDS) this.addLevel("Docente", ph.cleanLevel(s).level, { builtin: true });
  }

  reset() {
    this.levels = new Map(); this.featured = null; this.errors = emptyErrors();
    for (const p of this.players.values()) p.progress = new Map();
    this.store.roomReset(this);
    this.seedLevels();
  }

  getPlayer(name) {
    let p = this.players.get(name);
    if (!p) { p = new Player(name); this.players.set(name, p); this.store.playerAdded(this, p); }
    return p;
  }

  addLevel(author, clean, { builtin = false, status = "approved", n = null, authorId = null } = {}) {
    const id = nextId("level");
    n = n ?? ph.solutions(clean).length;
    const lv = { ...clean, id, author, authorId, builtin, status, nSol: n, difficulty: ph.difficulty(n),
      ratings: [], attempts: new Set(), solvers: new Set() };
    this.levels.set(id, lv);
    this.store.levelAdded(this, lv);
    return lv;
  }

  visible(p, lid) {
    const lv = this.levels.get(Number(lid));
    return lv && (lv.status === "approved" || lv.author === p.name) ? lv : null;
  }

  creatorPoints(name) {
    let total = 0;
    for (const lv of this.levels.values()) {
      if (lv.author !== name || lv.builtin || lv.status !== "approved") continue;
      const solvers = lv.solvers.size, tries = lv.attempts.size;
      total += Math.min(10 * solvers, 100);                              // 10 por compañero que lo resuelve
      if (tries >= 3 && solvers / tries >= 0.3 && solvers / tries <= 0.8) total += 30; // dificultad equilibrada
    }
    return total;
  }

  score(p) {
    let s = this.creatorPoints(p.name);
    for (const pr of p.progress.values()) s += pr.points;
    return s;
  }

  stars(lv) {
    const r = lv.ratings;
    return r.length ? Math.round((r.reduce((a, x) => a + x.stars, 0) / r.length) * 10) / 10 : null;
  }

  pub(lv, p) {
    const pr = p.progress.get(lv.id) ?? blank();
    const { shots, solved, eq, rated, points } = pr;
    return {
      id: lv.id, title: lv.title, author: lv.author, tee: lv.tee, hole: lv.hole, rects: lv.rects,
      difficulty: lv.difficulty, status: lv.status, mine: lv.author === p.name, featured: this.featured === lv.id,
      stars: this.stars(lv), votes: lv.ratings.length, my: { shots, solved, eq, rated, points },
    };
  }

  studentView(p) {
    const levels = [...this.levels.values()]
      .filter((lv) => lv.status === "approved" || lv.author === p.name)
      .map((lv) => this.pub(lv, p))
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.id - b.id);
    const top = [...this.players.values()].sort((a, b) => this.score(b) - this.score(a)).slice(0, 5);
    return {
      type: "state", levels, creating: this.creating,
      you: {
        name: p.name, score: this.score(p),
        solved: [...p.progress.values()].filter((pr) => pr.solved).length,
        created: [...this.levels.values()].filter((lv) => lv.author === p.name).length,
      },
      top: top.map((q) => ({ name: q.name, score: this.score(q) })),
    };
  }

  teacherView() {
    const levels = [...this.levels.values()].map((lv) => {
      const votes = { easy: 0, fair: 0, impossible: 0 };
      for (const r of lv.ratings) votes[r.diff]++;
      return {
        id: lv.id, title: lv.title, author: lv.author, status: lv.status, difficulty: lv.difficulty,
        n_sol: lv.nSol, builtin: lv.builtin, attempts: lv.attempts.size, solvers: lv.solvers.size,
        stars: this.stars(lv), votes, featured: this.featured === lv.id,
      };
    });
    const players = [...this.players.values()].sort((a, b) => this.score(b) - this.score(a)).map((p) => ({
      name: p.name, online: p.ws !== null, score: this.score(p),
      shots: [...p.progress.values()].reduce((a, pr) => a + pr.shots, 0),
      solved: [...p.progress.values()].filter((pr) => pr.solved).length,
      created: [...this.levels.values()].filter((lv) => lv.author === p.name).length,
    }));
    return { type: "teacher", code: this.code, locked: this.locked, creating: this.creating,
      moderate: this.moderate, errors: this.errors, levels, players };
  }

  broadcast() {
    for (const t of this.teachers) send(t, this.teacherView());
    for (const p of this.players.values()) if (p.ws) send(p.ws, this.studentView(p));
  }
}

// Reconstruye una sala desde las filas de la BD (db.js las agrupa por sala).
export function hydrate({ room: r, players, levels, rects, progress, ratings, errors }, store) {
  const room = new Room(r.code, r.teacher_key, { store, id: r.id, seed: false });
  room.locked = Boolean(r.locked); room.creating = Boolean(r.creating_open); room.moderate = Boolean(r.moderate);
  room.featured = r.featured_level_id ?? null;
  for (const e of errors) if (e.result in room.errors) room.errors[e.result] = Number(e.total);

  const byId = new Map();
  for (const row of players) {
    const p = new Player(row.name, row.id);
    room.players.set(p.name, p); byId.set(p.id, p);
  }
  for (const l of levels) {
    const author = l.builtin ? "Docente" : byId.get(l.author_player_id)?.name ?? "Docente";
    room.levels.set(l.id, {
      id: l.id, title: l.title, tee: l.tee, hole: l.hole, rects: [], author, authorId: l.author_player_id ?? null,
      builtin: Boolean(l.builtin), status: l.status, nSol: l.n_solutions, difficulty: l.difficulty,
      ratings: [], attempts: new Set(), solvers: new Set(),
    });
  }
  for (const x of rects) room.levels.get(x.level_id)?.rects.push([Number(x.x0), Number(x.y0), Number(x.x1), Number(x.y1)]);
  for (const g of progress) {
    const p = byId.get(g.player_id), lv = room.levels.get(g.level_id);
    if (!p || !lv) continue;
    p.progress.set(lv.id, {
      shots: g.shots, solved: Boolean(g.solved), points: g.points, eq: Boolean(g.equation_ok), rated: Boolean(g.rated),
      sol: g.sol_h == null ? null : [Number(g.sol_h), Number(g.sol_k)],
    });
    if (g.shots > 0) lv.attempts.add(p.name);
    if (g.solved) lv.solvers.add(p.name);
  }
  for (const x of ratings) {
    const lv = room.levels.get(x.level_id);
    if (lv) lv.ratings.push({ stars: x.stars, diff: x.difficulty_vote, by: byId.get(x.player_id)?.name ?? "" });
  }
  return room;
}

// ----- mensajes del estudiante -----
export function studentMsg(room, p, ws, msg) {
  const kind = msg.type;

  if (kind === "shoot") {
    const lv = room.visible(p, msg.level);
    const h = ph.snap(Number(msg.h)), k = ph.snap(Number(msg.k));
    if (!lv || !Number.isFinite(h) || !Number.isFinite(k)) return;
    const res = ph.simulate(lv, h, k);
    const pr = p.prog(lv.id);
    room.errors[res.result]++;
    room.store.shot(room, p, lv, h, k, res.result);
    let pts = 0;
    if (lv.author !== p.name && !pr.solved && res.result !== "invalid") {
      pr.shots++;
      lv.attempts.add(p.name);
      if (res.result === "hole") {
        Object.assign(pr, { solved: true, sol: [h, k], points: Math.max(10, 100 - 15 * (pr.shots - 1)) });
        lv.solvers.add(p.name);
        pts = pr.points;
      }
      room.store.progress(p, lv, pr);
    }
    send(ws, { type: "shot", level: lv.id, ...res, shots: pr.shots, points: pts, solved: pr.solved });
    room.broadcast();

  } else if (kind === "test") { // probar un nivel borrador en el editor (no guarda nada)
    const { level, error } = ph.cleanLevel(msg.level);
    if (error) return send(ws, { type: "shot", level: "draft", result: "invalid", path: [], hit: null, land: null, error });
    const h = ph.snap(Number(msg.h)), k = ph.snap(Number(msg.k));
    if (!Number.isFinite(h) || !Number.isFinite(k)) return;
    send(ws, { type: "shot", level: "draft", ...ph.simulate(level, h, k), shots: 0, points: 0, solved: false });

  } else if (kind === "equation") {
    const lv = room.visible(p, msg.level);
    const pr = lv && p.progress.get(lv.id);
    if (!pr || !pr.solved || pr.eq || lv.author === p.name) return;
    const aTrue = ph.coef(lv.tee, ...pr.sol);
    const a = ph.parseNum(msg.a);
    const ok = Number.isFinite(a) && Math.abs(a - aTrue) <= 0.02;
    if (ok) { pr.eq = true; pr.points += 30; room.store.progress(p, lv, pr); }
    send(ws, { type: "equation", level: lv.id, ok, a: ok ? Math.round(aTrue * 1000) / 1000 : null,
      hint: ok ? null : "Pasa por (tee, 0): 0 = a(tee − h)² + k, así que a = −k / (tee − h)²." });
    room.broadcast();

  } else if (kind === "publish") {
    const mine = [...room.levels.values()].filter((lv) => lv.author === p.name).length;
    let clean, error;
    if (!room.creating) error = "El docente cerró la creación de niveles.";
    else if (mine >= MAX_LEVELS_PER_PLAYER) error = `Máximo ${MAX_LEVELS_PER_PLAYER} niveles por estudiante.`;
    else ({ level: clean, error } = ph.cleanLevel(msg.level));
    if (error) return send(ws, { type: "published", ok: false, error });
    const n = ph.solutions(clean).length;
    if (n === 0) {
      return send(ws, { type: "published", ok: false, error: "Ese nivel no tiene solución. Prueba quitando o moviendo obstáculos." });
    }
    const lv = room.addLevel(p.name, clean, { status: room.moderate ? "pending" : "approved", n, authorId: p.id });
    send(ws, { type: "published", ok: true, id: lv.id, status: lv.status, difficulty: lv.difficulty, solutions: n });
    room.broadcast();

  } else if (kind === "rate") {
    const lv = room.visible(p, msg.level);
    const pr = lv && p.progress.get(lv.id);
    const { stars, diff } = msg;
    if (pr && pr.solved && !pr.rated && lv.author !== p.name
        && Number.isInteger(stars) && stars >= 1 && stars <= 5 && ["easy", "fair", "impossible"].includes(diff)) {
      lv.ratings.push({ stars, diff, by: p.name });
      pr.rated = true;
      room.store.rating(lv, p, stars, diff);
      room.store.progress(p, lv, pr);
      room.broadcast();
    }
  }
}

// ----- mensajes del docente -----
export function teacherMsg(room, msg) {
  const { type: kind, value: val } = msg;
  if (kind === "lock") { room.locked = Boolean(val); room.store.roomUpdated(room); }
  else if (kind === "creating") { room.creating = Boolean(val); room.store.roomUpdated(room); }
  else if (kind === "moderate") { room.moderate = Boolean(val); room.store.roomUpdated(room); }
  else if (kind === "reset") room.reset();
  else if (["approve", "hide", "feature"].includes(kind)) {
    const lv = Number.isInteger(val) ? room.levels.get(val) : null;
    if (kind === "feature" && val == null) { room.featured = null; room.store.roomUpdated(room); }
    else if (lv) {
      if (kind === "approve") { lv.status = "approved"; room.store.levelStatus(lv); }
      else if (kind === "hide") {
        lv.status = "hidden"; room.store.levelStatus(lv);
        if (room.featured === lv.id) { room.featured = null; room.store.roomUpdated(room); }
      } else if (lv.status === "approved") { room.featured = lv.id; room.store.roomUpdated(room); }
    }
  }
  room.broadcast();
}

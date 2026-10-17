// Física del mini golf parabólico (sin dependencias).
// El tiro es f(x) = a(x - h)^2 + k que pasa por el tee (tee, 0).
// El jugador elige el vértice (h, k): a = -k / (tee - h)^2 y la pelota aterriza en 2h - tee
// (el reflejo del tee respecto al eje de simetría).

export const W = 20, H = 12;     // tamaño del campo
export const HOLE_R = 0.6;       // radio del hoyo
export const STEP = 0.5;         // cuadrícula de vértices y obstáculos
export const MAX_RECTS = 4;

export const snap = (v) => Math.round(v / STEP) * STEP;
export const coef = (tee, h, k) => -k / (tee - h) ** 2;

// Acepta "-0.5", "-1/8" y comas decimales. Devuelve NaN si no es un número.
export function parseNum(s) {
  s = String(s ?? "").trim().replace(",", ".").replace("−", "-");
  if (!s) return NaN;
  if (s.includes("/")) {
    const [n, ...d] = s.split("/");
    return Number(n) / Number(d.join("/"));
  }
  return Number(s);
}

const inside = (x, y, r) => r[0] <= x && x <= r[2] && r[1] <= y && y <= r[3];
const r2 = (v) => Math.round(v * 100) / 100;

// Simula un tiro. result: hole | short | long | wall | out | invalid
export function simulate(level, h, k) {
  const { tee, hole, rects } = level;
  if (!(h >= 0 && h <= W && k > 0 && k <= H) || Math.abs(h - tee) < 1e-9) {
    return { result: "invalid", path: [], hit: null, land: null };
  }
  const a = coef(tee, h, k);
  const land = 2 * h - tee;
  const n = Math.max(Math.floor(Math.abs(land - tee) / 0.1), Math.floor(40 * k), 20); // muestreo fino
  const full = [];
  let hit = null;
  for (let i = 0; i <= n; i++) {
    const x = tee + ((land - tee) * i) / n;
    const y = Math.max(0, a * (x - h) ** 2 + k);
    full.push([x, y]);
    if (i && rects.some((r) => inside(x, y, r))) { hit = [x, y]; break; }
  }
  const stride = Math.max(1, Math.floor(full.length / 120));
  const path = full.filter((_, i) => i % stride === 0).map(([x, y]) => [r2(x), r2(y)]);
  const last = full[full.length - 1];
  const end = [r2(last[0]), r2(last[1])];
  const lp = path[path.length - 1];
  if (lp[0] !== end[0] || lp[1] !== end[1]) path.push(end);

  const out = { path, hit: null, land: r2(land) };
  if (hit) return { ...out, result: "wall", hit: [r2(hit[0]), r2(hit[1])] };
  if (land < 0 || land > W) return { ...out, result: "out" };
  if (Math.abs(land - hole) <= HOLE_R + 1e-9) return { ...out, result: "hole" };
  const sign = hole > tee ? 1 : -1;
  return { ...out, result: (land - tee) * sign < Math.abs(hole - tee) ? "short" : "long" };
}

// Todos los vértices (h, k) de la cuadrícula que resuelven el nivel.
export function solutions(level) {
  const { tee, hole } = level;
  const found = [];
  for (let h = 0; h <= W; h += STEP) {
    if (Math.abs(2 * h - tee - hole) <= HOLE_R + 1e-9 && Math.abs(h - tee) > 1e-9) {
      for (let k = STEP; k <= H - STEP; k += STEP) {
        if (simulate(level, h, k).result === "hole") found.push([h, k]);
      }
    }
  }
  return found;
}

export const difficulty = (n) => (n <= 3 ? "dificil" : n <= 8 ? "media" : "facil");

// Valida un nivel enviado por un estudiante. Devuelve { level } o { error }.
export function cleanLevel(d) {
  if (!d || typeof d !== "object") return { error: "Datos de nivel inválidos." };
  const title = String(d.title || "Mi hoyo").trim().slice(0, 30) || "Mi hoyo";
  const tee = Math.trunc(Number(d.tee)), hole = Math.trunc(Number(d.hole));
  const raw = Array.isArray(d.rects) ? d.rects : [];
  const rects = raw.map((r) => (Array.isArray(r) ? r.map((v) => snap(Number(v))) : null));
  if (!Number.isFinite(tee) || !Number.isFinite(hole)) return { error: "Datos de nivel inválidos." };
  if (!(tee >= 1 && tee <= 19 && hole >= 1 && hole <= 19) || Math.abs(tee - hole) < 3) {
    return { error: "El tee y el hoyo van entre 1 y 19, separados al menos 3 unidades." };
  }
  if (rects.length > MAX_RECTS) return { error: `Máximo ${MAX_RECTS} obstáculos.` };
  for (const r of rects) {
    if (!r || r.length !== 4 || r.some((v) => !Number.isFinite(v))) return { error: "Obstáculo inválido." };
    const [x0, y0, x1, y1] = r;
    if (!(x0 >= 0 && x0 < x1 && x1 <= W && y0 >= 0 && y0 < y1 && y1 <= H)) {
      return { error: "Un obstáculo queda fuera del campo." };
    }
    if (y0 === 0 && [tee, hole].some((p) => x0 <= p + HOLE_R && x1 >= p - HOLE_R)) {
      return { error: "Un obstáculo tapa el tee o el hoyo." };
    }
  }
  return { level: { title, tee, hole, rects } };
}

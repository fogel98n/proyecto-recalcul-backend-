import { useEffect, useRef, useState } from "react";

// Campo de juego: x de 0 a 20, y de 0 a 12 (unidades), 40 px por unidad.
const X0 = -0.5, X1 = 20.5, Y0 = -1, Y1 = 12.5, S = 40;
const W = (X1 - X0) * S, H = (Y1 - Y0) * S;
const sx = (x) => (x - X0) * S;
const sy = (y) => H - (y - Y0) * S;
export const snap = (v) => Math.round(v * 2) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function Field({ level, vertex, onVertex, shot }) {
  const { tee, hole, rects } = level;
  const [trail, setTrail] = useState([]);
  const raf = useRef();

  // Anima la pelota a lo largo de la trayectoria que calculó el servidor.
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (!shot || !shot.path?.length) { setTrail([]); return; }
    let i = 0;
    const step = () => {
      i = Math.min(i + 2, shot.path.length - 1);
      setTrail(shot.path.slice(0, i + 1));
      if (i < shot.path.length - 1) raf.current = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(raf.current);
  }, [shot]);

  const drag = (e) => {
    if (!onVertex) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = X0 + ((e.clientX - r.left) / r.width) * (X1 - X0);
    const y = Y1 - ((e.clientY - r.top) / r.height) * (Y1 - Y0);
    onVertex({ h: clamp(snap(x), 0, 20), k: clamp(snap(y), 0.5, 11.5) });
  };

  // Vista previa de la parábola: pasa por el tee y tiene su vértice en (h, k).
  let preview = null;
  if (vertex && vertex.h !== tee) {
    const c = vertex.k / (tee - vertex.h) ** 2, land = 2 * vertex.h - tee;
    preview = Array.from({ length: 81 }, (_, i) => {
      const x = tee + ((land - tee) * i) / 80;
      return `${i ? "L" : "M"}${sx(x).toFixed(1)} ${sy(Math.max(0, vertex.k - c * (x - vertex.h) ** 2)).toFixed(1)}`;
    }).join("");
  }
  const ball = trail[trail.length - 1];
  const end = shot?.path?.length && trail.length === shot.path.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`field ${onVertex ? "pickable" : ""}`}
      onPointerDown={drag} onPointerMove={(e) => e.buttons === 1 && drag(e)}>
      <rect width={W} height={H} fill="#cfe8f7" />
      <rect x={0} y={sy(0)} width={W} height={H - sy(0)} fill="#5aa469" />
      {Array.from({ length: 21 }, (_, x) => (
        <line key={"x" + x} x1={sx(x)} x2={sx(x)} y1={0} y2={sy(0)} stroke="#fff" strokeOpacity={x % 5 ? 0.25 : 0.7} />
      ))}
      {Array.from({ length: 13 }, (_, y) => (
        <line key={"y" + y} x1={0} x2={W} y1={sy(y)} y2={sy(y)} stroke="#fff" strokeOpacity={y % 5 ? 0.25 : 0.7} />
      ))}
      {[0, 5, 10, 15, 20].map((x) => <text key={"t" + x} x={sx(x)} y={sy(0) + 20} textAnchor="middle" className="tick">{x}</text>)}

      {rects.map((r, i) => (
        <rect key={i} x={sx(r[0])} y={sy(r[3])} width={(r[2] - r[0]) * S} height={(r[3] - r[1]) * S} fill="#7a5c3a" stroke="#4d3a24" strokeWidth={2} />
      ))}

      <ellipse cx={sx(hole)} cy={sy(0)} rx={0.6 * S} ry={8} fill="#1d2b1f" />
      <line x1={sx(hole)} x2={sx(hole)} y1={sy(0)} y2={sy(0) - 70} stroke="#14213d" strokeWidth={3} />
      <path d={`M${sx(hole)} ${sy(0) - 70}l32 12l-32 12z`} fill="#e07a1f" />
      <circle cx={sx(tee)} cy={sy(0)} r={7} fill="#fff" stroke="#14213d" strokeWidth={2} />
      <text x={sx(tee)} y={sy(0) - 14} textAnchor="middle" className="lbl">SALIDA</text>

      {vertex && (
        <g>
          <line x1={sx(vertex.h)} x2={sx(vertex.h)} y1={0} y2={sy(0)} stroke="#e07a1f" strokeWidth={2.5} strokeDasharray="8 6" />
          <text x={sx(vertex.h) + 8} y={20} fill="#a64f06" className="lbl">eje x = {vertex.h}</text>
          {preview && <path d={preview} fill="none" stroke="#14213d" strokeWidth={3} strokeDasharray="4 7" opacity={0.7} />}
          <circle cx={sx(vertex.h)} cy={sy(vertex.k)} r={9} fill="#e07a1f" stroke="#fff" strokeWidth={2} />
          {vertex.h !== tee && <circle cx={sx(2 * vertex.h - tee)} cy={sy(0)} r={8} fill="none" stroke="#2a6f97" strokeWidth={3} />}
        </g>
      )}

      {trail.length > 1 && (
        <path d={trail.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join("")}
          fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" />
      )}
      {ball && <circle cx={sx(ball[0])} cy={sy(ball[1])} r={9} fill="#fff" stroke="#14213d" strokeWidth={3} />}
      {end && shot.hit && <text x={sx(shot.hit[0])} y={sy(shot.hit[1]) - 14} textAnchor="middle" fontSize={34}>💥</text>}
      {end && shot.result === "hole" && <text x={sx(hole)} y={sy(0) - 90} textAnchor="middle" fontSize={34}>🎉</text>}
    </svg>
  );
}

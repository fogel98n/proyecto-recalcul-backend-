import { useState } from "react";
import Field from "./Field.jsx";

export const DIFF = { facil: " Fácil", media: " Media", dificil: "Difícil" };
const fmt = (n) => String(Math.round(n * 1000) / 1000).replace("-", "−");
const Stars = ({ v }) => (v ? `${"★".repeat(Math.round(v))}${"☆".repeat(5 - Math.round(v))} ${v}` : "sin votos");

function describe(s) {
  if (s.result === "hole") return ` ¡Hoyo!${s.points ? ` +${s.points} puntos` : ""}`;
  if (s.result === "short") return `Se quedó corto: aterrizó en x = ${s.land}.`;
  if (s.result === "long") return `Se pasó: aterrizó en x = ${s.land}.`;
  if (s.result === "wall") return ` Chocó con un obstáculo en (${s.hit[0]}, ${s.hit[1]}). Cambia la altura k.`;
  if (s.result === "out") return `Se salió del campo (aterrizaje en x = ${s.land}).`;
  return "Tiro inválido: el vértice no puede estar sobre la salida.";
}

function Hole({ level, send, last }) {
  const [v, setV] = useState({ h: 10, k: 6 });
  const [eq, setEq] = useState("");
  const [stars, setStars] = useState(0);
  const [diff, setDiff] = useState("fair");
  const shot = last.shot?.level === level.id ? last.shot : null;
  const eqr = last.equation?.level === level.id ? last.equation : null;
  const ok = v.h !== level.tee;
  const a = ok ? -v.k / (level.tee - v.h) ** 2 : null;
  const my = level.my;

  return (
    <div className="card hole">
      <h2>{level.featured && "📌 "}{level.title} <small>por {level.mine ? "ti" : level.author} · {DIFF[level.difficulty]}</small></h2>
      <Field level={level} vertex={v} onVertex={setV} shot={shot} />
      <div className="readout">
        <p className="formula">
          {ok ? `f(x) = ${fmt(a)}(x − ${v.h})² + ${v.k}` : "Mueve el vértice (no sobre el tee)"}
        </p>
        <div className="transform-note">
          <b>Transformaciones de la parábola</b>
          <span><b>h = {fmt(v.h)}:</b> mueve el vértice a izquierda o derecha.</span>
          <span><b>k = {fmt(v.k)}:</b> cambia la altura del vértice.</span>
          <span><b>a = {ok ? fmt(a) : "—"}:</b> determina la apertura y orientación. En este juego se calcula para que la pelota pase por la salida.</span>
        </div>
        <p className="small">
          Arrastra el punto naranja (vértice) y observa la transformación de la función. La parábola pasa por la salida y aterriza en x = 2h − {level.tee} = <b>{2 * v.h - level.tee}</b>
          {" "}(el reflejo del tee respecto al eje). El hoyo está en x = {level.hole}.
        </p>
        <button className="shoot-button" disabled={!ok} onClick={() => send({ type: "shoot", level: level.id, h: v.h, k: v.k })}>Tirar</button>
        {my.shots > 0 && !level.mine && <span className="small"> Tiros: {my.shots}</span>}
        {level.mine && <span className="small"> Es tu nivel: puedes probarlo, pero no suma puntos.</span>}
      </div>
      {shot && <p className={shot.result === "hole" ? "good" : "hint"}>{describe(shot)}</p>}

    </div>
  );
}

export default function Play({ data, send, last }) {
  const [sel, setSel] = useState(null);
  const levels = data.levels;
  const cur = levels.find((l) => l.id === sel) || levels[0];
  return (
    <div className="split play">
      {cur && <Hole key={cur.id} level={cur} send={send} last={last} />}
      <aside className="card list level-list">
        <div className="level-list-heading"><h3>🏁 Niveles</h3><span>{levels.length} desafíos</span></div>
        <p className="small">Supera cada recorrido usando las transformaciones de la parábola.</p>
        {levels.map((l, index) => (
          <button key={l.id} className={`lv ${l.id === cur?.id ? "on" : ""} ${l.my.solved ? "solved" : ""}`} onClick={() => setSel(l.id)}>
            <span className="lv-top"><span className={`lv-number lv-color-${index % 4}`}>{String(index + 1).padStart(2, "0")}</span><span className="lv-title"><b>{l.featured && "📌 "}{l.title.replace(/^\d+\. /, "")}{l.my.solved ? " ✔" : ""}</b><small>{l.mine ? "Creado por ti" : l.author}</small></span><span className="lv-arrow">{l.my.solved ? "✓" : "↗"}</span></span>
            <span className="lv-bottom"><small>{DIFF[l.difficulty]}</small><small><Stars v={l.stars} /></small></span>
          </button>
        ))}
      </aside>
    </div>
  );
}

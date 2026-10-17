import { useState } from "react";
import Field from "./Field.jsx";
import { DIFF } from "./Play.jsx";

const NEW = { wall: { x: 8, w: 1, y0: 0, y1: 5 }, ceiling: { x: 8, w: 3, y0: 8, y1: 10 } };
const toRects = (obs) => obs.map((o) => [o.x, o.y0, Math.min(20, o.x + o.w), o.y1]);

function Slider({ label, value, min, max, step = 0.5, onChange }) {
  return (
    <label className="slider">
      <span>{label}: <b>{value}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

export default function Editor({ data, send, last }) {
  const [title, setTitle] = useState("Mi hoyo");
  const [tee, setTee] = useState(3);
  const [hole, setHole] = useState(15);
  const [obs, setObs] = useState([{ ...NEW.wall }]);
  const [v, setV] = useState({ h: 9, k: 7 });

  const level = { tee, hole, rects: toRects(obs) };
  const test = last.shot?.level === "draft" ? last.shot : null;
  const pub = last.published;
  const upd = (i, patch) => setObs(obs.map((o, j) => {
    if (j !== i) return o;
    const n = { ...o, ...patch };
    n.w = Math.min(n.w, 20 - n.x);
    if (n.y1 <= n.y0) n.y1 = n.y0 + 0.5;
    return n;
  }));
  const payload = { title, tee, hole, rects: level.rects };

  if (!data.creating) return <div className="card"><p>El docente cerró la creación de niveles por ahora.</p></div>;

  return (
    <div className="split play">
      <div className="card">
        <h2>🛠️ Diseña tu hoyo parabólico</h2>
        <p className="transform-intro">Aplica las transformaciones de la función cuadrática <b>f(x) = a(x − h)² + k</b>: cambia la posición del vértice y comprueba cómo modifica la trayectoria.</p>
        <Field level={level} vertex={v} onVertex={setV} shot={test} />
        <p className="small">Arrastra el vértice naranja para observar el desplazamiento horizontal (h) y vertical (k). Antes de publicar, el servidor comprueba que tu nivel tenga solución.</p>
        <div className="row">
          <button onClick={() => send({ type: "test", level: payload, h: v.h, k: v.k })}>▶ Probar tiro</button>
          <button className="ghost" onClick={() => send({ type: "publish", level: payload })}>📤 Publicar nivel</button>
        </div>
        {test && <p className={test.result === "hole" ? "good" : "hint"}>{test.error || `Resultado: ${test.result}`}</p>}
        {pub && (pub.ok
          ? <p className="good">✔ Publicado ({DIFF[pub.difficulty]}, {pub.solutions} soluciones){pub.status === "pending" ? " · espera la aprobación del docente" : ""}</p>
          : <p className="hint">❌ {pub.error}</p>)}
      </div>

      <aside className="card list">
        <h3>Piezas</h3>
        <input value={title} maxLength={30} onChange={(e) => setTitle(e.target.value)} placeholder="Título" />
        <Slider label="Salida (x)" value={tee} min={1} max={19} step={1} onChange={setTee} />
        <Slider label="Hoyo (x)" value={hole} min={1} max={19} step={1} onChange={setHole} />
        {obs.map((o, i) => (
          <div key={i} className="obs">
            <b>Obstáculo {i + 1}</b>
            <Slider label="x" value={o.x} min={0} max={19.5} onChange={(x) => upd(i, { x })} />
            <Slider label="ancho" value={o.w} min={0.5} max={20} onChange={(w) => upd(i, { w })} />
            <Slider label="desde y" value={o.y0} min={0} max={11.5} onChange={(y0) => upd(i, { y0 })} />
            <Slider label="hasta y" value={o.y1} min={0.5} max={12} onChange={(y1) => upd(i, { y1 })} />
            <button className="ghost" onClick={() => setObs(obs.filter((_, j) => j !== i))}>Quitar</button>
          </div>
        ))}
        {obs.length < 4 && (
          <div className="row">
            <button className="ghost" onClick={() => setObs([...obs, { ...NEW.wall }])}>+ Muro</button>
            <button className="ghost" onClick={() => setObs([...obs, { ...NEW.ceiling }])}>+ Techo</button>
          </div>
        )}
      </aside>
    </div>
  );
}

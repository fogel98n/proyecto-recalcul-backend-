import { useEffect, useState } from "react";
import { useRoom } from "./api.js";
import Play from "./Play.jsx";
import Editor from "./Editor.jsx";

export default function Student({ session, onExit }) {
  const { data, event, online, error, send } = useRoom({ code: session.code, role: "student", name: session.name });
  const [tab, setTab] = useState("play");
  const [last, setLast] = useState({});

  // Guarda el último evento de cada tipo (shot, equation, published).
  useEffect(() => { if (event) setLast((l) => ({ ...l, [event.type]: event })); }, [event]);

  if (error) return <main className="app center"><p>No se pudo entrar: la sala no existe o está cerrada.</p><button onClick={onExit}>Volver</button></main>;
  if (!data) return <main className="app center"><p>Conectando…</p></main>;

  return (
    <main className="app">
      <header className="bar">
        <div><b>{data.you.name}</b> · sala {session.code} {!online && <span className="off">sin conexión…</span>}</div>
        <nav className="tabs">
          <button className={tab === "play" ? "on" : ""} onClick={() => setTab("play")}>⛳ Jugar</button>
        </nav>
        <div className="score">⭐ {data.you.score}</div>
      </header>
      {tab === "play" ? <Play data={data} send={send} last={last} /> : <Editor data={data} send={send} last={last} />}
      <aside className="card board">
        <h3>🏆 Top 5</h3>
        <ol>{data.top.map((t) => <li key={t.name}><span>{t.name}</span><b>{t.score}</b></li>)}</ol>
        <p className="small">Resueltos: {data.you.solved} · Creados: {data.you.created}</p>
      </aside>
      <button className="link exit-button" onClick={onExit}>Salir</button>
    </main>
  );
}

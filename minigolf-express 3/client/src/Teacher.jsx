import { useRoom } from "./api.js";
import { DIFF } from "./Play.jsx";

const ERR = { hole: " Hoyos", wall: " Choques", short: "↙ Cortos", long: "↗ Pasados", out: "Fuera" };

export default function Teacher({ session, onExit }) {
  const { data, online, error, send } = useRoom({ code: session.code, role: "teacher", key: session.key });
  if (error) return <main className="app center"><p>Sala no disponible (el servidor pudo reiniciarse).</p><button onClick={onExit}>Volver</button></main>;
  if (!data) return <main className="app center"><p>Conectando…</p></main>;
  const toggle = (type, value) => send({ type, value: !value });

  return (
    <main className="app wide">
      <header className="bar teacher">
        <div>
          <small>Código de la sala</small>
          <div className="code">{data.code}</div>
          <small>{location.origin}/?code={data.code}</small>
        </div>
        <div className="actions">
          <span>{online ? "🟢 en línea" : "🔴 reconectando…"} · {data.players.length} estudiantes</span>
          <button className="ghost" onClick={() => toggle("lock", data.locked)}>{data.locked ? "🔓 Abrir entrada" : "🔒 Cerrar entrada"}</button>
          <button className="ghost" onClick={() => toggle("creating", data.creating)}>{data.creating ? "🛠️ Cerrar creación" : "🛠️ Abrir creación"}</button>
          <button className="ghost" onClick={() => toggle("moderate", data.moderate)}>{data.moderate ? "👁️ Moderación: SÍ" : "👁️ Moderación: NO"}</button>
          <button className="ghost" onClick={() => confirm("¿Nueva ronda? Se borran niveles de estudiantes y progreso.") && send({ type: "reset" })}>🔄 Nueva ronda</button>
          <button className="link" onClick={onExit}>Salir</button>
        </div>
      </header>

      <section className="stats">
        {Object.entries(ERR).map(([k, label]) => (
          <div key={k} className="card stat"><small>{label}</small><b>{data.errors[k]}</b></div>
        ))}
      </section>
      <p className="small">Mapa de errores: muchos choques = les falta pensar la altura k; muchos cortos/pasados = no usan bien el eje (h).</p>

      <section className="card">
        <h3>Niveles</h3>
        <table className="roster">
          <thead><tr><th>Título</th><th>Autor</th><th>Dificultad</th><th>Soluc.</th><th>Intentaron</th><th>Resolvieron</th><th>★</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {data.levels.map((l) => (
              <tr key={l.id} className={l.status === "hidden" ? "away" : ""}>
                <td>{l.featured && "📌 "}{l.title}</td><td>{l.author}</td><td>{DIFF[l.difficulty]}</td><td>{l.n_sol}</td>
                <td>{l.attempts}</td><td>{l.solvers}</td>
                <td>{l.stars ?? "—"} <small>({l.votes.easy}/{l.votes.fair}/{l.votes.impossible})</small></td>
                <td>{l.status === "pending" ? "⏳ pendiente" : l.status === "hidden" ? "oculto" : "visible"}</td>
                <td className="acts">
                  {l.status !== "approved" && <button onClick={() => send({ type: "approve", value: l.id })}>Aprobar</button>}
                  {l.status === "approved" && <button className="ghost" onClick={() => send({ type: "feature", value: l.featured ? null : l.id })}>{l.featured ? "Quitar 📌" : "Hoyo del día"}</button>}
                  {l.status !== "hidden" && !l.builtin && <button className="ghost" onClick={() => send({ type: "hide", value: l.id })}>Ocultar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small">Votos de dificultad: (muy fácil / justo / imposible)</p>
      </section>

      <section className="card">
        <h3>Estudiantes</h3>
        <table className="roster">
          <thead><tr><th>Nombre</th><th>Puntos</th><th>Tiros</th><th>Resueltos</th><th>Niveles creados</th></tr></thead>
          <tbody>
            {data.players.map((p) => (
              <tr key={p.name} className={p.online ? "" : "away"}>
                <td>{p.name}</td><td><b>{p.score}</b></td><td>{p.shots}</td><td>{p.solved}</td><td>{p.created}</td>
              </tr>
            ))}
            {!data.players.length && <tr><td colSpan={5}>Esperando estudiantes…</td></tr>}
          </tbody>
        </table>
      </section>
    </main>
  );
}

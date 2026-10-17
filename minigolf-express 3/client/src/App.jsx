import { useState } from "react";
import { createRoom, roomExists, teacherLogin } from "./api.js";
import Student from "./Student.jsx";
import Teacher from "./Teacher.jsx";

const load = () => { try { return JSON.parse(sessionStorage.getItem("mg-session")); } catch { return null; } };

function Brand() {
  return <div className="brand"><div className="brand-mark">⛳</div><div><b>PARABOLAB</b><span>FUNCIONES CUADRÁTICAS</span></div></div>;
}

export default function App() {
  const [session, setSession] = useState(load);
  const [mode, setMode] = useState(new URLSearchParams(location.search).has("code") ? "student" : "teacher");
  const [code, setCode] = useState(new URLSearchParams(location.search).get("code") || "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const save = (s) => { s ? sessionStorage.setItem("mg-session", JSON.stringify(s)) : sessionStorage.removeItem("mg-session"); setSession(s); };
  const join = async (e) => {
    e?.preventDefault(); const c = code.trim().toUpperCase();
    if (!c || !name.trim()) return setErr("Ingresa el código de la partida y tu nombre.");
    setBusy(true); setErr("");
    try { if (await roomExists(c)) save({ role: "student", code: c, name: name.trim() }); else setErr("No encontramos esa sala. Revisa el código e inténtalo de nuevo."); }
    catch { setErr("No se pudo conectar con el servidor. Inténtalo otra vez."); }
    finally { setBusy(false); }
  };
  const login = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { const { token } = await teacherLogin(email, password); save({ role: "teacherLogin", token }); }
    catch (e) { setErr(e.message || "No se pudo iniciar sesión."); }
    finally { setBusy(false); }
  };
  const create = async () => { setBusy(true); setErr(""); try { save({ role: "teacher", ...(await createRoom(session.token)) }); } catch (e) { setErr(e.message || "No se pudo crear la sala."); } finally { setBusy(false); } };

  if (session?.role === "student") return <Student session={session} onExit={() => save(null)} />;
  if (session?.role === "teacher") return <Teacher session={session} onExit={() => save(null)} />;
  if (session?.role === "teacherLogin") return <main className="app teacher-home"><header className="topbar"><Brand/><button className="button-quiet" onClick={() => save(null)}>Cerrar sesión</button></header><section className="welcome teacher-welcome"><div><span className="eyebrow">PANEL DEL PROFESOR</span><h1>¡Bienvenido!<br/><em>Preparemos la partida.</em></h1><p>Crea una sala y comparte el código con tus estudiantes para practicar funciones cuadráticas y sus transformaciones jugando.</p><button className="button-primary" disabled={busy} onClick={create}>{busy ? "Creando sala…" : "＋ Crear partida"}</button>{err && <p className="error-message">{err}</p>}</div><div className="math-card"><span className="math-icon">⛳</span><div className="math-equation">f(x) = a(x − h)² + k</div><p><b>h:</b> desplazamiento horizontal</p><p><b>k:</b> desplazamiento vertical</p><p><b>a:</b> apertura y orientación de la parábola</p></div></section></main>;

  return <main className="login-page"><div className="login-visual"><Brand/><div className="visual-copy"><span className="eyebrow">APRENDER NUNCA FUE TAN DIVERTIDO</span><h1>Las mates<br/>se juegan<br/><em>aquí.</em></h1><p>Explora cómo cambian las parábolas al transformar sus funciones y supera cada hoyo.</p><div className="visual-equation">y = a(x − h)² + k</div></div><div className="visual-footer">✦ EXPLORA · RESUELVE · SUPERA TU RÉCORD</div></div><div className="login-panel"><div className="login-box"><div className="mobile-brand"><Brand/></div><div className="login-tabs"><button className={mode === "teacher" ? "selected" : ""} onClick={() => {setMode("teacher");setErr("")}}>Soy profesor</button><button className={mode === "student" ? "selected" : ""} onClick={() => {setMode("student");setErr("")}}>Soy estudiante</button></div>{mode === "teacher" ? <><div className="login-heading"><span className="eyebrow">BIENVENIDO DE VUELTA</span><h2>Entra a tu aula</h2><p>Inicia sesión para preparar tu próxima partida.</p></div><form onSubmit={login} className="login-form"><label>Correo del profesor<input type="email" placeholder="profe@colegio.com" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required/></label><label>Contraseña<input type="password" placeholder="Ingresa tu contraseña" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/></label><button className="button-primary full" disabled={busy}>{busy ? "Verificando…" : "Iniciar sesión  →"}</button></form></> : <><div className="login-heading"><span className="eyebrow">¡LA PARTIDA TE ESPERA!</span><h2>Únete a tu clase</h2><p>Pídele el código de acceso a tu profesor.</p></div><form onSubmit={join} className="login-form"><label>Código de la partida<input className="code-input" placeholder="ABCD" value={code} maxLength={4} onChange={e => setCode(e.target.value.toUpperCase())} required/></label><label>¿Cómo te llamas?<input placeholder="Tu nombre o apodo" value={name} maxLength={20} onChange={e => setName(e.target.value)} required/></label><button className="button-primary full" disabled={busy}>{busy ? "Entrando…" : "¡Vamos a jugar!  →"}</button></form></>}{err && <p className="error-message">{err}</p>}<p className="login-note">⛳ <span>Mini golf parabólico · Matemáticas con otra perspectiva</span></p></div></div></main>;
}

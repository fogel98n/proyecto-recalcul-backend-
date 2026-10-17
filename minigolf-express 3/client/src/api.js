import { useCallback, useEffect, useRef, useState } from "react";

export async function teacherLogin(email, password) {
  const r = await fetch("/api/teacher/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "No se pudo iniciar sesión.");
  return data;
}

export async function createRoom(token) {
  const r = await fetch("/api/rooms", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "No se pudo crear la sala");
  return data;
}

export async function roomExists(code) {
  const r = await fetch(`/api/rooms/${code.toUpperCase()}`);
  return r.ok;
}

// WebSocket con reconexión automática (el servidor conserva el progreso por nombre).
// "state" y "teacher" son el estado completo; el resto (shot, equation, published) son eventos.
export function useRoom({ code, role, name = "", key = "" }) {
  const [data, setData] = useState(null);
  const [event, setEvent] = useState(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => {
    let closed = false, retry = 0, timer;
    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const qs = new URLSearchParams({ role, name, key });
      const ws = new WebSocket(`${proto}://${location.host}/ws/${code}?${qs}`);
      wsRef.current = ws;
      ws.onopen = () => { retry = 0; setOnline(true); };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === "state" || m.type === "teacher") setData(m);
        else setEvent({ ...m, at: Date.now() });
      };
      ws.onclose = (e) => {
        setOnline(false);
        if (e.code >= 4000) return setError(e.code);
        if (!closed) timer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 8000));
      };
    };
    connect();
    return () => { closed = true; clearTimeout(timer); wsRef.current?.close(); };
  }, [code, role, name, key]);

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify(msg));
  }, []);

  return { data, event, online, error, send };
}

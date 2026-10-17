# ⛳ Parabolab — Mini Golf Parabólico (React + Express)

Juego en vivo para un salón de clases sobre **eje de simetría, modelos cuadráticos y transformaciones de funciones**.

## Relación con el tema de matemáticas
El proyecto practica **funciones cuadráticas y transformaciones de funciones** mediante la forma de vértice `f(x) = a(x − h)² + k`:
- `h` representa el desplazamiento horizontal y determina el eje de simetría `x = h`.
- `k` representa el desplazamiento vertical y fija la altura del vértice.
- `a` determina la orientación y la apertura de la parábola. En la simulación se calcula a partir de la salida y del vértice para que la trayectoria pase por la salida; por eso no se modifica de manera independiente.

## Cómo se juega
- El jugador arrastra el **vértice** (h, k) de la parábola. La curva pasa siempre por el tee, así que
  `f(x) = a(x − h)² + k` con `a = −k / (tee − h)²`, y la pelota aterriza en `2h − tee`: **el reflejo del tee respecto al eje de simetría**.
- Para meter el hoyo hay que poner el eje en el punto medio (h) y elegir una altura (k) que esquive los obstáculos.
- **Bono de ecuación (+30):** tras meter el hoyo, el estudiante escribe el valor de `a` de su tiro (acepta fracciones como `-7/36`).
- **Crear:** cada estudiante diseña hasta 3 hoyos; el servidor comprueba que tengan solución y calcula su dificultad.
- **Calificar:** quien resuelve un nivel le da 1–5 estrellas y lo marca fácil / justo / imposible.
- **Puntos:** jugador = `max(10, 100 − 15·(tiros−1))` por hoyo; creador = 10 por cada compañero que lo resuelve (máx. 100) + 30 si la dificultad es equilibrada (resuelve entre 30 % y 80 % de quienes lo intentan, con mínimo 3 intentos).

## Panel del profesor
El panel inicial es sencillo: iniciar sesión y crear una partida. Dentro de la sala, el profesor ve el código para compartir, controla la entrada y la creación de niveles, y puede moderar los hoyos y consultar los resultados del grupo.

## Estructura
```
server/
  index.js    Express (REST + frontend) y WebSocket (ws); carga las salas desde MySQL al arrancar
  game.js     reglas: salas, puntos, niveles, calificaciones (no depende de red ni BD)
  physics.js  simulación del tiro y verificador de niveles
  db.js       persistencia MySQL (escritura en cola + recarga de salas)
  migrate.js  crea la base y las tablas (npm run db:init)
database/schema.sql   tablas, vistas (ranking, estadísticas, mapa de errores) - idempotente
client/       React + Vite (el frontend)
.env.example  configuración de puerto y base de datos
```

## Backend y base de datos
```bash
npm install
cp .env.example .env        # ajusta DB_USER, DB_PASSWORD y credenciales del profesor
npm run db:init             # crea la base "minigolf" y las tablas (se puede repetir sin riesgo)
npm run dev                 # servidor en :3000 (y React en :5173)
```
- **Con `DB_HOST` en `.env`:** todo se guarda en MySQL. Si reinicias el servidor, las salas, estudiantes, niveles,
  progreso y calificaciones se recuperan solos. Las salas con más de `ROOM_TTL_DAYS` días (7 por defecto) se borran al arrancar.
- **Sin `DB_HOST`:** funciona igual, pero solo en memoria.
- **Acceso docente:** configura `TEACHER_EMAIL` y `TEACHER_PASSWORD` en `.env` antes de arrancar. La pantalla inicial tiene inicio de sesión para el profesor y acceso separado para estudiantes. La creación de salas exige un token emitido tras iniciar sesión. Cambia la contraseña de ejemplo antes de usarlo.
- El juego corre en memoria (rápido) y cada cambio se encola y se guarda en orden; si MySQL falla, el error sale en consola y la partida sigue.

### API REST
| Método | Ruta | Para qué |
|---|---|---|
| GET | `/api/health` | `{ ok, db, rooms }` para comprobar que el servidor y la BD funcionan |
| POST | `/api/teacher/login` | Valida correo y contraseña configurados en `.env` y devuelve un token de acceso docente |
| POST | `/api/rooms` | Crea una sala (requiere `Authorization: Bearer <token>`) → `{ code, key }` (la llave es del docente) |
| GET | `/api/rooms/:code` | Comprueba que la sala existe |
| GET | `/api/rooms/:code/export.csv?key=...` | Resultados de la sala en CSV (solo docente) |

WebSocket: `/ws/:code?role=student&name=...` o `?role=teacher&key=...` (mensajes: `shoot`, `test`, `equation`, `publish`, `rate`; docente: `lock`, `creating`, `moderate`, `approve`, `hide`, `feature`, `reset`).

## Uso en clase
```bash
npm run build && npm start     # todo en http://localhost:3000
```
Los estudiantes entran a `http://<IP-de-tu-computadora>:3000` desde la misma red. Requiere Node 18 o superior.

## Notas
- Los estudiantes se identifican por nombre; si pierden la conexión se reconectan y conservan su progreso.
- Las respuestas correctas nunca viajan al navegador: el servidor simula cada tiro.

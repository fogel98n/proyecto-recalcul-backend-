// Crea la base y las tablas: npm run db:init  (idempotente)
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const env = process.env;
let cfg;
if (env.DATABASE_URL) {
  const u = new URL(env.DATABASE_URL);
  cfg = { host: u.hostname, port: Number(u.port) || 3306, user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password), name: u.pathname.slice(1) || "minigolf" };
} else {
  cfg = { host: env.DB_HOST || "localhost", port: Number(env.DB_PORT) || 3306, user: env.DB_USER || "root",
    password: env.DB_PASSWORD || "", name: env.DB_NAME || "minigolf" };
}
if (!/^[A-Za-z0-9_]+$/.test(cfg.name)) { console.error("DB_NAME inválido"); process.exit(1); }

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "database", "schema.sql");
const sql = fs.readFileSync(file, "utf8").replaceAll("minigolf", cfg.name);

const conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, multipleStatements: true });
try {
  await conn.query(sql);
  console.log(`✔ Base "${cfg.name}" lista en ${cfg.host}:${cfg.port}`);
} catch (e) {
  console.error("✘ No se pudo crear el esquema:", e.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}

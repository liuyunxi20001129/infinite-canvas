// db.js — 统一数据库接口，支持 PostgreSQL (Supabase 生产) 和 SQLite (本地开发)
// 通过 DATABASE_URL 环境变量切换：有值用 PostgreSQL，无值回退 SQLite

import dotenv from "dotenv";
dotenv.config();

const USE_POSTGRES = Boolean(process.env.DATABASE_URL);

// ─── PostgreSQL 模式 (Supabase / Render 生产) ─────────────────────
let pgPool = null;

async function initPostgres() {
  const { Pool } = await import("pg");
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    max: parseInt(process.env.DB_POOL_SIZE || "5", 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  // 建表
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS api_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      endpoint TEXT NOT NULL,
      model TEXT NOT NULL,
      capability TEXT NOT NULL,
      cost INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'success',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'recharge',
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_api_logs_user ON api_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
  `);

  console.log("[DB] PostgreSQL (Supabase) connected.");
}

/** 将 SQL 中的 ? 占位符替换为 $1, $2, ... (PostgreSQL 风格) */
function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

const pgDb = {
  async query(sql, params = []) {
    const res = await pgPool.query(convertPlaceholders(sql), params);
    return res.rows;
  },
  async queryOne(sql, params = []) {
    const res = await pgPool.query(convertPlaceholders(sql), params);
    return res.rows[0] || null;
  },
  async run(sql, params = []) {
    const res = await pgPool.query(convertPlaceholders(sql), params);
    return { changes: res.rowCount, lastInsertRowid: res.rows[0]?.id || 0 };
  },
};

// ─── SQLite 模式 (本地开发) ──────────────────────────────────────
import initSqlJs from "sql.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "app.db");

let sqlDb = null;
let saveTimer = null;

async function initSqlite() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    sqlDb = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  } else {
    sqlDb = new SQL.Database();
  }

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL,
      model TEXT NOT NULL,
      capability TEXT NOT NULL,
      cost INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'success',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'recharge',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  persistSqlite();
  console.log("[DB] SQLite (local) initialized.");
}

function persistSqlite() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!sqlDb) return;
    fs.writeFileSync(dbPath, Buffer.from(sqlDb.export()));
  }, 100);
}

const sqliteDb = {
  async query(sql, params = []) {
    const stmt = sqlDb.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  },
  async queryOne(sql, params = []) {
    const stmt = sqlDb.prepare(sql);
    stmt.bind(params);
    let row = null;
    if (stmt.step()) row = stmt.getAsObject();
    stmt.free();
    return row;
  },
  async run(sql, params = []) {
    sqlDb.run(sql, params);
    const changes = sqlDb.getRowsModified();
    let lastInsertRowid = 0;
    try {
      const res = sqlDb.exec("SELECT last_insert_rowid() as id");
      if (res.length > 0) lastInsertRowid = res[0].values[0][0];
    } catch {}
    persistSqlite();
    return { changes, lastInsertRowid };
  },
};

// ─── 统一接口 ────────────────────────────────────────────────────
let activeDb = null;

export async function initDb() {
  if (USE_POSTGRES) {
    await initPostgres();
    activeDb = pgDb;
  } else {
    await initSqlite();
    activeDb = sqliteDb;
  }
  return activeDb;
}

export function getDb() {
  if (!activeDb) throw new Error("Database not initialized. Call initDb() first.");
  return activeDb;
}

/** 便捷方法：查询多行 */
export async function query(sql, params = []) {
  return activeDb.query(sql, params);
}

/** 便捷方法：查询单行 */
export async function queryOne(sql, params = []) {
  return activeDb.queryOne(sql, params);
}

/** 便捷方法：执行写操作，返回 { changes, lastInsertRowid } */
export async function run(sql, params = []) {
  return activeDb.run(sql, params);
}

/** 数据库类型 ('postgres' | 'sqlite') */
export const dbType = USE_POSTGRES ? "postgres" : "sqlite";

export default { initDb, getDb, query, queryOne, run, dbType };

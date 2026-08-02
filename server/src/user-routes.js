import { queryOne, query, run, dbType } from "./db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const FREE_CREDIT = parseInt(process.env.FREE_CREDIT || "1000", 10);

/** 数据库方言辅助：30天前的时间表达式 */
function thirtyDaysAgo() {
  return dbType === "postgres" ? "NOW() - INTERVAL '30 days'" : "datetime('now', '-30 days')";
}

export async function register(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: { message: "用户名和密码不能为空" } });
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: { message: "用户名长度需 3-20 个字符" } });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: { message: "密码至少 6 个字符" } });
  }

  const existing = await queryOne("SELECT id FROM users WHERE username = ?", [username]);
  if (existing) {
    return res.status(409).json({ error: { message: "用户名已存在" } });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = await run("INSERT INTO users (username, password_hash, balance) VALUES (?, ?, ?)", [username, hash, FREE_CREDIT]);
  await run("INSERT INTO transactions (user_id, amount, type, note) VALUES (?, ?, ?, ?)", [result.lastInsertRowid, FREE_CREDIT, "free", "注册赠送"]);

  const token = jwt.sign({ userId: result.lastInsertRowid }, JWT_SECRET, { expiresIn: "30d" });
  res.json({
    token,
    user: { id: result.lastInsertRowid, username, balance: FREE_CREDIT, isAdmin: false },
  });
}

export async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: { message: "用户名和密码不能为空" } });
  }

  const user = await queryOne("SELECT * FROM users WHERE username = ?", [username]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: { message: "用户名或密码错误" } });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
  res.json({
    token,
    user: { id: user.id, username: user.username, balance: user.balance, isAdmin: Boolean(user.is_admin) },
  });
}

export async function getProfile(req, res) {
  const user = await queryOne("SELECT id, username, balance, is_admin, created_at FROM users WHERE id = ?", [req.user.id]);
  if (!user) return res.status(404).json({ error: { message: "用户不存在" } });
  res.json({ user: { ...user, is_admin: Boolean(user.is_admin) } });
}

export async function getUsage(req, res) {
  const sql = `
    SELECT DATE(created_at) as date, capability, COUNT(*) as count, SUM(cost) as cost
    FROM api_logs WHERE user_id = ? AND created_at >= ${thirtyDaysAgo()}
    GROUP BY DATE(created_at), capability ORDER BY DATE(created_at) DESC
  `;
  const logs = await query(sql, [req.user.id]);
  res.json({ usage: logs });
}

export async function getTransactions(req, res) {
  const logs = await query("SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", [req.user.id]);
  res.json({ transactions: logs });
}

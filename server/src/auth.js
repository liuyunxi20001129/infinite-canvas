import jwt from "jsonwebtoken";
import { queryOne } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

/** 统一用户对象格式（兼容 SQLite INTEGER 和 PostgreSQL BOOLEAN） */
function normalizeUser(user) {
  if (!user) return null;
  return { ...user, is_admin: Boolean(user.is_admin) };
}

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: { message: "未登录或登录已过期" } });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await queryOne("SELECT id, username, balance, is_admin FROM users WHERE id = ?", [payload.userId]);
    if (!user) return res.status(401).json({ error: { message: "用户不存在" } });
    req.user = normalizeUser(user);
    next();
  } catch {
    return res.status(401).json({ error: { message: "登录已过期，请重新登录" } });
  }
}

export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await queryOne("SELECT id, username, balance, is_admin FROM users WHERE id = ?", [payload.userId]);
    req.user = user ? normalizeUser(user) : null;
  } catch {
    req.user = null;
  }
  next();
}

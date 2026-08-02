-- ═══════════════════════════════════════════════════════════════
-- Infinite Canvas 商用版 — Supabase PostgreSQL 建表脚本
-- 在 Supabase Dashboard → SQL Editor 中执行此脚本
-- ═══════════════════════════════════════════════════════════════

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,        -- 余额（单位：分）
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API 调用记录表
CREATE TABLE IF NOT EXISTS api_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  model TEXT NOT NULL,
  capability TEXT NOT NULL,                   -- image / video / text / audio
  cost INTEGER NOT NULL,                      -- 扣费金额（分）
  status TEXT NOT NULL DEFAULT 'success',     -- success / failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 交易记录表（充值/消费）
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,                    -- 金额（分）
  type TEXT NOT NULL DEFAULT 'recharge',      -- recharge / recharge_pending / free / admin_recharge
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_api_logs_user_id ON api_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

-- 启用行级安全（RLS）—— 可选，如果前端直接访问 Supabase
-- 后端通过 service_role key 访问时不受 RS L 限制
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 提示：如需创建管理员账户，执行以下 SQL（替换用户名和密码哈希）：
-- 密码哈希生成方式（Node.js）:
-- const bcrypt = require('bcryptjs');
-- bcrypt.hashSync('your-password', 10);
-- 
-- INSERT INTO users (username, password_hash, balance, is_admin)
-- VALUES ('admin', '$2a$10$xxxxx...', 0, true);

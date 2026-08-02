// recharge-routes.js — 充值/支付路由
// 支持支付宝/微信支付集成，当前提供完整的订单流程和模拟支付回调
// 接入真实支付时，只需替换 createPayment 和 verifyCallback 两个函数

import { authMiddleware } from "./auth.js";
import { queryOne, query, run, dbType } from "./db.js";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// 支付配置
const PAYMENT_CONFIG = {
  alipay: {
    appId: process.env.ALIPAY_APP_ID || "",
    privateKey: process.env.ALIPAY_PRIVATE_KEY || "",
    publicKey: process.env.ALIPAY_PUBLIC_KEY || "",
    notifyUrl: process.env.ALIPAY_NOTIFY_URL || "",
  },
  wechat: {
    appId: process.env.WECHAT_APP_ID || "",
    mchId: process.env.WECHAT_MCH_ID || "",
    apiV3Key: process.env.WECHAT_API_V3_KEY || "",
    notifyUrl: process.env.WECHAT_NOTIFY_URL || "",
  },
};

// 充值套餐（单位：分）
const RECHARGE_PACKAGES = [
  { id: "pkg_10", amount: 1000, bonus: 0, label: "10 元" },
  { id: "pkg_50", amount: 5000, bonus: 500, label: "50 元（送 5 元）" },
  { id: "pkg_100", amount: 10000, bonus: 1500, label: "100 元（送 15 元）" },
  { id: "pkg_500", amount: 50000, bonus: 10000, label: "500 元（送 100 元）" },
];

/**
 * 创建支付订单（调用支付宝/微信支付 SDK）
 * TODO: 接入真实支付 SDK 时替换此函数
 */
async function createPayment(method, orderNo, amount, subject) {
  if (method === "alipay" && PAYMENT_CONFIG.alipay.appId) {
    // TODO: 接入支付宝 SDK
    // const AlipaySdk = require('@alipay/sdk').default;
    // const sdk = new AlipaySdk({ appId, privateKey, alipayPublicKey });
    // return sdk.pageExec('alipay.trade.page.pay', { ... });
  }

  if (method === "wechat" && PAYMENT_CONFIG.wechat.appId) {
    // TODO: 接入微信支付 SDK
    // return wechatPay.nativePay({ ... });
  }

  // 模拟模式：返回一个假的支付链接
  return {
    method,
    orderNo,
    amount,
    payUrl: `${process.env.PUBLIC_URL || "http://localhost:8000"}/api/recharge/mock-pay?order=${orderNo}`,
    qrCode: null,
    expiredAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
}

/**
 * 验证支付回调签名
 * TODO: 接入真实支付 SDK 时替换此函数
 */
function verifyCallback(method, body, headers) {
  // 模拟模式：直接信任
  return { verified: true, orderNo: body.out_trade_no, amount: body.total_amount };
}

export function registerRechargeRoutes(app) {
  // ─── 获取充值套餐列表 ──────────────────────────────────────
  app.get("/api/recharge/packages", (req, res) => {
    res.json({ packages: RECHARGE_PACKAGES });
  });

  // ─── 创建充值订单 ──────────────────────────────────────────
  app.post("/api/recharge/create", authMiddleware, async (req, res) => {
    try {
      const { packageId, method } = req.body;
      const pkg = RECHARGE_PACKAGES.find((p) => p.id === packageId);
      if (!pkg) {
        return res.status(400).json({ error: { message: "无效的充值套餐" } });
      }
      if (!["alipay", "wechat"].includes(method)) {
        return res.status(400).json({ error: { message: "不支持的支付方式" } });
      }

      // 生成订单号
      const orderNo = `R${Date.now()}${Math.floor(Math.random() * 10000)}`;
      const totalAmount = pkg.amount;
      const creditAmount = pkg.amount + pkg.bonus;

      // 创建订单记录
      await run(
        "INSERT INTO transactions (user_id, amount, type, note) VALUES (?, ?, ?, ?)",
        [req.user.id, creditAmount, "recharge_pending", `订单:${orderNo} 套餐:${pkg.label}`]
      );

      // 调用支付接口
      const payment = await createPayment(method, orderNo, totalAmount, `Infinite Canvas 充值 - ${pkg.label}`);

      res.json({
        orderNo,
        method,
        amount: totalAmount,
        credit: creditAmount,
        payment,
      });
    } catch (error) {
      console.error("[Recharge] Create order error:", error);
      res.status(500).json({ error: { message: "创建订单失败" } });
    }
  });

  // ─── 支付回调（支付宝/微信异步通知） ────────────────────────
  app.post("/api/recharge/notify/:method", async (req, res) => {
    try {
      const method = req.params.method;
      const result = verifyCallback(method, req.body, req.headers);

      if (!result.verified) {
        return res.status(400).send("FAIL");
      }

      // 查找订单并充值
      const orderNote = `订单:${result.orderNo}`;
      const tx = await queryOne("SELECT * FROM transactions WHERE note LIKE ? AND type = ?", [`%${orderNote}%`, "recharge_pending"]);

      if (!tx) {
        return res.send(method === "alipay" ? "success" : "<xml><return_code>SUCCESS</return_code></xml>");
      }

      // 更新订单状态并加余额
      await run("UPDATE users SET balance = balance + ? WHERE id = ?", [tx.amount, tx.user_id]);
      await run("UPDATE transactions SET type = ? WHERE id = ?", ["recharge", tx.id]);

      console.log(`[Recharge] Order ${result.orderNo} completed: +${tx.amount} for user ${tx.user_id}`);

      // 支付宝要求返回 "success"，微信要求返回 XML
      if (method === "alipay") {
        res.send("success");
      } else {
        res.set("Content-Type", "text/xml");
        res.send("<xml><return_code>SUCCESS</return_code><return_msg>OK</return_msg></xml>");
      }
    } catch (error) {
      console.error("[Recharge] Notify error:", error);
      res.status(500).send("FAIL");
    }
  });

  // ─── 模拟支付页面（开发测试用） ────────────────────────────
  app.get("/api/recharge/mock-pay", async (req, res) => {
    const orderNo = req.query.order;
    if (!orderNo) return res.status(400).send("缺少订单号");

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>模拟支付</title>
      <style>
        body { font-family: sans-serif; max-width: 400px; margin: 80px auto; text-align: center; }
        .card { border: 1px solid #ddd; border-radius: 12px; padding: 32px; }
        h1 { color: #1677ff; } button { background: #1677ff; color: #fff; border: none;
        padding: 12px 32px; border-radius: 6px; font-size: 16px; cursor: pointer; margin-top: 16px; }
      </style></head>
      <body><div class="card">
        <h1>模拟支付</h1>
        <p>订单号: ${orderNo}</p>
        <p>这是开发环境的模拟支付页面</p>
        <form method="POST" action="/api/recharge/mock-pay">
          <input type="hidden" name="order" value="${orderNo}">
          <button type="submit">确认支付（模拟）</button>
        </form>
      </div></body>
      </html>
    `);
  });

  // ─── 模拟支付确认（开发测试用） ────────────────────────────
  app.post("/api/recharge/mock-pay", async (req, res) => {
    try {
      const orderNo = req.body.order;
      const orderNote = `订单:${orderNo}`;
      const tx = await queryOne("SELECT * FROM transactions WHERE note LIKE ? AND type = ?", [`%${orderNote}%`, "recharge_pending"]);

      if (!tx) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send("<h2>订单不存在或已完成</h2>");
      }

      await run("UPDATE users SET balance = balance + ? WHERE id = ?", [tx.amount, tx.user_id]);
      await run("UPDATE transactions SET type = ? WHERE id = ?", ["recharge", tx.id]);

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`
        <div style="text-align:center;font-family:sans-serif;margin-top:80px">
          <h1 style="color:#52c41a">支付成功！</h1>
          <p>充值金额: ¥${(tx.amount / 100).toFixed(2)}</p>
          <p>请返回 Infinite Canvas 继续使用</p>
        </div>
      `);
    } catch (error) {
      console.error("[Recharge] Mock pay error:", error);
      res.status(500).send("支付失败");
    }
  });

  // ─── 管理员手动充值 ────────────────────────────────────────
  app.post("/api/recharge/admin", authMiddleware, async (req, res) => {
    try {
      // 简单管理员验证：需要 isAdmin 或管理员密码
      if (!req.user.is_admin) {
        const { adminPassword } = req.body;
        if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
          return res.status(403).json({ error: { message: "无管理员权限" } });
        }
      }

      const { username, amount, note } = req.body;
      if (!username || !amount || amount <= 0) {
        return res.status(400).json({ error: { message: "参数错误" } });
      }

      const user = await queryOne("SELECT id FROM users WHERE username = ?", [username]);
      if (!user) {
        return res.status(404).json({ error: { message: "用户不存在" } });
      }

      await run("UPDATE users SET balance = balance + ? WHERE id = ?", [amount, user.id]);
      await run("INSERT INTO transactions (user_id, amount, type, note) VALUES (?, ?, ?, ?)", [
        user.id,
        amount,
        "admin_recharge",
        note || `管理员手动充值`,
      ]);

      res.json({ success: true, message: `已为 ${username} 充值 ¥${(amount / 100).toFixed(2)}` });
    } catch (error) {
      console.error("[Recharge] Admin error:", error);
      res.status(500).json({ error: { message: "充值失败" } });
    }
  });

  // ─── 查询充值订单状态 ──────────────────────────────────────
  app.get("/api/recharge/status/:orderNo", authMiddleware, async (req, res) => {
    try {
      const orderNote = `订单:${req.params.orderNo}`;
      const tx = await queryOne("SELECT * FROM transactions WHERE note LIKE ? AND user_id = ?", [`%${orderNote}%`, req.user.id]);

      if (!tx) {
        return res.status(404).json({ error: { message: "订单不存在" } });
      }

      res.json({
        orderNo: req.params.orderNo,
        status: tx.type === "recharge" ? "paid" : "pending",
        amount: tx.amount,
        createdAt: tx.created_at,
      });
    } catch (error) {
      res.status(500).json({ error: { message: "查询失败" } });
    }
  });
}

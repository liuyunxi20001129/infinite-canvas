import axios from "axios";
import multer from "multer";
import { run, queryOne } from "./db.js";
import { authMiddleware } from "./auth.js";

const UPSTREAM_BASE_URL = process.env.UPSTREAM_BASE_URL || "https://api.openai.com";
const UPSTREAM_API_KEY = process.env.UPSTREAM_API_KEY || "";

// 定价表（单位：分）
const PRICING = {
  image: parseInt(process.env.PRICE_IMAGE || "5", 10),
  video: parseInt(process.env.PRICE_VIDEO || "50", 10),
  text: parseInt(process.env.PRICE_TEXT || "1", 10),
  audio: parseInt(process.env.PRICE_AUDIO || "3", 10),
};

// 允许用户使用的模型列表
const AVAILABLE_MODELS = {
  image: [
    { id: "gpt-image-2", name: "GPT Image 2" },
    { id: "dall-e-3", name: "DALL-E 3" },
    { id: "flux-1.1-pro", name: "Flux 1.1 Pro" },
    { id: "seedream-4-0", name: "Seedream 4.0" },
  ],
  video: [
    { id: "grok-imagine-video", name: "Grok Imagine Video" },
    { id: "seedance-1-0", name: "Seedance 1.0" },
  ],
  text: [
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "deepseek-chat", name: "DeepSeek Chat" },
  ],
  audio: [
    { id: "gpt-4o-mini-tts", name: "GPT-4o Mini TTS" },
  ],
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function getUpstreamUrl(apiPath) {
  const base = UPSTREAM_BASE_URL.replace(/\/+$/, "");
  return `${base}/v1${apiPath}`;
}

function getUpstreamHeaders(contentType) {
  const headers = { Authorization: `Bearer ${UPSTREAM_API_KEY}` };
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

/** 计费：扣费 + 记录 */
async function charge(userId, model, capability, cost, status = "success") {
  if (cost > 0) {
    await run("UPDATE users SET balance = balance - ? WHERE id = ?", [cost, userId]);
  }
  await run(
    "INSERT INTO api_logs (user_id, endpoint, model, capability, cost, status) VALUES (?, ?, ?, ?, ?, ?)",
    [userId, capability, model, capability, cost, status]
  );
}

/** 检查余额是否足够 */
function checkBalance(req, res, cost) {
  if (req.user.balance < cost) {
    res.status(402).json({ error: { message: `余额不足，本次调用需要 ${cost} 分，当前余额 ${req.user.balance} 分，请充值` } });
    return false;
  }
  return true;
}

/** JSON 代理：转发 JSON 请求到上游 */
async function proxyJson(req, res, upstreamPath, capability, defaultModel) {
  const model = req.body?.model || defaultModel;
  const cost = PRICING[capability] || 0;

  if (!checkBalance(req, res, cost)) return;

  try {
    const upstreamUrl = getUpstreamUrl(upstreamPath);
    const headers = getUpstreamHeaders("application/json");
    const resp = await axios.post(upstreamUrl, req.body, { headers, timeout: 30000 });
    await charge(req.user.id, model, capability, cost);
    res.json(resp.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || { error: { message: "上游服务暂时不可用" } };
    await charge(req.user.id, model, capability, cost, "failed");
    res.status(status).json(data);
  }
}

/** FormData 代理：转发 multipart 请求到上游（图片编辑等） */
async function proxyFormData(req, res, upstreamPath, capability, defaultModel) {
  const model = req.body?.model || defaultModel;
  const cost = PRICING[capability] || 0;

  if (!checkBalance(req, res, cost)) return;

  try {
    const FormData = (await import("form-data")).default;
    const form = new FormData();
    for (const [key, value] of Object.entries(req.body)) {
      if (Array.isArray(value)) {
        value.forEach((v) => form.append(key, v));
      } else {
        form.append(key, String(value));
      }
    }
    if (req.files) {
      for (const file of req.files) {
        form.append(file.fieldname, file.buffer, { filename: file.originalname, contentType: file.mimetype });
      }
    }
    const upstreamUrl = getUpstreamUrl(upstreamPath);
    const headers = { ...getUpstreamHeaders(), ...form.getHeaders() };
    const resp = await axios.post(upstreamUrl, form, { headers, timeout: 30000 });
    await charge(req.user.id, model, capability, cost);
    res.json(resp.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || { error: { message: "上游服务暂时不可用" } };
    await charge(req.user.id, model, capability, cost, "failed");
    res.status(status).json(data);
  }
}

/** 流式代理：转发 SSE 流（对话/文本生成） */
async function proxyStream(req, res, upstreamPath, capability, defaultModel) {
  const model = req.body?.model || defaultModel;
  const cost = PRICING[capability] || 0;

  if (!checkBalance(req, res, cost)) return;

  try {
    const upstreamUrl = getUpstreamUrl(upstreamPath);
    const headers = getUpstreamHeaders("application/json");
    const body = { ...req.body, stream: true };

    const resp = await fetch(upstreamUrl, {
      method: "POST",
      headers: { ...headers, Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!resp.ok) {
      const text = await resp.text();
      await charge(req.user.id, model, capability, cost, "failed");
      res.status(resp.status).json({ error: { message: text.slice(0, 500) } });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
    await charge(req.user.id, model, capability, cost);
  } catch (error) {
    await charge(req.user.id, model, capability, cost, "failed");
    if (!res.headersSent) {
      res.status(500).json({ error: { message: "流式请求失败" } });
    } else {
      res.end();
    }
  }
}

/** 根据 Content-Type 自动选择代理方式 */
function smartProxy(upstreamPath, capability, defaultModel) {
  return async (req, res) => {
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("multipart/form-data")) {
      await proxyFormData(req, res, upstreamPath, capability, defaultModel);
    } else if (req.body?.stream || req.query?.alt === "sse") {
      await proxyStream(req, res, upstreamPath, capability, defaultModel);
    } else {
      await proxyJson(req, res, upstreamPath, capability, defaultModel);
    }
  };
}

export function registerApiRoutes(app) {
  // 模型列表（返回允许用户使用的模型）
  app.get("/v1/models", authMiddleware, (req, res) => {
    const allModels = Object.values(AVAILABLE_MODELS).flat();
    res.json({ data: allModels.map((m) => ({ id: m.id })) });
  });

  // 图片生成
  app.post("/v1/images/generations", authMiddleware, smartProxy("/images/generations", "image", "gpt-image-2"));

  // 图片编辑（FormData）
  app.post("/v1/images/edits", authMiddleware, upload.any(), async (req, res) => {
    await proxyFormData(req, res, "/images/edits", "image", "gpt-image-2");
  });

  // 文本对话（流式）
  app.post("/v1/responses", authMiddleware, async (req, res) => {
    await proxyStream(req, res, "/responses", "text", "gpt-4o");
  });

  // 视频生成
  app.post("/v1/videos/generations", authMiddleware, smartProxy("/videos/generations", "video", "grok-imagine-video"));

  // 视频任务查询
  app.get("/v1/videos/generations/:taskId", authMiddleware, async (req, res) => {
    try {
      const upstreamUrl = getUpstreamUrl(`/videos/generations/${req.params.taskId}`);
      const headers = getUpstreamHeaders();
      const resp = await axios.get(upstreamUrl, { headers, timeout: 15000 });
      res.json(resp.data);
    } catch (error) {
      const status = error.response?.status || 500;
      const data = error.response?.data || { error: { message: "查询失败" } };
      res.status(status).json(data);
    }
  });

  // 音频生成
  app.post("/v1/audio/speech", authMiddleware, smartProxy("/audio/speech", "audio", "gpt-4o-mini-tts"));
}

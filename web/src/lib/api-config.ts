// 商用改造：锁定 API 配置，用户不能自带 API
// baseUrl 固定为后端代理地址，apiKey 使用用户 token 替代

function getApiBaseUrl() {
  // 开发环境指向本地后端
  if (import.meta.env.DEV) {
    return import.meta.env.VITE_API_PROXY_URL || "http://localhost:8000";
  }
  // 生产环境同域（nginx 反向代理）
  return "";
}

export const API_BASE_URL = getApiBaseUrl();

/** 获取用户登录 token */
export function getUserToken() {
  return localStorage.getItem("infinite-canvas:user_token") || "";
}

/** 保存用户登录 token */
export function setUserToken(token) {
  localStorage.setItem("infinite-canvas:user_token", token);
}

/** 清除用户登录 token */
export function clearUserToken() {
  localStorage.removeItem("infinite-canvas:user_token");
}

/** 获取用户信息 */
export function getStoredUser() {
  try {
    const raw = localStorage.getItem("infinite-canvas:user_info");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** 保存用户信息 */
export function setStoredUser(user) {
  localStorage.setItem("infinite-canvas:user_info", JSON.stringify(user));
}

/** 清除用户信息 */
export function clearStoredUser() {
  localStorage.removeItem("infinite-canvas:user_info");
}

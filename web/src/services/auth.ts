import axios from "axios";
import { API_BASE_URL, getUserToken, setUserToken, clearUserToken, getStoredUser, setStoredUser, clearStoredUser } from "@/lib/api-config";

const api = axios.create({ baseURL: `${API_BASE_URL}/api` });

export type AuthUser = {
  id: number;
  username: string;
  balance: number;
  isAdmin: boolean;
};

export async function register(username: string, password: string): Promise<AuthUser> {
  const resp = await api.post("/auth/register", { username, password });
  setUserToken(resp.data.token);
  setStoredUser(resp.data.user);
  return resp.data.user;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const resp = await api.post("/auth/login", { username, password });
  setUserToken(resp.data.token);
  setStoredUser(resp.data.user);
  return resp.data.user;
}

export function logout() {
  clearUserToken();
  clearStoredUser();
}

export function getCurrentUser(): AuthUser | null {
  if (!getUserToken()) return null;
  return getStoredUser();
}

export async function fetchProfile(): Promise<AuthUser> {
  const token = getUserToken();
  const resp = await api.get("/user/profile", { headers: { Authorization: `Bearer ${token}` } });
  setStoredUser(resp.data.user);
  return resp.data.user;
}

export async function fetchUsage() {
  const token = getUserToken();
  const resp = await api.get("/user/usage", { headers: { Authorization: `Bearer ${token}` } });
  return resp.data.usage;
}

export async function fetchTransactions() {
  const token = getUserToken();
  const resp = await api.get("/user/transactions", { headers: { Authorization: `Bearer ${token}` } });
  return resp.data.transactions;
}

/* ==========================================================================
   UNIFIED API UTILITY (AUTH-AWARE FETCH FOR ALL VIEWS)
   ========================================================================== */

import { getAuthToken } from "./auth.js";

export const APP_BASE = window.location.pathname
  .replace(/\/[^/]*$/, "/")
  .replace(/\/+$/, "");

export const API_BASE = `${window.location.origin}${APP_BASE}`;

let _timeOffsetMs = 0;

export function nowServerMs() {
  return Date.now() + _timeOffsetMs;
}

export async function syncServerTime() {
  try {
    const r = await fetch(`${API_BASE}/api/time`, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    const ms = Number(j?.serverMs);
    if (Number.isFinite(ms)) {
      _timeOffsetMs = ms - Date.now();
    }
  } catch {}
}

export async function apiGET(path) {
  const headers = {};
  const token = getAuthToken();
  if (token) headers["Authorization"] = "Bearer " + token;
  const r = await fetch(`${API_BASE}${path}`, { headers });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error(j?.error || `GET ${path} failed`);
  if (j.ok === false) throw new Error(j.error || `GET ${path} failed`);
  return j;
}

export async function apiGetData(path) {
  const j = await apiGET(path);
  return j?.data !== undefined ? j.data : j;
}

export async function apiPOST(path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getAuthToken();
  if (token) headers["Authorization"] = "Bearer " + token;
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error(j?.error || `POST ${path} failed`);
  if (j.ok === false) throw new Error(j.error || `POST ${path} failed`);
  return j;
}

/* ==========================================================================
   GENERAL HELPERS & UTILITIES
   ========================================================================== */

export const $ = (id) => document.getElementById(id);

export function clampNonNegInt(v) {
  const n = parseInt(String(v || "0").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function urlBase64ToUint8Array(base64) {
  const pad = base64.length % 4;
  if (pad) base64 += "=".repeat(4 - pad);
  const raw = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const _dedupCache = new Map();
export function isDuplicate(key, windowMs) {
  const now = Date.now();
  const last = _dedupCache.get(key);
  if (last && now - last < windowMs) return true;
  _dedupCache.set(key, now);
  return false;
}

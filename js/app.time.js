/* =========================
   TIME SYNC
========================= */
function nowServerMs() {
  return Date.now() + TIME_OFFSET_MS;
}

async function syncServerTime() {
  try {
    const r = await fetch(`${API_BASE}/api/time`, { method: "GET", cache: "no-store" });
    const j = await r.json().catch(() => null);
    const serverMs = Number(j?.serverMs);
    if (Number.isFinite(serverMs)) {
      TIME_OFFSET_MS = serverMs - Date.now();
    }
  } catch (e) {
    // no bloquear la app si falla el sync
  }
}

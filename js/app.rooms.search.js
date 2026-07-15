/* =========================
   TIMERS LIVE
========================= */
function updateTimersLive() {
  const rooms = roomsCache.get(String(activeModuleId)) || [];
  const map = new Map();
  rooms.forEach(r => map.set(roomKey(r.modulo_id, r.etiqueta), r));

  document.querySelectorAll("[data-timer-roomkey]").forEach(el => {
    const k = el.getAttribute("data-timer-roomkey");
    const type = el.getAttribute("data-timer-type");
    const r = map.get(k);
    if (!r) { el.textContent = "0m 00s"; return; }

    let iso = null;
    if (type === "lista") iso = r.desde;
    if (type === "limpieza") iso = r.inicio_limpieza;
    if (type === "inspeccion") iso = r.fin_limpieza;
    if (type === "repaso") iso = r.inicio_repaso;

    el.textContent = iso ? fmtDur(msSince(iso)) : "0m 00s";
  });
}

/* =========================
   BUSCADOR DE HABITACIONES
========================= */
let roomSearchQuery = "";

$("roomSearch")?.addEventListener("input", (e) => {
  roomSearchQuery = String(e.target.value || "").trim().toLowerCase();
  scheduleRenderRooms();
});

/* =========================
   SOCKET (tiempo real)
========================= */
let socket = null;
let fallbackSyncTimer = null;

function startFallbackSync(intervalMs = 4000) {
  if (fallbackSyncTimer) return;
  fallbackSyncTimer = setInterval(async () => {
    try {
      if (!activeModuleId) return;
      if (isLoginVisible()) return;
      if (socket?.connected) return;
      const resp = await apiGET(`/api/rooms?modulo_id=${encodeURIComponent(String(activeModuleId))}`);
      if (socket?.connected) return;
      const rows = (resp.data || []).map(normalizeRoom);
      roomsCache.set(String(activeModuleId), rows);
      scheduleRenderRooms();
      updateSummaryCounts();
    } catch {}
  }, intervalMs);
}

function stopFallbackSync() {
  if (!fallbackSyncTimer) return;
  clearInterval(fallbackSyncTimer);
  fallbackSyncTimer = null;
}

function initSocket() {
  const ioUrl = API_BASE.replace(/^http/, "ws");
  try {
    socket = new window.io(ioUrl, {
      transports: ["websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
  } catch (e) {
    console.warn("Socket.io no disponible:", e);
    startFallbackSync();
    return;
  }

  socket.on("connect", () => {
    stopFallbackSync();
    if (activeModuleId) {
      socket.emit("join", { modulo_id: String(activeModuleId) });
    }
  });

  socket.on("disconnect", () => {
    startFallbackSync();
  });

  socket.on("room_update", (data) => {
    if (!data || !data.modulo_id) return;
    if (String(data.modulo_id) !== String(activeModuleId)) return;
    const updated = normalizeRoom(data);
    const arr = roomsCache.get(String(data.modulo_id));
    if (!arr) return;
    const idx = arr.findIndex(x => String(x.etiqueta).toUpperCase() === String(updated.etiqueta).toUpperCase());
    if (idx >= 0) {
      const oldEstado = arr[idx].estado;
      const newEstado = updated.estado;
      arr[idx] = updated;
      addRecentNotification(data.modulo_id, updated.etiqueta, oldEstado, newEstado);
      renderRooms();
      updateSummaryCounts();
    } else {
      arr.push(updated);
      renderRooms();
      updateSummaryCounts();
    }
  });

  socket.on("connect_error", () => {
    startFallbackSync();
  });
}

/* ==========================================================================
   SOCKET.IO REAL-TIME CLIENT & FALLBACK SYNC
   ========================================================================== */

import { API_BASE, state } from "../state/store.js";
import { normalizeRoom, ESTADO_LABELS } from "../utils/normalize.js";
import { isDuplicate } from "../utils/helpers.js";
import { apiGET } from "../api/client.js";
import { toast } from "../notifications/toast.js";
import { playNotificationSound } from "../notifications/sound.js";
import { addRecentNotification } from "../notifications/push.js";
import { renderRooms, scheduleRenderRooms, updateSummaryCounts } from "../components/rooms.js";
import { isLoginVisible } from "../components/login.js";

let socket = null;
let fallbackSyncTimer = null;

export function getSocket() {
  return socket;
}

export function startFallbackSync(intervalMs = 4000) {
  if (fallbackSyncTimer) return;
  fallbackSyncTimer = setInterval(async () => {
    try {
      if (!state.activeModuleId) return;
      if (isLoginVisible()) return;
      if (socket?.connected) return;
      const resp = await apiGET(`/api/rooms?modulo_id=${encodeURIComponent(String(state.activeModuleId))}`);
      if (socket?.connected) return;
      const rows = (resp.data || []).map(normalizeRoom);
      state.roomsCache.set(String(state.activeModuleId), rows);
      scheduleRenderRooms();
      updateSummaryCounts();
    } catch {}
  }, intervalMs);
}

export function stopFallbackSync() {
  if (!fallbackSyncTimer) return;
  clearInterval(fallbackSyncTimer);
  fallbackSyncTimer = null;
}

export function initSocket() {
  const ioUrl = API_BASE.replace(/^http/, "ws");
  try {
    const ioFn = window.io;
    if (typeof ioFn !== "function") throw new Error("window.io no está disponible");
    socket = new ioFn(ioUrl, {
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
    console.log("🔌 [Socket.io] Conectado con éxito");
    stopFallbackSync();
    if (state.activeModuleId) {
      socket.emit("join", { modulo_id: String(state.activeModuleId) });
    }
  });

  socket.on("disconnect", (reason) => {
    console.warn("🔌 [Socket.io] Desconectado del servidor (razón:", reason, ")");
    startFallbackSync();
  });

  socket.on("room_update", (data) => {
    if (!data || !data.modulo_id) return;
    const updated = normalizeRoom(data);
    const arr = state.roomsCache.get(String(data.modulo_id));
    if (!arr) return;
    const idx = arr.findIndex(x => String(x.etiqueta).toUpperCase() === String(updated.etiqueta).toUpperCase());

    const dedupKey = `socket:${data.modulo_id}:${updated.etiqueta}:${updated.estado}`;
    const isDup = isDuplicate(dedupKey, 2000);
    if (isDup) {
      if (idx >= 0) arr[idx] = updated;
      if (String(data.modulo_id) === String(state.activeModuleId) || !!state.roomSearchQuery) {
        renderRooms();
      }
      return;
    }

    if (idx >= 0) {
      const oldEstado = arr[idx].estado;
      const newEstado = updated.estado;
      const oldPrio = arr[idx].prioridad_limpieza;
      const newPrio = updated.prioridad_limpieza;
      arr[idx] = updated;
      addRecentNotification(data.modulo_id, updated.etiqueta, oldEstado, newEstado, oldPrio, newPrio);
      
      if (String(data.modulo_id) === String(state.activeModuleId) || !!state.roomSearchQuery) {
        renderRooms();
        updateSummaryCounts();

        const prioCambio = String(oldPrio || "").toLowerCase() !== String(newPrio || "").toLowerCase();
        const tienePrio = String(newPrio || "").toLowerCase() === "alta";

        if (prioCambio && oldEstado === newEstado) {
          playNotificationSound();
          if (tienePrio) {
            toast("warn", "Prioridad", `Habitación ${updated.etiqueta} marcada como PRIORIDAD ALTA.`);
          } else {
            toast("ok", "Prioridad", `Habitación ${updated.etiqueta} sin prioridad.`);
          }
        } else if (oldEstado !== newEstado) {
          playNotificationSound();
          const label = ESTADO_LABELS[newEstado] || newEstado;
          toast("ok", "Habitación " + updated.etiqueta, `Estado cambió a ${label}`);
        }
      } else {
        updateSummaryCounts();
      }
    } else {
      arr.push(updated);
      if (String(data.modulo_id) === String(state.activeModuleId) || !!state.roomSearchQuery) {
        renderRooms();
        updateSummaryCounts();
      }
    }
  });

  socket.on("connect_error", (err) => {
    console.warn("🔌 [Socket.io] Error de conexión:", err);
    startFallbackSync();
  });
}

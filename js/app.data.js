/* =========================
   DATA (desde BD)
========================= */
let MODULES = [];
let activeModuleId = null;

const roomsCache = new Map();
let renderRoomsQueued = false;

function scheduleRenderRooms() {
  if (renderRoomsQueued) return;
  renderRoomsQueued = true;

  const flush = () => {
    renderRoomsQueued = false;
    renderRooms();
  };

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(flush);
  } else {
    setTimeout(flush, 16);
  }
}

function roomKey(modulo_id, etiqueta) {
  return `${String(modulo_id)}::${String(etiqueta).toUpperCase()}`;
}

/* =========================
   ROOM NORMALIZATION
========================= */
const ESTADO_LABELS = {
  "libre": "LIBRE",
  "ocupado": "OCUPADO",
  "ocupada limpia": "OCUPADA LIMPIA",
  "lista": "LISTA PARA LIMPIEZA",
  "limpieza": "EN LIMPIEZA",
  "inspeccion": "INSPECCION",
  "mantenimiento": "MANTENIMIENTO",
  "repaso": "REPASO"
};

function normalizeRoom(r) {
  return {
    id: r.id,
    modulo_id: String(r.modulo_id ?? r.modulo ?? ""),
    etiqueta: String(r.etiqueta ?? r.num ?? ""),
    estado: String(r.estado ?? "libre"),
    desde: r.desde || null,
    adultos: Number(r.adultos ?? 0),
    ninos: Number(r.ninos ?? 0),
    obs: r.observaciones || r.obs || "",
    observaciones: r.observaciones || r.obs || "",
    inicio_limpieza: r.inicio_limpieza || null,
    fin_limpieza: r.fin_limpieza || null,
    inicio_repaso: r.inicio_repaso || null,
    repaso: r.repaso || null,
    estado_limpieza: r.estado_limpieza || null,
    obs_limpieza: r.obs_limpieza || "",
    inspected_by: r.inspected_by || null,
    camarera_asignada: r.camarera_asignada || null,
    tipo_limpieza: r.tipo_limpieza || null,
    inspector_asignado: r.inspector_asignado || null,
    prioridad_limpieza: r.prioridad_limpieza || null,
    decorada: r.decorada,
    actualizado: r.actualizado || null
  };
}

function applyRoomUpdate(updatedRow) {
  const updated = normalizeRoom(updatedRow);
  const modId = String(updated.modulo_id);

  const arr = roomsCache.get(modId);
  if (arr) {
    const idx = arr.findIndex(x => String(x.etiqueta).toUpperCase() === String(updated.etiqueta).toUpperCase());
    if (idx >= 0) {
      const oldEstado = arr[idx].estado;
      const newEstado = updated.estado;
      arr[idx] = updated;
      if (oldEstado !== newEstado) {
        addRecentNotification(modId, updated.etiqueta, oldEstado, newEstado);
      }
      scheduleRenderRooms();
      updateSummaryCounts();
      showNotification(updated.etiqueta, newEstado);
      return;
    }
  }
  if (!roomsCache.has(modId)) {
    roomsCache.set(modId, []);
  }
  roomsCache.get(modId).push(updated);
  scheduleRenderRooms();
  updateSummaryCounts();
}

/* =========================
   UPDATE ROOM (DB)
========================= */
async function updateRoom(modulo_id, etiqueta, patch, source = "app") {
  const resp = await apiPOST("/api/room/update", { modulo_id, etiqueta, patch, actor: getActor(), source });
  applyRoomUpdate(resp.data);
  return resp.data;
}

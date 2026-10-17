/* ==========================================================================
   ROOM DATA NORMALIZATION
   ========================================================================== */

export const ESTADO_LABELS = {
  "libre": "LIBRE",
  "ocupado": "OCUPADO",
  "ocupada limpia": "OCUPADA LIMPIA",
  "lista": "LISTA PARA LIMPIEZA",
  "limpieza": "EN LIMPIEZA",
  "inspeccion": "INSPECCION",
  "mantenimiento": "MANTENIMIENTO",
  "repaso": "REPASO"
};

export function roomKey(modulo_id, etiqueta) {
  return `${String(modulo_id)}::${String(etiqueta).toUpperCase()}`;
}

export function normalizeRoom(r) {
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
    prioAlta: String(r.prioridad_limpieza || "").toLowerCase() === "alta",
    decorada: r.decorada,
    actualizado: r.actualizado || null
  };
}

const { toMySQLDatetime } = require("../utils/date.utils");

const ESTADO_TRANSITIONS = {
  "libre->ocupado":                 { roles: ["RECEPCION", "ADMIN"] },
  "libre->repaso":                  { roles: ["RECEPCION", "ADMIN"] },
  "libre->mantenimiento":           { roles: ["RECEPCION", "AMA_LLAVES", "ADMIN"] },
  "ocupado->lista":                 { roles: ["RECEPCION", "ADMIN"] },
  "ocupada limpia->lista":          { roles: ["RECEPCION", "ADMIN"] },
  "lista->mantenimiento":           { roles: ["RECEPCION", "AMA_LLAVES", "ADMIN"] },
  // Las siguientes SOLO son validas desde el flujo de Inspeccion.html
  "lista->limpieza":                { roles: ["AMA_LLAVES", "ADMIN"], source: "inspeccion" },
  "limpieza->inspeccion":           { roles: ["AMA_LLAVES", "ADMIN"], source: "inspeccion" },
  "inspeccion->libre":              { roles: ["AMA_LLAVES", "ADMIN"], source: "inspeccion" },
  "inspeccion->ocupada limpia":     { roles: ["AMA_LLAVES", "ADMIN"], source: "inspeccion" },
};

function checkStateTransition(curEstado, newEstado, role, source) {
  const cur  = String(curEstado  || "").trim().toLowerCase();
  const next = String(newEstado || "").trim().toLowerCase();
  const src  = String(source    || "").trim().toLowerCase();

  // No-op: mismo estado, siempre OK (es un patch de meta, ej prioridad).
  if (cur === next) return { ok: true };

  // GERENCIA y REPORTES son solo lectura.
  if (role === "GERENCIA" || role === "REPORTES") {
    return { ok: false, code: 403, error: "Solo visualizacion, no podes cambiar estados." };
  }

  // ADMIN pasa por las reglas especificas de "libre";
  // para el resto de transiciones no listadas, ADMIN tiene permisos totales.
  if (role !== "ADMIN") {
    const key = `${cur}->${next}`;
    const rule = ESTADO_TRANSITIONS[key];
    if (!rule) {
      return { ok: false, code: 403, error: `Transicion ${cur} -> ${next} no permitida.` };
    }
    if (!rule.roles.includes(role)) {
      return { ok: false, code: 403, error: `Tu rol (${role}) no puede hacer la transicion ${cur} -> ${next}.` };
    }
    if (rule.source && src !== rule.source) {
      return { ok: false, code: 403, error: `La transicion ${cur} -> ${next} solo se permite desde el flujo de ${rule.source}.` };
    }
  }
  return { ok: true };
}

function normalizePatch(patch) {
  const p = patch || {};
  const out = {};

  if ("_skipEstadoUpdate" in p) out._skipEstadoUpdate = p._skipEstadoUpdate;

  const hasEstado = ("estado" in p);
  if (hasEstado) out.estado = p.estado ?? null;
  else out.estado = "libre";

  if ("adultos" in p) out.adultos = Number.isFinite(Number(p.adultos)) ? Number(p.adultos) : 0;
  else if (p.estado === "libre") out.adultos = 0;
  else out.adultos = null;

  if ("ninos" in p) out.ninos = Number.isFinite(Number(p.ninos)) ? Number(p.ninos) : 0;
  else out.ninos = null;

  if ("observaciones" in p) out.observaciones = (p.observaciones == null) ? "" : String(p.observaciones);
  else if (p.estado === "libre") out.observaciones = "";
  else out.observaciones = null;

  if ("camarera_asignada" in p) out.camarera_asignada = p.camarera_asignada ?? null;
  if ("tipo_limpieza" in p) out.tipo_limpieza = p.tipo_limpieza ?? null;
  if ("decorada" in p) {
    const v = p.decorada;
    out.decorada = (v === true || v === 1 || String(v).trim().toLowerCase() === "si" || String(v).trim() === "1") ? 1 : 0;
  } else if (p.estado === "libre" || p.estado === "lista") {
    out.decorada = 0;
  }
  if ("inspector_asignado" in p) out.inspector_asignado = p.inspector_asignado ?? null;
  if ("prioridad_limpieza" in p) out.prioridad_limpieza = p.prioridad_limpieza ?? null;
  if ("desde" in p) out.desde = toMySQLDatetime(p.desde);
  if ("inicio_limpieza" in p) out.inicio_limpieza = toMySQLDatetime(p.inicio_limpieza);
  if ("fin_limpieza" in p) out.fin_limpieza = toMySQLDatetime(p.fin_limpieza);
  if ("inicio_repaso" in p) out.inicio_repaso = toMySQLDatetime(p.inicio_repaso);
  if ("repaso" in p) out.repaso = p.repaso ?? null;
  if ("hora_listo_limpieza" in p) out.hora_listo_limpieza = toMySQLDatetime(p.hora_listo_limpieza);

  out._skipEstadoUpdate = !hasEstado;
  return out;
}

module.exports = {
  ESTADO_TRANSITIONS,
  checkStateTransition,
  normalizePatch
};

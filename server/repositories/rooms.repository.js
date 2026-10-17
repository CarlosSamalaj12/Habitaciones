const pool = require("../config/db");
const { normalizePatch } = require("../services/state-machine.service");

async function getRoomId(modulo_id, etiqueta, conn) {
  const executor = conn || pool;
  const [rows] = await executor.query(
    "SELECT id FROM habitaciones WHERE modulo_id=? AND etiqueta=? LIMIT 1",
    [modulo_id, etiqueta]
  );
  return rows[0]?.id || null;
}

async function fetchOneRoom(habitacion_id, conn) {
  const executor = conn || pool;
  const [rows] = await executor.query(`
    SELECT
      h.id AS habitacion_id,
      h.etiqueta,
      h.modulo_id,
      COALESCE(e.estado,'libre') AS estado,
      COALESCE(e.adultos,0) AS adultos,
      COALESCE(e.ninos,0) AS ninos,
      COALESCE(e.observaciones,'') AS observaciones,
      e.desde,
      e.inicio_limpieza,
      e.fin_limpieza,
      e.inicio_repaso,
      e.repaso,
      e.camarera_asignada,
      e.tipo_limpieza,
      e.decorada,
      e.inspector_asignado,
      e.prioridad_limpieza,
      e.actualizado,
      e.hora_listo_limpieza
    FROM habitaciones h
    LEFT JOIN estados_habitacion e ON e.habitacion_id = h.id
    WHERE h.id = ?
    LIMIT 1
  `, [habitacion_id]);

  return rows[0] || null;
}

async function logRoomEvent({ before, after, patch, actor, source }, conn) {
  const executor = conn || pool;
  try {
    if (!before && !after) return;

    // Evitar registrar entradas si el estado de la habitación no cambió (evita duplicados/ruido)
    if (before && after && before.estado === after.estado) {
      return;
    }

    const ref = after || before || {};
    const patchJson = JSON.stringify(patch || {});
    const actorId = actor?.id ?? null;
    const actorName = actor?.name ?? null;
    const actorDept = actor?.dept ?? null;
    const src = source ?? null;

    let evento = "room_update";
    if (patch?.estado) evento = `estado_${String(patch.estado).trim().toLowerCase()}`;

    await executor.query(`
      INSERT INTO estados_habitacion_log
        (habitacion_id, modulo_id, etiqueta, actor_id, actor_name, actor_dept, source, evento, estado_prev, estado_new, patch_json)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      ref.habitacion_id || null,
      ref.modulo_id || null,
      ref.etiqueta || null,
      actorId,
      actorName,
      actorDept,
      src,
      evento,
      before?.estado || null,
      after?.estado || null,
      patchJson
    ]);
  } catch (e) {
    console.warn("No se pudo registrar historial:", e.message);
  }
}

async function resolveCamareraNameById(id, conn) {
  const executor = conn || pool;
  try {
    const numId = Number(id);
    if (!numId || isNaN(numId)) return null;
    const [cams] = await executor.query("SELECT nombre FROM camareras WHERE id=? LIMIT 1", [numId]);
    if (cams[0]?.nombre) return cams[0].nombre;
    const [users] = await executor.query("SELECT nombre FROM usuarios WHERE id=? LIMIT 1", [numId]);
    if (users[0]?.nombre) return users[0].nombre;
  } catch (e) {
    console.warn("⚠️ Error resolviendo camarera por ID:", e.message);
  }
  return null;
}

async function resolveCamarerasString(raw, conn) {
  if (!raw) return raw;
  const str = String(raw).trim();
  if (!str) return str;

  const parts = str.split(",").map(p => p.trim()).filter(Boolean);
  const resolved = [];

  for (const part of parts) {
    const m = /^camarera\s+(\d+)$/i.exec(part);
    if (m) {
      const realName = await resolveCamareraNameById(m[1], conn);
      resolved.push(realName || part);
    } else if (/^\d+$/.test(part)) {
      const realName = await resolveCamareraNameById(part, conn);
      resolved.push(realName || part);
    } else {
      resolved.push(part);
    }
  }

  return resolved.join(", ");
}

async function resolveCamarerasInObs(obs, conn) {
  if (!obs || typeof obs !== "string") return obs;
  const regex = /\bCamarera\s+(\d+)\b/gi;
  const matches = [...obs.matchAll(regex)];
  if (!matches.length) return obs;

  let result = obs;
  for (const m of matches) {
    const fullMatch = m[0];
    const id = m[1];
    const realName = await resolveCamareraNameById(id, conn);
    if (realName) {
      result = result.replace(fullMatch, realName);
    }
  }
  return result;
}

async function upsertEstadoByRoomId(habitacion_id, patch, conn) {
  const executor = conn || pool;

  // Blindaje: Si camarera_asignada u observaciones vienen con formato provisional, resolver nombre real
  if (patch && patch.camarera_asignada) {
    patch.camarera_asignada = await resolveCamarerasString(patch.camarera_asignada, executor);
  }
  if (patch && patch.observaciones) {
    patch.observaciones = await resolveCamarerasInObs(patch.observaciones, executor);
  }

  const p = normalizePatch(patch);

  // Si las columnas no están presentes en el patch original, ponemos 1 (skip). Si están, ponemos 0.
  const skipCamarera = (patch && "camarera_asignada" in patch) ? 0 : 1;
  const skipTipo = (patch && "tipo_limpieza" in patch) ? 0 : 1;
  const skipInspector = (patch && "inspector_asignado" in patch) ? 0 : 1;
  const skipPrioridad = (patch && "prioridad_limpieza" in patch) ? 0 : 1;

  await executor.query(`
    INSERT INTO estados_habitacion
      (habitacion_id, estado, adultos, ninos, observaciones, desde, inicio_limpieza, fin_limpieza, inicio_repaso, repaso, camarera_asignada, tipo_limpieza, decorada, inspector_asignado, prioridad_limpieza, hora_listo_limpieza)
    VALUES
      (?, ?, COALESCE(?,0), COALESCE(?,0), ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?,0), ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      estado = CASE WHEN ? = 1 THEN estado ELSE COALESCE(VALUES(estado), estado) END,
      adultos = COALESCE(VALUES(adultos), adultos),
      ninos = COALESCE(VALUES(ninos), ninos),
      observaciones = COALESCE(VALUES(observaciones), observaciones),
      desde = COALESCE(VALUES(desde), desde),
      inicio_limpieza = COALESCE(VALUES(inicio_limpieza), inicio_limpieza),
      fin_limpieza = COALESCE(VALUES(fin_limpieza), fin_limpieza),
      inicio_repaso = COALESCE(VALUES(inicio_repaso), inicio_repaso),
      repaso = COALESCE(VALUES(repaso), repaso),
      camarera_asignada = CASE WHEN ? = 1 THEN camarera_asignada ELSE VALUES(camarera_asignada) END,
      tipo_limpieza = CASE WHEN ? = 1 THEN tipo_limpieza ELSE VALUES(tipo_limpieza) END,
      decorada = CASE WHEN ? IS NULL THEN decorada ELSE VALUES(decorada) END,
      inspector_asignado = CASE WHEN ? = 1 THEN inspector_asignado ELSE VALUES(inspector_asignado) END,
      prioridad_limpieza = CASE WHEN ? = 1 THEN prioridad_limpieza ELSE VALUES(prioridad_limpieza) END,
      hora_listo_limpieza = COALESCE(VALUES(hora_listo_limpieza), hora_listo_limpieza),
      actualizado = CURRENT_TIMESTAMP
  `, [
    habitacion_id,
    p.estado ?? null,
    p.adultos,
    p.ninos,
    p.observaciones,
    p.desde,
    p.inicio_limpieza,
    p.fin_limpieza,
    p.inicio_repaso,
    p.repaso,
    p.camarera_asignada,
    p.tipo_limpieza,
    p.decorada,
    p.inspector_asignado,
    p.prioridad_limpieza,
    p.hora_listo_limpieza,
    p._skipEstadoUpdate ? 1 : 0,
    skipCamarera,
    skipTipo,
    p.decorada,
    skipInspector,
    skipPrioridad
  ]);
}

module.exports = {
  getRoomId,
  fetchOneRoom,
  logRoomEvent,
  resolveCamareraNameById,
  resolveCamarerasString,
  resolveCamarerasInObs,
  upsertEstadoByRoomId
};

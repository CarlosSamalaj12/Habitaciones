const pool = require("../config/db");
const { normalizeRole } = require("../middlewares/auth.middleware");
const { checkStateTransition, normalizePatch } = require("../services/state-machine.service");
const { getRoomId, fetchOneRoom, logRoomEvent, upsertEstadoByRoomId } = require("../repositories/rooms.repository");
const { emitRoomUpdate } = require("../services/socket.service");
const { sendPushToAll, sendRoomPushNotification } = require("../services/push.service");

// ===== HABITACIONES CRUD =====

async function createHabitacion(req, res) {
  try {
    const modulo_id = String(req.body?.modulo_id || "").trim();
    let etiqueta = String(req.body?.etiqueta || "").trim();
    const es_familiar = req.body?.es_familiar ? 1 : 0;

    if (!modulo_id) return res.status(400).json({ ok: false, error: "Modulo requerido" });
    if (!etiqueta) return res.status(400).json({ ok: false, error: "Etiqueta requerida" });

    await pool.query(
      "INSERT INTO habitaciones (modulo_id, etiqueta, es_familiar) VALUES (?,?,?)",
      [modulo_id, etiqueta, es_familiar]
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: "Esa habitacion ya existe en ese modulo" });
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function updateHabitacion(req, res) {
  try {
    const id = Number(req.body?.id);
    if (!id) return res.status(400).json({ ok: false, error: "ID requerido" });

    const etiqueta = req.body?.etiqueta !== undefined ? String(req.body.etiqueta).trim() : null;
    const es_familiar = req.body?.es_familiar !== undefined ? (req.body.es_familiar ? 1 : 0) : null;

    const sets = [];
    const params = [];
    if (etiqueta !== null) { sets.push("etiqueta=?"); params.push(etiqueta); }
    if (es_familiar !== null) { sets.push("es_familiar=?"); params.push(es_familiar); }

    if (!sets.length) return res.status(400).json({ ok: false, error: "Sin campos para actualizar" });

    params.push(id);
    await pool.query(`UPDATE habitaciones SET ${sets.join(", ")} WHERE id=?`, params);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function deleteHabitacion(req, res) {
  try {
    const id = Number(req.body?.id);
    if (!id) return res.status(400).json({ ok: false, error: "ID requerido" });
    const [hab] = await pool.query("SELECT modulo_id, etiqueta FROM habitaciones WHERE id=?", [id]);
    if (!hab.length) return res.status(404).json({ ok: false, error: "Habitacion no encontrada" });
    const { modulo_id, etiqueta } = hab[0];
    const [refs] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM inspecciones WHERE modulo_id=? AND habitacion_etiqueta=?",
      [modulo_id, etiqueta]
    );
    const count = Number(refs[0]?.cnt || 0);
    if (count > 0) {
      return res.status(409).json({
        ok: false,
        error: `No se puede eliminar: hay ${count} inspeccion${count !== 1 ? 'es' : ''} asociada${count !== 1 ? 's' : ''} a esta habitacion.`,
        code: "HAS_REFERENCES",
        refCount: count
      });
    }
    await pool.query("DELETE FROM habitaciones WHERE id=?", [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

// ===== PRECIOS ESPECIALES =====

async function updatePrecioEspecial(req, res) {
  try {
    const id = Number(req.body?.id);
    const precio_especial = req.body?.precio_especial;

    if (!id) return res.status(400).json({ ok: false, error: "ID de habitacion requerido" });

    if (precio_especial === null || precio_especial === undefined || precio_especial === '') {
      await pool.query("UPDATE habitaciones SET precio_especial=NULL WHERE id=?", [id]);
    } else {
      const precio = Number(precio_especial);
      if (!Number.isFinite(precio) || precio < 0) {
        return res.status(400).json({ ok: false, error: "Precio invalido" });
      }
      await pool.query("UPDATE habitaciones SET precio_especial=? WHERE id=?", [precio, id]);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("Error actualizando precio especial:", e);
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function getPreciosEspeciales(req, res) {
  try {
    const modulo_id = String(req.query?.modulo_id || "").trim();
    if (!modulo_id) return res.status(400).json({ ok: false, error: "Falta modulo_id" });
    const es_familiar = req.query?.es_familiar !== undefined ? (Number(req.query.es_familiar) ? 1 : 0) : null;

    let sql = `
      SELECT pe.id, pe.habitacion_id, pe.tipo_limpieza_id, pe.precio, pe.es_familiar,
             h.etiqueta AS habitacion_etiqueta, t.nombre AS tipo_nombre
      FROM precios_especiales_habitacion pe
      JOIN habitaciones h ON h.id = pe.habitacion_id
      JOIN tipos_limpieza t ON t.id = pe.tipo_limpieza_id
      WHERE h.modulo_id = ?
    `;
    const params = [modulo_id];
    if (es_familiar !== null) {
      sql += " AND pe.es_familiar = ?";
      params.push(es_familiar);
    }
    sql += " ORDER BY h.etiqueta, t.id, pe.es_familiar";

    const [rows] = await pool.query(sql, params);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function updatePreciosEspeciales(req, res) {
  try {
    const habitacion_id = Number(req.body?.habitacion_id);
    const tipo_limpieza_id = Number(req.body?.tipo_limpieza_id);
    const es_familiar = req.body?.es_familiar ? 1 : 0;
    const precio = req.body?.precio;

    if (!habitacion_id || !tipo_limpieza_id) {
      return res.status(400).json({ ok: false, error: "Faltan datos" });
    }

    if (precio === null || precio === undefined || precio === '' || Number(precio) <= 0) {
      await pool.query(
        "DELETE FROM precios_especiales_habitacion WHERE habitacion_id=? AND tipo_limpieza_id=? AND es_familiar=?",
        [habitacion_id, tipo_limpieza_id, es_familiar]
      );
    } else {
      const val = Number(precio);
      if (!Number.isFinite(val) || val < 0) {
        return res.status(400).json({ ok: false, error: "Precio invalido" });
      }
      await pool.query(`
        INSERT INTO precios_especiales_habitacion (habitacion_id, tipo_limpieza_id, es_familiar, precio)
        VALUES (?,?,?,?)
        ON DUPLICATE KEY UPDATE precio=?
      `, [habitacion_id, tipo_limpieza_id, es_familiar, val, val]);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("Error actualizando precio especial:", e);
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

// ===== ROOMS LIST & UPDATE =====

async function getRooms(req, res) {
  try {
    const modulo_id = String(req.query?.modulo_id || "").trim();
    if (!modulo_id) return res.status(400).json({ ok: false, error: "Falta modulo_id" });

    const [rows] = await pool.query(`
      SELECT
        h.id AS habitacion_id,
        h.etiqueta,
        h.precio_especial,
        h.es_familiar,
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
      WHERE h.modulo_id = ?
      ORDER BY h.etiqueta
    `, [modulo_id]);

    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function updateRoom(req, res) {
  try {
    const modulo_id = String(req.body?.modulo_id || "").trim();
    const etiqueta  = String(req.body?.etiqueta || "").trim();
    const patch     = req.body?.patch || null;
    const actor     = req.body?.actor || null;
    const source    = req.body?.source || null;

    const expectedState = req.body?.expectedState || null;

    if (!modulo_id || !etiqueta || !patch) {
      return res.status(400).json({ ok: false, error: "Faltan datos (modulo_id, etiqueta, patch)" });
    }

    if (patch?.estado === "ocupado") {
      const adults = Number(patch?.adultos);
      if (!Number.isFinite(adults) || adults < 1) {
        return res.status(400).json({ ok: false, error: "Debe haber al menos 1 adulto para ocupar" });
      }
    }

    const roomId = await getRoomId(modulo_id, etiqueta);
    if (!roomId) return res.status(404).json({ ok: false, error: "Habitación no existe" });
    const cur = await fetchOneRoom(roomId);

    console.log("=== API UPDATE ROOM ===");
    console.log("-> Body recibido:", JSON.stringify(req.body));
    console.log("-> Estado actual en BD (cur):", cur?.estado);

    if (expectedState && cur && String(expectedState).trim().toLowerCase() !== String(cur.estado || "libre").trim().toLowerCase()) {
      console.log("-> [BLOQUEADO] Pantalla desactualizada detected");
      return res.status(409).json({ ok: false, error: "DESACTUALIZADO", message: "La habitación cambió de estado en la base de datos." });
    }

    if (patch && !("estado" in patch)) {
      console.log("-> [INYECTADO] Inyectando estado de BD:", cur?.estado);
      patch.estado = cur?.estado || "libre";
    }

    if (patch?.estado === "mantenimiento") {
      if (cur?.estado !== "libre") {
        return res.status(400).json({ ok: false, error: "Solo se puede poner en mantenimiento si la habitación está LIBRE." });
      }
    }

    if (patch?.estado && String(patch.estado).trim().toLowerCase() !== "libre") {
      const role = normalizeRole(req.user?.dept || actor?.dept || "");
      const result = checkStateTransition(cur?.estado, patch.estado, role, source);
      if (!result.ok) {
        console.log(`-> [BLOQUEADO] ${result.error} (cur=${cur?.estado} -> new=${patch.estado}, role=${role}, source=${source || "-"})`);
        return res.status(result.code).json({ ok: false, error: result.error });
      }
    }

    if (patch?.estado === "libre") {
      const curEstado = String(cur?.estado || "").trim().toLowerCase();
      const role = normalizeRole(req.user?.dept || actor?.dept || "");
      const fromInspeccion = String(source || "").trim().toLowerCase() === "inspeccion";

      if (curEstado === "libre") {
        // OK
      } else {
        if (curEstado === "inspeccion") {
          if (role !== "ADMIN" && role !== "AMA_LLAVES" && !fromInspeccion) {
            return res.status(403).json({ ok: false, error: "Solo el Administrador o Ama de llaves puede liberar desde inspección." });
          }
        }

        if (curEstado === "limpieza" && role !== "ADMIN" && !(role === "AMA_LLAVES" && fromInspeccion)) {
          return res.status(403).json({ ok: false, error: "Solo Administrador puede liberar si está en LIMPIEZA." });
        }

        if (role === "AMA_LLAVES") {
          const estadosPermitidos = ["mantenimiento", "inspeccion", "repaso"];
          if (fromInspeccion) {
            estadosPermitidos.push("limpieza");
          }
          if (!estadosPermitidos.includes(curEstado)) {
            return res.status(403).json({ ok: false, error: "Ama de llaves solo puede liberar habitaciones en MANTENIMIENTO, INSPECCIÓN, REPASO o LIMPIEZA." });
          }
        } else if (role === "RECEPCION") {
          const allowed = new Set(["ocupado", "ocupada limpia", "mantenimiento", "lista", "repaso"]);
          if (!allowed.has(curEstado)) {
            return res.status(403).json({ ok: false, error: "Recepción solo puede liberar si está OCUPADA, en MANTENIMIENTO, REPASO o LISTA." });
          }
        } else if (role === "ADMIN") {
          const allowed = new Set(["ocupado", "ocupada limpia", "mantenimiento", "lista", "limpieza", "inspeccion", "repaso"]);
          if (!allowed.has(curEstado)) {
            return res.status(403).json({ ok: false, error: "Administrador solo puede liberar estados permitidos." });
          }
        } else {
          return res.status(403).json({ ok: false, error: "No tienes permiso para liberar habitaciones." });
        }
      }
    }

    if ("decorada" in patch) {
      const decoradaRole = normalizeRole(req.user?.dept || actor?.dept || "");
      if (decoradaRole !== "AMA_LLAVES" && decoradaRole !== "ADMIN") {
        return res.status(403).json({
          ok: false,
          error: "Solo Ama de llaves o Administrador puede marcar como decorada."
        });
      }
    }

    const normalized = normalizePatch(patch);
    await upsertEstadoByRoomId(roomId, normalized);
    const updated = await fetchOneRoom(roomId);
    await logRoomEvent({ before: cur, after: updated, patch, actor, source });

    emitRoomUpdate(updated);

    const oldEstado = cur?.estado || "";
    const newEstado = updated?.estado || "";
    const oldPrio = cur?.prioridad_limpieza || "";
    const newPrio = updated?.prioridad_limpieza || "";
    const src = String(source || "").trim().toLowerCase();

    const prioCambio = String(oldPrio || "").toLowerCase() !== String(newPrio || "").toLowerCase();
    const tienePrio = String(newPrio || "").toLowerCase() === "alta";

    if (prioCambio && oldEstado === newEstado) {
      sendPushToAll(
        modulo_id + " - " + etiqueta,
        tienePrio ? "🔴 PRIORIDAD ALTA - Habitacion marcada como prioridad" : "Prioridad removida",
        "./index.html"
      ).catch(() => {});
    } else if (newEstado === "ocupado") {
      sendPushToAll(
        modulo_id + " - " + etiqueta,
        "OCUPADO - Habitacion ocupada",
        "./index.html"
      ).catch(() => {});
    } else if ((oldEstado === "ocupado" || oldEstado === "ocupada limpia") && newEstado === "lista") {
      sendPushToAll(
        modulo_id + " - " + etiqueta,
        "LISTA PARA LIMPIEZA - Habitacion liberada para limpieza",
        "./index.html"
      ).catch(() => {});
    } else if (oldEstado === "inspeccion" && newEstado === "libre" && src === "inspeccion") {
      sendPushToAll(
        modulo_id + " - " + etiqueta,
        "INSPECCION COMPLETADA - Habitacion liberada",
        "./index.html"
      ).catch(() => {});
    } else {
      sendRoomPushNotification(updated).catch(() => {});
    }

    res.json({ ok: true, data: updated });
  } catch (e) {
    console.error("❌ Error en /api/room/update:", e);
    res.status(500).json({ ok: false, error: e.message || "Error interno del servidor" });
  }
}

module.exports = {
  createHabitacion,
  updateHabitacion,
  deleteHabitacion,
  updatePrecioEspecial,
  getPreciosEspeciales,
  updatePreciosEspeciales,
  getRooms,
  updateRoom
};

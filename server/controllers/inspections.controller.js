const pool = require("../config/db");
const { toMySQLDatetime } = require("../utils/date.utils");
const { normalizeRole } = require("../middlewares/auth.middleware");
const { normalizePatch } = require("../services/state-machine.service");
const { getRoomId, fetchOneRoom, logRoomEvent, upsertEstadoByRoomId } = require("../repositories/rooms.repository");
const { emitRoomUpdate } = require("../services/socket.service");
const { sendPushToAll } = require("../services/push.service");

// POST /api/inspecciones/guardar
async function guardarInspeccion(req, res) {
  const conn = await pool.getConnection();
  try {
    const data = req.body;
    if (!data?.modulo_id || !data?.habitacion_etiqueta || !data?.fecha) {
      conn.release();
      return res.status(400).json({ ok: false, error: "Faltan datos requeridos" });
    }

    await conn.beginTransaction();

    const inicio = toMySQLDatetime(data.inicio_limpieza);
    const fin = toMySQLDatetime(data.fin_limpieza);
    const horaChk = toMySQLDatetime(data.hora_checklist);

    // Soportar camarera_ids (array) o camarera_id (legacy unico)
    let camareraIds = [];
    if (Array.isArray(data.camarera_ids) && data.camarera_ids.length) {
      camareraIds = data.camarera_ids.map(id => Number(id)).filter(id => id);
    } else if (data.camarera_id) {
      camareraIds = [Number(data.camarera_id)].filter(id => id);
    }
    const primaryCamareraId = camareraIds[0] || null;

    // Verificar si ya existe una inspeccion identica
    const [existing] = await conn.query(`
      SELECT id FROM inspecciones
      WHERE modulo_id=? AND habitacion_etiqueta=? AND fecha=?
        AND ((? IS NULL AND inicio_limpieza IS NULL) OR inicio_limpieza=?)
        AND ((? IS NULL AND fin_limpieza IS NULL) OR fin_limpieza=?)
        AND inspector_nombre=?
      LIMIT 1
    `, [
      data.modulo_id, data.habitacion_etiqueta, data.fecha,
      inicio, inicio,
      fin, fin,
      data.inspector_nombre || ''
    ]);

    let inspeccion_id = null;
    let isDedup = false;

    if (existing.length) {
      inspeccion_id = existing[0].id;
      isDedup = true;
      const updFields = [];
      const updParams = [];
      if (data.tipo_limpieza_id) { updFields.push("tipo_limpieza_id=?"); updParams.push(Number(data.tipo_limpieza_id)); }
      if (data.camarera_id) { updFields.push("camarera_id=?"); updParams.push(Number(data.camarera_id)); }
      if (data.es_familiar !== undefined) { updFields.push("es_familiar=?"); updParams.push(data.es_familiar ? 1 : 0); }
      if (data.inspector_nombre !== undefined) { updFields.push("inspector_nombre=?"); updParams.push(String(data.inspector_nombre || '').trim()); }
      if (data.observaciones !== undefined) { updFields.push("observaciones=?"); updParams.push(String(data.observaciones || '').trim()); }
      if (updFields.length) {
        updParams.push(inspeccion_id);
        await conn.query(`UPDATE inspecciones SET ${updFields.join(", ")} WHERE id=?`, updParams);
      }
      if (Array.isArray(data.detalles) && data.detalles.length) {
        await conn.query("DELETE FROM inspeccion_detalles WHERE inspeccion_id=?", [inspeccion_id]);
        const validDetails = data.detalles
          .filter(d => d.item_id)
          .map(d => [inspeccion_id, d.item_id, ['CUMPLE','NO_CUMPLE','NO_APLICA'].includes(d.estado) ? d.estado : 'NO_APLICA']);
        if (validDetails.length) {
          const placeholders = validDetails.map(() => '(?,?,?)').join(',');
          await conn.query(`INSERT INTO inspeccion_detalles (inspeccion_id, item_id, estado) VALUES ${placeholders}`, validDetails.flat());
        }
      }
      await conn.query("DELETE FROM inspecciones_camareras WHERE inspeccion_id=?", [inspeccion_id]);
      if (camareraIds.length) {
        const camPlaceholders = camareraIds.map(() => '(?,?)').join(',');
        await conn.query(`INSERT INTO inspecciones_camareras (inspeccion_id, camarera_id) VALUES ${camPlaceholders}`, camareraIds.flatMap(id => [inspeccion_id, id]));
      }
    } else {
      let horaListo = null;
      try {
        const [roomRows] = await conn.query(
          "SELECT id FROM habitaciones WHERE modulo_id=? AND etiqueta=? LIMIT 1",
          [data.modulo_id, data.habitacion_etiqueta]
        );
        if (roomRows.length) {
          const [estRows] = await conn.query(
            "SELECT hora_listo_limpieza FROM estados_habitacion WHERE habitacion_id=?",
            [roomRows[0].id]
          );
          if (estRows.length && estRows[0].hora_listo_limpieza) {
            horaListo = estRows[0].hora_listo_limpieza;
          }
        }
      } catch (e) {
        console.warn("No se pudo capturar hora_listo_limpieza:", e.message);
      }

      let moduloNombre = data.modulo_nombre;
      if (!moduloNombre) {
        try {
          const [modRow] = await conn.query("SELECT descripcion FROM modulos WHERE id=?", [data.modulo_id]);
          if (modRow.length) moduloNombre = modRow[0].descripcion;
        } catch (e) {
          console.warn("No se pudo resolver modulo_nombre:", e.message);
        }
      }

      const [header] = await conn.query(`
        INSERT INTO inspecciones
          (modulo_id, modulo_nombre, habitacion_etiqueta, fecha, camarera_id, tipo_limpieza_id,
           inspector_nombre, inspector_dept, inicio_limpieza, fin_limpieza, hora_checklist,
           hora_listo_limpieza, observaciones, es_decorada, es_familiar)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `, [
        data.modulo_id,
        moduloNombre || '',
        data.habitacion_etiqueta,
        data.fecha,
        primaryCamareraId,
        data.tipo_limpieza_id || null,
        data.inspector_nombre || '',
        data.inspector_dept || '',
        inicio, fin, horaChk,
        horaListo,
        data.observaciones || null,
        data.es_decorada ? 1 : 0,
        data.es_familiar ? 1 : 0
      ]);

      inspeccion_id = header.insertId;

      if (camareraIds.length) {
        const camPlaceholders = camareraIds.map(() => '(?,?)').join(',');
        await conn.query(`INSERT INTO inspecciones_camareras (inspeccion_id, camarera_id) VALUES ${camPlaceholders}`, camareraIds.flatMap(id => [inspeccion_id, id]));
      }

      if (Array.isArray(data.detalles)) {
        const validDetails = data.detalles
          .filter(d => d.item_id)
          .map(d => [inspeccion_id, d.item_id, ['CUMPLE','NO_CUMPLE','NO_APLICA'].includes(d.estado) ? d.estado : 'NO_APLICA']);
        if (validDetails.length) {
          const placeholders = validDetails.map(() => '(?,?,?)').join(',');
          await conn.query(`INSERT INTO inspeccion_detalles (inspeccion_id, item_id, estado) VALUES ${placeholders}`, validDetails.flat());
        }
      }
    }

    // Actualización atómica de la habitación
    const roomId = await getRoomId(data.modulo_id, data.habitacion_etiqueta, conn);
    let cur = null;
    let updatedRoom = null;
    let nextEstado = data.next_estado;

    if (roomId) {
      cur = await fetchOneRoom(roomId, conn);
      const curEstado = String(cur?.estado || "").trim().toLowerCase();

      if (!nextEstado) {
        if (Number(data.es_decorada) === 1 && (curEstado === "ocupado" || curEstado === "ocupada limpia")) {
          nextEstado = cur?.estado;
        } else if (data.tipo_limpieza_id) {
          const [tRows] = await conn.query("SELECT nombre FROM tipos_limpieza WHERE id = ?", [data.tipo_limpieza_id]);
          if (tRows.length) {
            const nameLower = String(tRows[0].nombre).toLowerCase();
            if (nameLower.includes("estadia") || nameLower.includes("quiere")) {
              nextEstado = "ocupada limpia";
            } else {
              nextEstado = "libre";
            }
          } else {
            nextEstado = "libre";
          }
        } else {
          nextEstado = "libre";
        }
      }

      const role = normalizeRole(data.inspector_dept || "");
      const fromInspeccion = true;

      if (nextEstado === "libre" && curEstado !== "libre") {
        if (curEstado === "inspeccion") {
          if (role !== "ADMIN" && role !== "AMA_LLAVES") {
            throw new Error("Solo el Administrador o Ama de llaves puede liberar desde inspección.");
          }
        }
        if (curEstado === "limpieza" && role !== "ADMIN" && role !== "AMA_LLAVES") {
          throw new Error("Solo Administrador o Ama de llaves puede liberar desde limpieza.");
        }
        if (role === "AMA_LLAVES") {
          const estadosPermitidos = ["mantenimiento", "inspeccion", "repaso", "limpieza"];
          if (Number(data.es_decorada) === 1) {
            estadosPermitidos.push("ocupado", "ocupada limpia");
          }
          if (!estadosPermitidos.includes(curEstado)) {
            throw new Error("Ama de llaves solo puede liberar habitaciones en MANTENIMIENTO, INSPECCIÓN, REPASO o LIMPIEZA.");
          }
        }
      }

      const patch = {
        estado: nextEstado,
        decorada: Number(data.es_decorada) === 1 ? 1 : 0,
        prioridad_limpieza: null,
        source: "inspeccion"
      };
      const normalized = normalizePatch(patch);
      await upsertEstadoByRoomId(roomId, normalized, conn);
      updatedRoom = await fetchOneRoom(roomId, conn);

      const actor = {
        id: null,
        name: data.inspector_nombre || "Sistema",
        dept: data.inspector_dept || "Ama de llaves"
      };
      await logRoomEvent({ before: cur, after: updatedRoom, patch, actor, source: "inspeccion" }, conn);
    }

    await conn.commit();
    conn.release();

    if (updatedRoom) {
      emitRoomUpdate(updatedRoom);

      const oldEstado = cur?.estado || "";
      const newEstado = updatedRoom?.estado || "";
      if (oldEstado === "inspeccion" && newEstado === "libre") {
        sendPushToAll(
          data.modulo_id + " - " + data.habitacion_etiqueta,
          "INSPECCION COMPLETADA - Habitacion liberada",
          "./index.html"
        ).catch(() => {});
      }
    }

    res.json({ ok: true, id: inspeccion_id, dedup: isDedup });
  } catch (e) {
    await conn.rollback();
    conn.release();
    console.error("Error guardando inspeccion transaccional:", e);
    res.status(500).json({ ok: false, error: e.message || "Error interno del servidor" });
  }
}

// GET /api/inspecciones
async function getInspecciones(req, res) {
  try {
    const { modulo_id, fecha_desde, fecha_hasta, limit } = req.query;
    let sql = `
      SELECT i.*, c.nombre AS camarera_nombre, t.nombre AS tipo_nombre,
        (SELECT GROUP_CONCAT(cam.nombre ORDER BY cam.id) FROM inspecciones_camareras ic2 JOIN camareras cam ON cam.id = ic2.camarera_id WHERE ic2.inspeccion_id = i.id) AS camareras_nombres
      FROM inspecciones i
      LEFT JOIN camareras c ON c.id = i.camarera_id
      LEFT JOIN tipos_limpieza t ON t.id = i.tipo_limpieza_id
      WHERE 1=1
    `;
    const params = [];
    if (modulo_id) { sql += " AND i.modulo_id=?"; params.push(modulo_id); }
    if (fecha_desde) { sql += " AND i.fecha>=?"; params.push(fecha_desde); }
    if (fecha_hasta) { sql += " AND i.fecha<=?"; params.push(fecha_hasta); }
    sql += " ORDER BY i.created_at DESC";
    if (limit) { sql += " LIMIT ?"; params.push(Number(limit)); }

    const [rows] = await pool.query(sql, params);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

// POST /api/inspecciones/buscar
async function buscarInspecciones(req, res) {
  try {
    const {
      fecha_desde,
      fecha_hasta,
      camarera_id,
      modulo_id,
      habitacion_etiqueta
    } = req.body || {};

    let sql = `
      SELECT i.id, i.modulo_id, i.habitacion_etiqueta, i.fecha,
             i.camarera_id, i.tipo_limpieza_id, i.inspector_nombre,
             i.inicio_limpieza, i.fin_limpieza, i.hora_checklist,
             i.observaciones, i.es_decorada, i.es_familiar,
             i.created_at,
             c.nombre AS camarera_nombre, t.nombre AS tipo_nombre,
             (SELECT GROUP_CONCAT(cam.nombre ORDER BY cam.id) FROM inspecciones_camareras ic2 JOIN camareras cam ON cam.id = ic2.camarera_id WHERE ic2.inspeccion_id = i.id) AS camareras_nombres
      FROM inspecciones i
      LEFT JOIN camareras c ON c.id = i.camarera_id
      LEFT JOIN tipos_limpieza t ON t.id = i.tipo_limpieza_id
      WHERE 1=1
    `;
    const params = [];

    if (fecha_desde && fecha_hasta && fecha_desde === fecha_hasta) {
      sql += " AND DATE(i.fecha) = ?";
      params.push(String(fecha_desde).trim());
    } else {
      if (fecha_desde) { sql += " AND DATE(i.fecha) >= ?"; params.push(String(fecha_desde).trim()); }
      if (fecha_hasta) { sql += " AND DATE(i.fecha) <= ?"; params.push(String(fecha_hasta).trim()); }
    }
    if (camarera_id) { sql += " AND i.camarera_id = ?"; params.push(Number(camarera_id)); }
    if (modulo_id) { sql += " AND i.modulo_id = ?"; params.push(String(modulo_id).trim()); }
    if (habitacion_etiqueta) { sql += " AND i.habitacion_etiqueta = ?"; params.push(String(habitacion_etiqueta).trim()); }

    sql += " ORDER BY i.fecha DESC, i.created_at DESC LIMIT 500";

    const [rows] = await pool.query(sql, params);
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error("Error en buscar inspecciones:", e);
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

// POST /api/inspecciones/actualizar
async function actualizarInspeccion(req, res) {
  const conn = await pool.getConnection();
  try {
    const id = Number(req.body?.id);
    if (!id) {
      conn.release();
      return res.status(400).json({ ok: false, error: "ID requerido" });
    }

    const [exist] = await conn.query("SELECT modulo_id, habitacion_etiqueta, fecha, tipo_limpieza_id, inspector_nombre FROM inspecciones WHERE id=?", [id]);
    if (!exist.length) {
      conn.release();
      return res.status(404).json({ ok: false, error: "Inspeccion no encontrada" });
    }
    const currentIns = exist[0];

    const updates = [];
    const params = [];

    if (req.body?.fecha !== undefined) {
      updates.push("fecha=?");
      params.push(String(req.body.fecha).trim());
    }
    let camareraIds = [];
    let hasCamareraIds = false;
    if (req.body?.camarera_ids !== undefined) {
      hasCamareraIds = true;
      if (Array.isArray(req.body.camarera_ids)) {
        camareraIds = req.body.camarera_ids.map(Number).filter(id => id);
      }
      updates.push("camarera_id=?");
      params.push(camareraIds[0] || null);
    } else if (req.body?.camarera_id !== undefined) {
      updates.push("camarera_id=?");
      params.push(req.body.camarera_id ? Number(req.body.camarera_id) : null);
    }
    if (req.body?.tipo_limpieza_id !== undefined) {
      updates.push("tipo_limpieza_id=?");
      params.push(req.body.tipo_limpieza_id ? Number(req.body.tipo_limpieza_id) : null);
    }
    if (req.body?.observaciones !== undefined) {
      updates.push("observaciones=?");
      params.push(String(req.body.observaciones || '').trim());
    }
    if (req.body?.es_familiar !== undefined) {
      updates.push("es_familiar=?");
      params.push(req.body.es_familiar ? 1 : 0);
    }
    if (req.body?.rectificado !== undefined) {
      updates.push("rectificado=?");
      params.push(req.body.rectificado ? 1 : 0);
    }
    if (req.body?.motivo_rectificacion !== undefined) {
      updates.push("motivo_rectificacion=?");
      params.push(String(req.body.motivo_rectificacion || '').trim());
    }
    if (req.body?.inspector_nombre !== undefined) {
      updates.push("inspector_nombre=?");
      params.push(String(req.body.inspector_nombre || '').trim());
    }
    if (req.body?.modulo_id !== undefined) {
      const nuevoModuloId = String(req.body.modulo_id).trim();
      updates.push("modulo_id=?", "modulo_nombre=?");
      params.push(nuevoModuloId);
      const [modRow] = await conn.query("SELECT descripcion FROM modulos WHERE id=?", [nuevoModuloId]);
      params.push(modRow.length ? modRow[0].descripcion : nuevoModuloId);
    }
    if (req.body?.habitacion_etiqueta !== undefined) {
      updates.push("habitacion_etiqueta=?");
      params.push(String(req.body.habitacion_etiqueta).trim());
    }

    if (!updates.length) {
      conn.release();
      return res.status(400).json({ ok: false, error: "No hay campos para actualizar" });
    }

    await conn.beginTransaction();

    params.push(id);
    await conn.query(`UPDATE inspecciones SET ${updates.join(", ")} WHERE id=?`, params);

    if (hasCamareraIds) {
      await conn.query("DELETE FROM inspecciones_camareras WHERE inspeccion_id=?", [id]);
      if (camareraIds.length) {
        const camPlaceholders = camareraIds.map(() => '(?,?)').join(',');
        await conn.query(`INSERT INTO inspecciones_camareras (inspeccion_id, camarera_id) VALUES ${camPlaceholders}`, camareraIds.flatMap(cid => [id, cid]));
      }
    } else if (req.body?.camarera_id !== undefined) {
      const newCamareraId = req.body.camarera_id ? Number(req.body.camarera_id) : null;
      await conn.query("DELETE FROM inspecciones_camareras WHERE inspeccion_id=?", [id]);
      if (newCamareraId) {
        await conn.query("INSERT INTO inspecciones_camareras (inspeccion_id, camarera_id) VALUES (?,?)", [id, newCamareraId]);
      }
    }

    const targetModuloId = req.body.modulo_id !== undefined ? String(req.body.modulo_id).trim() : currentIns.modulo_id;
    const targetHabEtiqueta = req.body.habitacion_etiqueta !== undefined ? String(req.body.habitacion_etiqueta).trim() : currentIns.habitacion_etiqueta;

    const [latestRows] = await conn.query(
      "SELECT id FROM inspecciones WHERE modulo_id = ? AND habitacion_etiqueta = ? ORDER BY fecha DESC, created_at DESC LIMIT 1",
      [targetModuloId, targetHabEtiqueta]
    );

    const isLatest = latestRows.length && latestRows[0].id === id;

    let roomId = null;
    try {
      roomId = await getRoomId(targetModuloId, targetHabEtiqueta, conn);
    } catch(e) {
      console.warn("No se pudo obtener roomId:", e.message);
    }

    if (isLatest && roomId) {
      const targetTipoId = req.body.tipo_limpieza_id !== undefined ? req.body.tipo_limpieza_id : currentIns.tipo_limpieza_id;
      let newRoomEstado = "libre";
      let tipoLimpiezaNombre = null;

      if (targetTipoId) {
        const [tRows] = await conn.query("SELECT nombre FROM tipos_limpieza WHERE id = ?", [targetTipoId]);
        if (tRows.length) {
          tipoLimpiezaNombre = tRows[0].nombre;
          const nameLower = String(tipoLimpiezaNombre).toLowerCase();
          if (nameLower.includes("estadia") || nameLower.includes("quiere")) {
            newRoomEstado = "ocupada limpia";
          }
        }
      }

      const [roomRow] = await conn.query("SELECT estado FROM estados_habitacion WHERE habitacion_id = ?", [roomId]);
      if (roomRow.length && roomRow[0].estado !== newRoomEstado) {
        const prevEstado = roomRow[0].estado;

        if (newRoomEstado === "ocupada limpia") {
          let adultos = 2;
          let ninos = 0;
          const [logRows] = await conn.query(
            "SELECT patch_json FROM estados_habitacion_log WHERE habitacion_id = ? AND evento = 'estado_ocupado' ORDER BY id DESC LIMIT 1",
            [roomId]
          );
          if (logRows.length) {
            try {
              const patchObj = JSON.parse(logRows[0].patch_json || "{}");
              if (patchObj.adultos !== undefined && patchObj.adultos !== null) adultos = Number(patchObj.adultos);
              if (patchObj.ninos !== undefined && patchObj.ninos !== null) ninos = Number(patchObj.ninos);
            } catch (jsonErr) {}
          }

          await conn.query(
            "UPDATE estados_habitacion SET estado = ?, adultos = ?, ninos = ?, tipo_limpieza = ? WHERE habitacion_id = ?",
            [newRoomEstado, adultos, ninos, tipoLimpiezaNombre, roomId]
          );
        } else {
          await conn.query(
            "UPDATE estados_habitacion SET estado = ?, adultos = 0, ninos = 0, tipo_limpieza = NULL WHERE habitacion_id = ?",
            [newRoomEstado, roomId]
          );
        }

        const actorName = req.body.inspector_nombre || currentIns.inspector_nombre || 'Administrador';
        await conn.query(`
          INSERT INTO estados_habitacion_log 
            (habitacion_id, modulo_id, etiqueta, actor_name, actor_dept, source, evento, estado_prev, estado_new, patch_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          roomId,
          targetModuloId,
          targetHabEtiqueta,
          actorName,
          'Administración',
          'inspeccion',
          `estado_${newRoomEstado}`,
          prevEstado,
          newRoomEstado,
          JSON.stringify({ estado: newRoomEstado, source: "inspeccion_actualizar" })
        ]);

        conn._emitRoomUpdateId = roomId;
      }
    }

    await conn.commit();
    conn.release();

    if (conn._emitRoomUpdateId) {
      try {
        const updated = await fetchOneRoom(conn._emitRoomUpdateId);
        if (updated) {
          emitRoomUpdate(updated);
        }
      } catch (e) {
        console.warn("No se pudo emitir por sockets:", e.message);
      }
    }

    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    conn.release();
    console.error("Error actualizando inspeccion:", e);
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

// POST /api/inspecciones/detalle/actualizar
async function actualizarDetalle(req, res) {
  try {
    const id = Number(req.body?.id);
    const estado = String(req.body?.estado || '').trim().toUpperCase();

    if (!id) return res.status(400).json({ ok: false, error: "ID de detalle requerido" });
    if (!['CUMPLE','NO_CUMPLE','NO_APLICA'].includes(estado)) {
      return res.status(400).json({ ok: false, error: "Estado invalido. Use CUMPLE, NO_CUMPLE o NO_APLICA" });
    }

    await pool.query("UPDATE inspeccion_detalles SET estado=? WHERE id=?", [estado, id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("Error actualizando detalle:", e);
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

// POST /api/inspecciones/eliminar
async function eliminarInspeccion(req, res) {
  try {
    const id = Number(req.body?.id);
    if (!id) return res.status(400).json({ ok: false, error: "ID requerido" });

    const [exist] = await pool.query("SELECT id FROM inspecciones WHERE id=?", [id]);
    if (!exist.length) return res.status(404).json({ ok: false, error: "Inspeccion no encontrada" });

    await pool.query("DELETE FROM inspeccion_detalles WHERE inspeccion_id=?", [id]);
    await pool.query("DELETE FROM inspecciones_camareras WHERE inspeccion_id=?", [id]);
    await pool.query("DELETE FROM inspecciones WHERE id=?", [id]);

    res.json({ ok: true });
  } catch (e) {
    console.error("Error eliminando inspeccion:", e);
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

// GET /api/inspecciones/:id
async function getInspeccionById(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "ID requerido" });

    const [ins] = await pool.query(`
      SELECT i.*, c.nombre AS camarera_nombre, t.nombre AS tipo_nombre
      FROM inspecciones i
      LEFT JOIN camareras c ON c.id = i.camarera_id
      LEFT JOIN tipos_limpieza t ON t.id = i.tipo_limpieza_id
      WHERE i.id=?
    `, [id]);
    if (!ins.length) return res.status(404).json({ ok: false, error: "No encontrada" });

    const [detalles] = await pool.query(`
      SELECT d.id, d.item_id, d.estado, ci.nombre AS item_nombre, cc.nombre AS categoria_nombre
      FROM inspeccion_detalles d
      JOIN checklist_items ci ON ci.id = d.item_id
      JOIN checklist_categorias cc ON cc.id = ci.categoria_id
      WHERE d.inspeccion_id=?
      ORDER BY ci.orden
    `, [id]);

    const [cams] = await pool.query("SELECT camarera_id FROM inspecciones_camareras WHERE inspeccion_id=?", [id]);
    const camarera_ids = cams.map(row => row.camarera_id);

    res.json({ ok: true, data: { ...ins[0], detalles, camarera_ids } });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

module.exports = {
  guardarInspeccion,
  getInspecciones,
  buscarInspecciones,
  actualizarInspeccion,
  actualizarDetalle,
  eliminarInspeccion,
  getInspeccionById
};

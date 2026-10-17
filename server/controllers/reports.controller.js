const pool = require("../config/db");

function colorDeEstado(estado) {
  const map = {
    "ocupado": "#EF4444",
    "ocupada limpia": "#EF4444",
    "lista": "#FBBF24",
    "limpieza": "#C8A57A",
    "inspeccion": "#38BDF8",
    "libre": "#22C55E",
    "mantenimiento": "#7C3AED",
    "repaso": "#826142"
  };
  return map[estado] || "#9AA6C6";
}

// GET /api/reportes/pagos
async function getReportePagos(req, res) {
  try {
    const fecha_desde = String(req.query?.fecha_desde || "").trim();
    const fecha_hasta = String(req.query?.fecha_hasta || "").trim();
    const filtro_camarera_id = req.query?.camarera_id ? Number(req.query.camarera_id) : null;
    const modulo_id = String(req.query?.modulo_id || "").trim();

    if (!fecha_desde || !fecha_hasta) {
      return res.status(400).json({ ok: false, error: "Faltan fecha_desde y fecha_hasta" });
    }

    console.log(`[PAGOS] fecha_desde="${fecha_desde}" fecha_hasta="${fecha_hasta}"`);
    const isSameDay = fecha_desde === fecha_hasta;
    let fechaWhere;
    let queryParams;
    if (isSameDay) {
      fechaWhere = "DATE(i.fecha) = ?";
      queryParams = [fecha_desde];
    } else {
      fechaWhere = "DATE(i.fecha) >= ? AND DATE(i.fecha) <= ?";
      queryParams = [fecha_desde, fecha_hasta];
    }

    const sqlInspecciones = `
      SELECT
        i.id, i.modulo_nombre, i.habitacion_etiqueta, i.fecha,
        i.inicio_limpieza, i.fin_limpieza, i.hora_checklist,
        i.es_familiar, i.observaciones,
        i.camarera_id, i.rectificado, i.motivo_rectificacion,
        i.inspector_nombre, i.inspector_dept,
        t.id AS tipo_limpieza_id, t.nombre AS tipo_nombre,
        COALESCE(det.cumplen, 0) AS cumplen,
        COALESCE(det.no_cumplen, 0) AS no_cumplen,
        COALESCE(det.no_aplica, 0) AS no_aplica,
        COALESCE(det.total_items, 0) AS total_items,
        IF(i.rectificado = 1, 0, COALESCE(pe.precio, 0)) AS pago_base,
        GROUP_CONCAT(DISTINCT ic.camarera_id ORDER BY ic.camarera_id) AS camareras_list,
        GROUP_CONCAT(DISTINCT cam.nombre ORDER BY cam.id) AS camareras_nombres
      FROM inspecciones i
      LEFT JOIN tipos_limpieza t ON t.id = i.tipo_limpieza_id
      LEFT JOIN habitaciones h ON h.modulo_id = i.modulo_id AND h.etiqueta = i.habitacion_etiqueta
      LEFT JOIN precios_especiales_habitacion pe ON pe.habitacion_id = h.id AND pe.tipo_limpieza_id = i.tipo_limpieza_id AND pe.es_familiar = COALESCE(i.es_familiar, 0)
      LEFT JOIN (
        SELECT inspeccion_id,
          SUM(estado = 'CUMPLE') AS cumplen,
          SUM(estado = 'NO_CUMPLE') AS no_cumplen,
          SUM(estado = 'NO_APLICA') AS no_aplica,
          COUNT(*) AS total_items
        FROM inspeccion_detalles
        GROUP BY inspeccion_id
      ) det ON det.inspeccion_id = i.id
      LEFT JOIN inspecciones_camareras ic ON ic.inspeccion_id = i.id
      LEFT JOIN camareras cam ON cam.id = ic.camarera_id
      WHERE ${fechaWhere}
        AND (? = '' OR i.modulo_id = ?)
      GROUP BY i.id
      ORDER BY i.fecha DESC, i.created_at DESC
    `;

    const [inspecciones] = await pool.query(sqlInspecciones, [...queryParams, modulo_id, modulo_id]);

    const camarerasMap = {};
    const [camarerasRows] = await pool.query("SELECT id, nombre, factura FROM camareras WHERE activo=1");
    camarerasRows.forEach(c => { camarerasMap[c.id] = c; });

    const countPorDia = {};
    inspecciones.forEach(insp => {
      if (!insp.camareras_list) return;
      if (Number(insp.rectificado) === 1) return;
      const camarerasIds = String(insp.camareras_list).split(",").map(Number).filter(id => id);
      camarerasIds.forEach(cid => {
        if (!countPorDia[cid]) countPorDia[cid] = {};
        const dia = String(insp.fecha).slice(0, 10);
        countPorDia[cid][dia] = (countPorDia[cid][dia] || 0) + 1;
      });
    });

    let pct = 30, extraSi = 46, extraNo = 36;
    try {
      const [cfg] = await pool.query("SELECT porcentaje_factura, extra_factura_si, extra_factura_no FROM configuracion_pagos LIMIT 1");
      if (cfg.length) {
        pct = cfg[0].porcentaje_factura !== undefined ? Number(cfg[0].porcentaje_factura) : 30;
        extraSi = Number(cfg[0].extra_factura_si) || 46;
        extraNo = Number(cfg[0].extra_factura_no) || 36;
      }
    } catch (e) {}

    const filasExpandidas = [];
    inspecciones.forEach(insp => {
      if (!insp.camareras_list) return;
      let camarerasIds = String(insp.camareras_list).split(",").map(Number).filter(id => id);
      if (filtro_camarera_id) {
        camarerasIds = camarerasIds.filter(id => id === filtro_camarera_id);
      }
      if (!camarerasIds.length) return;

      const numCamareras = camarerasIds.length;
      const pagoBaseDividido = (Number(insp.pago_base) || 0) / numCamareras;
      const dia = String(insp.fecha).slice(0, 10);

      camarerasIds.forEach(cid => {
        const cam = camarerasMap[cid];
        if (!cam) return;
        const isRect = Number(insp.rectificado) === 1;
        const countDia = countPorDia[cid]?.[dia] || 0;
        const aplicaExtra = !isRect && (countDia > 6);
        filasExpandidas.push({
          id: insp.id,
          modulo_nombre: insp.modulo_nombre,
          habitacion_etiqueta: insp.habitacion_etiqueta,
          fecha: insp.fecha,
          inicio_limpieza: insp.inicio_limpieza,
          fin_limpieza: insp.fin_limpieza,
          hora_checklist: insp.hora_checklist,
          es_familiar: insp.es_familiar,
          observaciones: insp.observaciones,
          rectificado: insp.rectificado,
          motivo_rectificacion: insp.motivo_rectificacion,
          inspector_nombre: insp.inspector_nombre,
          inspector_dept: insp.inspector_dept,
          camarera_id: cid,
          camarera_nombre: cam.nombre,
          camarera_factura: cam.factura,
          camareras_nombres: insp.camareras_nombres || cam.nombre,
          camareras_list: insp.camareras_list,
          tipo_limpieza_id: insp.tipo_limpieza_id,
          tipo_nombre: insp.tipo_nombre,
          cumplen: insp.cumplen,
          no_cumplen: insp.no_cumplen,
          no_aplica: insp.no_aplica,
          total_items: insp.total_items,
          pago_base: pagoBaseDividido,
          count_habitaciones_dia: countDia,
          aplica_extra: aplicaExtra,
          pago_final: Math.round(pagoBaseDividido * 100) / 100
        });
      });
    });

    const grupoPagos = {};
    filasExpandidas.forEach(r => {
      const cid = r.camarera_id;
      const dia = String(r.fecha).slice(0, 10);
      if (!grupoPagos[cid]) {
        grupoPagos[cid] = {
          factura: Number(r.camarera_factura),
          nombre: r.camarera_nombre,
          por_dia: {}
        };
      }
      if (!grupoPagos[cid].por_dia[dia]) {
        grupoPagos[cid].por_dia[dia] = { base: 0, count: 0 };
      }
      grupoPagos[cid].por_dia[dia].base += r.pago_base;
      if (!Number(r.rectificado)) {
        grupoPagos[cid].por_dia[dia].count++;
      }
    });

    let totalPagoFinal = 0;
    Object.keys(grupoPagos).forEach(cid => {
      const g = grupoPagos[cid];
      let totalBase = 0;
      let totalExtra = 0;
      Object.keys(g.por_dia).forEach(dia => {
        const day = g.por_dia[dia];
        totalBase += day.base;
        if (day.count > 6) {
          totalExtra += (g.factura ? extraSi : extraNo);
        }
      });
      const actualPct = g.factura ? pct : 0;
      const pagoTotal = totalBase * (1 + actualPct / 100) + totalExtra;
      const rounded = Math.round(pagoTotal * 100) / 100;
      grupoPagos[cid].pagoFinal = rounded;
      totalPagoFinal += rounded;
    });

    const globalOk = filasExpandidas.reduce((sum, r) => sum + (Number(r.cumplen) || 0), 0);
    const globalNo = filasExpandidas.reduce((sum, r) => sum + (Number(r.no_cumplen) || 0), 0);
    const globalNa = filasExpandidas.reduce((sum, r) => sum + (Number(r.no_aplica) || 0), 0);
    const totalPagoBase = filasExpandidas.reduce((sum, r) => sum + (Number(r.pago_base) || 0), 0);

    const detallePagos = {};
    const porCamarera = {};
    Object.keys(grupoPagos).forEach(cid => {
      const g = grupoPagos[cid];
      const nombre = g.nombre;
      const totalBase = Object.values(g.por_dia).reduce((s, d) => s + d.base, 0);
      let totalExtra = 0;
      let extraDays = 0;
      Object.values(g.por_dia).forEach(d => {
        if (d.count > 6) {
          extraDays++;
          totalExtra += (g.factura ? extraSi : extraNo);
        }
      });
      detallePagos[nombre] = {
        factura: g.factura,
        dias_extra: extraDays,
        pct: g.factura ? pct : 0,
        extra: Math.round(totalExtra * 100) / 100,
        pagoFinal: g.pagoFinal,
        base: Math.round(totalBase * 100) / 100,
        count_registros: filasExpandidas.filter(r => String(r.camarera_id) === String(cid)).length
      };
      porCamarera[nombre] = g.pagoFinal;
    });

    res.json({
      ok: true,
      data: filasExpandidas,
      resumen: {
        total_registros: filasExpandidas.length,
        total_pago: Math.round(totalPagoFinal * 100) / 100,
        total_base: Math.round(totalPagoBase * 100) / 100,
        total_ok: globalOk,
        total_no: globalNo,
        total_na: globalNa,
        detalle_pagos: detallePagos,
        por_camarera: porCamarera
      }
    });
  } catch (e) {
    console.error("Error en reporte pagos:", e);
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

// GET /api/reportes/rendimiento
async function getReporteRendimiento(req, res) {
  try {
    const fecha_desde = String(req.query?.fecha_desde || "").trim();
    const fecha_hasta = String(req.query?.fecha_hasta || "").trim();
    const camarera_id = req.query?.camarera_id ? Number(req.query.camarera_id) : null;
    const ama_llaves_nombre = req.query?.ama_llaves_nombre ? String(req.query.ama_llaves_nombre).trim() : null;

    if (!fecha_desde || !fecha_hasta) {
      return res.status(400).json({ ok: false, error: "Faltan fecha_desde y fecha_hasta" });
    }

    const isSameDay = fecha_desde === fecha_hasta;
    let fechaWhere;
    let queryParams;
    if (isSameDay) {
      fechaWhere = "DATE(i.fecha) = ?";
      queryParams = [fecha_desde, camarera_id, camarera_id, ama_llaves_nombre, ama_llaves_nombre];
    } else {
      fechaWhere = "DATE(i.fecha) >= ? AND DATE(i.fecha) <= ?";
      queryParams = [fecha_desde, fecha_hasta, camarera_id, camarera_id, ama_llaves_nombre, ama_llaves_nombre];
    }

    const sql = `
      SELECT
        c.id AS camarera_id,
        c.nombre AS camarera_nombre,
        COUNT(DISTINCT i.id) AS total_inspecciones,
        COALESCE(ROUND(AVG(det.pct_cumple), 1), 0) AS promedio_pct,
        COALESCE(SUM(IF(i.rectificado = 1, 0, COALESCE(pe.precio, 0)) / NULLIF(cnt_cams.count_camareras, 0)), 0) AS total_pago,
        COALESCE(ROUND(AVG(TIMESTAMPDIFF(MINUTE, i.inicio_limpieza, i.fin_limpieza)), 0), 0) AS promedio_minutos,
        COALESCE(ROUND(AVG(TIMESTAMPDIFF(MINUTE, i.fin_limpieza, i.hora_checklist)), 0), 0) AS promedio_inspeccion_min,
        COUNT(DISTINCT CASE WHEN cnt_cams.count_camareras > 1 THEN i.id END) AS habitaciones_compartidas,
        COALESCE(ROUND(AVG(CASE WHEN i.hora_listo_limpieza IS NOT NULL AND i.inicio_limpieza IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, i.hora_listo_limpieza, i.inicio_limpieza) END), 0), 0) AS promedio_tiempo_asignacion
      FROM inspecciones i
      JOIN inspecciones_camareras ic ON ic.inspeccion_id = i.id
      JOIN camareras c ON c.id = ic.camarera_id
      LEFT JOIN habitaciones h ON h.modulo_id = i.modulo_id AND h.etiqueta = i.habitacion_etiqueta
      LEFT JOIN precios_especiales_habitacion pe ON pe.habitacion_id = h.id AND pe.tipo_limpieza_id = i.tipo_limpieza_id AND pe.es_familiar = COALESCE(i.es_familiar, 0)
      LEFT JOIN (
        SELECT inspeccion_id,
          SUM(estado = 'CUMPLE') * 100.0 / NULLIF(COUNT(*), 0) AS pct_cumple
        FROM inspeccion_detalles
        GROUP BY inspeccion_id
      ) det ON det.inspeccion_id = i.id
      LEFT JOIN (
        SELECT inspeccion_id, COUNT(*) AS count_camareras
        FROM inspecciones_camareras
        GROUP BY inspeccion_id
      ) cnt_cams ON cnt_cams.inspeccion_id = i.id
      WHERE ${fechaWhere}
        AND (? IS NULL OR ic.camarera_id = ?)
        AND (? IS NULL OR i.inspector_nombre = ?)
      GROUP BY c.id, c.nombre
      ORDER BY total_inspecciones DESC, c.nombre
    `;

    const [rows] = await pool.query(sql, queryParams);
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error("Error en reporte rendimiento:", e);
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

// GET /api/reportes/rendimiento/amas
async function getReporteRendimientoAmas(req, res) {
  try {
    const fecha_desde = String(req.query?.fecha_desde || "").trim();
    const fecha_hasta = String(req.query?.fecha_hasta || "").trim();
    const ama_nombre = req.query?.ama_nombre ? String(req.query.ama_nombre).trim() : null;

    if (!fecha_desde || !fecha_hasta) {
      return res.status(400).json({ ok: false, error: "Faltan fecha_desde y fecha_hasta" });
    }

    const isSameDay = fecha_desde === fecha_hasta;
    let fechaWhere;
    let queryParams;
    if (isSameDay) {
      fechaWhere = "DATE(i.fecha) = ?";
      queryParams = [fecha_desde, ama_nombre, ama_nombre];
    } else {
      fechaWhere = "DATE(i.fecha) >= ? AND DATE(i.fecha) <= ?";
      queryParams = [fecha_desde, fecha_hasta, ama_nombre, ama_nombre];
    }

    const sql = `
      SELECT
        i.inspector_nombre AS ama_nombre,
        COUNT(DISTINCT i.id) AS total_inspecciones,
        COALESCE(ROUND(AVG(det.pct_cumple), 1), 0) AS promedio_pct,
        COALESCE(ROUND(AVG(TIMESTAMPDIFF(MINUTE, i.inicio_limpieza, i.fin_limpieza)), 0), 0) AS promedio_minutos,
        COALESCE(ROUND(AVG(TIMESTAMPDIFF(MINUTE, i.fin_limpieza, i.hora_checklist)), 0), 0) AS promedio_inspeccion_min,
        COUNT(DISTINCT CASE WHEN cnt_cams.count_camareras > 1 THEN i.id END) AS habitaciones_compartidas,
        COALESCE(ROUND(AVG(CASE WHEN i.hora_listo_limpieza IS NOT NULL AND i.inicio_limpieza IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, i.hora_listo_limpieza, i.inicio_limpieza) END), 0), 0) AS promedio_tiempo_asignacion
      FROM inspecciones i
      LEFT JOIN habitaciones h ON h.modulo_id = i.modulo_id AND h.etiqueta = i.habitacion_etiqueta
      LEFT JOIN precios_especiales_habitacion pe ON pe.habitacion_id = h.id AND pe.tipo_limpieza_id = i.tipo_limpieza_id AND pe.es_familiar = COALESCE(i.es_familiar, 0)
      LEFT JOIN (
        SELECT inspeccion_id,
          SUM(estado = 'CUMPLE') * 100.0 / NULLIF(COUNT(*), 0) AS pct_cumple
        FROM inspeccion_detalles
        GROUP BY inspeccion_id
      ) det ON det.inspeccion_id = i.id
      LEFT JOIN (
        SELECT inspeccion_id, COUNT(*) AS count_camareras
        FROM inspecciones_camareras
        GROUP BY inspeccion_id
      ) cnt_cams ON cnt_cams.inspeccion_id = i.id
      WHERE ${fechaWhere}
        AND (? IS NULL OR i.inspector_nombre = ?)
        AND i.inspector_nombre IS NOT NULL AND i.inspector_nombre != ''
      GROUP BY i.inspector_nombre
      ORDER BY total_inspecciones DESC, i.inspector_nombre
    `;

    const [rows] = await pool.query(sql, queryParams);
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error("Error en reporte rendimiento amas:", e);
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

// GET /api/reportes/rendimiento/daily
async function getReporteRendimientoDaily(req, res) {
  try {
    const fecha_desde = String(req.query?.fecha_desde || "").trim();
    const fecha_hasta = String(req.query?.fecha_hasta || "").trim();
    const camarera_id = req.query?.camarera_id ? Number(req.query.camarera_id) : null;
    const ama_llaves_nombre = req.query?.ama_llaves_nombre ? String(req.query.ama_llaves_nombre).trim() : null;

    if (!fecha_desde || !fecha_hasta) {
      return res.status(400).json({ ok: false, error: "Faltan fecha_desde y fecha_hasta" });
    }

    const isSameDay = fecha_desde === fecha_hasta;
    let fechaWhere;
    let queryParams;
    if (isSameDay) {
      fechaWhere = "DATE(i.fecha) = ?";
      queryParams = [fecha_desde, camarera_id, camarera_id, ama_llaves_nombre, ama_llaves_nombre];
    } else {
      fechaWhere = "DATE(i.fecha) >= ? AND DATE(i.fecha) <= ?";
      queryParams = [fecha_desde, fecha_hasta, camarera_id, camarera_id, ama_llaves_nombre, ama_llaves_nombre];
    }

    const sql = `
      SELECT
        c.id AS camarera_id,
        c.nombre AS camarera_nombre,
        i.fecha,
        COUNT(DISTINCT i.id) AS habitaciones,
        COALESCE(ROUND(AVG(det.pct_cumple), 1), 0) AS puntuacion_prom,
        COALESCE(ROUND(AVG(TIMESTAMPDIFF(MINUTE, i.inicio_limpieza, i.fin_limpieza)), 0), 0) AS tiempo_prom_min,
        COALESCE(SUM(IF(i.rectificado = 1, 0, COALESCE(pe.precio, 0)) / NULLIF(cnt_cams.count_camareras, 0)), 0) AS pago_total,
        COUNT(DISTINCT CASE WHEN cnt_cams.count_camareras > 1 THEN i.id END) AS habitaciones_compartidas,
        COALESCE(ROUND(AVG(CASE WHEN i.hora_listo_limpieza IS NOT NULL AND i.inicio_limpieza IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, i.hora_listo_limpieza, i.inicio_limpieza) END), 0), 0) AS tiempo_asignacion_min,
        COALESCE(SUM(CASE WHEN i.hora_listo_limpieza IS NOT NULL AND i.inicio_limpieza IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, i.hora_listo_limpieza, i.inicio_limpieza) END), 0) AS tiempo_asignacion_sum
      FROM inspecciones i
      JOIN inspecciones_camareras ic ON ic.inspeccion_id = i.id
      JOIN camareras c ON c.id = ic.camarera_id
      LEFT JOIN habitaciones h ON h.modulo_id = i.modulo_id AND h.etiqueta = i.habitacion_etiqueta
      LEFT JOIN precios_especiales_habitacion pe ON pe.habitacion_id = h.id AND pe.tipo_limpieza_id = i.tipo_limpieza_id AND pe.es_familiar = COALESCE(i.es_familiar, 0)
      LEFT JOIN (
        SELECT inspeccion_id,
          SUM(estado = 'CUMPLE') * 100.0 / NULLIF(COUNT(*), 0) AS pct_cumple
        FROM inspeccion_detalles
        GROUP BY inspeccion_id
      ) det ON det.inspeccion_id = i.id
      LEFT JOIN (
        SELECT inspeccion_id, COUNT(*) AS count_camareras
        FROM inspecciones_camareras
        GROUP BY inspeccion_id
      ) cnt_cams ON cnt_cams.inspeccion_id = i.id
      WHERE ${fechaWhere}
        AND (? IS NULL OR ic.camarera_id = ?)
        AND (? IS NULL OR i.inspector_nombre = ?)
      GROUP BY c.id, c.nombre, i.fecha
      ORDER BY c.nombre, i.fecha ASC
    `;

    const [rows] = await pool.query(sql, queryParams);

    const grouped = {};
    rows.forEach(r => {
      const cid = r.camarera_id;
      if (!grouped[cid]) {
        grouped[cid] = {
          camarera_id: cid,
          camarera_nombre: r.camarera_nombre,
          dias: []
        };
      }
      grouped[cid].dias.push({
        fecha: r.fecha,
        habitaciones: Number(r.habitaciones),
        habitaciones_compartidas: Number(r.habitaciones_compartidas || 0),
        puntuacion_prom: Number(r.puntuacion_prom),
        tiempo_prom_min: Number(r.tiempo_prom_min),
        pago_total: Number(r.pago_total),
        tiempo_asignacion_min: Number(r.tiempo_asignacion_min || 0),
        tiempo_asignacion_sum: Number(r.tiempo_asignacion_sum || 0)
      });
    });

    res.json({
      ok: true,
      data: Object.values(grouped)
    });
  } catch (e) {
    console.error("Error en rendimiento daily:", e);
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

// GET /api/reportes/rendimiento/detalle-dias
async function getReporteDetalleDias(req, res) {
  try {
    const fecha_desde = String(req.query?.fecha_desde || "").trim();
    const fecha_hasta = String(req.query?.fecha_hasta || "").trim();
    const camarera_id = req.query?.camarera_id ? Number(req.query.camarera_id) : null;
    const ama_nombre = String(req.query?.ama_nombre || "").trim() || null;

    if (!fecha_desde || !fecha_hasta) {
      return res.status(400).json({ ok: false, error: "Faltan fecha_desde y fecha_hasta" });
    }

    const sql = `
      SELECT
        i.fecha,
        i.habitacion_etiqueta,
        i.modulo_id,
        i.inspector_nombre AS ama_nombre,
        c.id AS camarera_id,
        c.nombre AS camarera_nombre,
        i.hora_listo_limpieza,
        i.inicio_limpieza,
        i.fin_limpieza,
        i.hora_checklist,
        TIMESTAMPDIFF(MINUTE, i.hora_listo_limpieza, i.inicio_limpieza) AS tiempo_asignacion_min,
        TIMESTAMPDIFF(MINUTE, i.inicio_limpieza, i.fin_limpieza) AS tiempo_limpieza_min,
        TIMESTAMPDIFF(MINUTE, i.fin_limpieza, i.hora_checklist) AS tiempo_inspeccion_min
      FROM inspecciones i
      JOIN inspecciones_camareras ic ON ic.inspeccion_id = i.id
      JOIN camareras c ON c.id = ic.camarera_id
      WHERE DATE(i.fecha) >= ? AND DATE(i.fecha) <= ?
        AND (? IS NULL OR ic.camarera_id = ?)
        AND (? IS NULL OR i.inspector_nombre = ?)
      ORDER BY i.fecha, i.inspector_nombre, c.nombre, i.habitacion_etiqueta
    `;

    const queryParams = [fecha_desde, fecha_hasta, camarera_id, camarera_id, ama_nombre, ama_nombre];
    const [rows] = await pool.query(sql, queryParams);

    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error("Error en detalle-dias:", e);
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

// GET /api/reportes/historial
async function getReporteHistorial(req, res) {
  try {
    const modulo_id = String(req.query?.modulo_id || "").trim();
    const etiqueta = String(req.query?.etiqueta || "").trim();
    const fecha = String(req.query?.fecha || "").trim();

    if (!modulo_id || !etiqueta || !fecha) {
      return res.status(400).json({ ok: false, error: "Faltan modulo_id, etiqueta, fecha" });
    }

    const [logs] = await pool.query(`
      SELECT
        id, created_at AS timestamp, evento,
        estado_prev, estado_new,
        actor_name, actor_dept, source
      FROM estados_habitacion_log
      WHERE modulo_id = ? AND etiqueta = ?
        AND DATE(created_at) = ?
      ORDER BY created_at ASC
    `, [modulo_id, etiqueta, fecha]);

    const [inspecciones] = await pool.query(`
      SELECT
        i.id, i.fecha,
        i.inicio_limpieza, i.fin_limpieza, i.hora_checklist,
        c.nombre AS camarera_nombre,
        (SELECT GROUP_CONCAT(cam.nombre ORDER BY cam.id) FROM inspecciones_camareras ic2 JOIN camareras cam ON cam.id = ic2.camarera_id WHERE ic2.inspeccion_id = i.id) AS camareras_nombres,
        t.nombre AS tipo_nombre,
        i.inspector_nombre, i.inspector_dept, i.es_decorada, i.es_familiar,
        i.observaciones
      FROM inspecciones i
      LEFT JOIN camareras c ON c.id = i.camarera_id
      LEFT JOIN tipos_limpieza t ON t.id = i.tipo_limpieza_id
      WHERE i.modulo_id = ? AND i.habitacion_etiqueta = ?
        AND i.fecha = ?
      ORDER BY i.inicio_limpieza ASC
    `, [modulo_id, etiqueta, fecha]);

    const timeline = [];

    const formatTimeStr = (dateVal) => {
      if (!dateVal) return "--:--:--";
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return "--:--:--";
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      return `${hh}:${mm}:${ss}`;
    };

    logs.forEach(l => {
      timeline.push({
        hora: formatTimeStr(l.timestamp),
        timestamp: l.timestamp,
        tipo: "log",
        evento: l.evento,
        descripcion: l.evento === "room_update"
          ? `Cambio de estado: ${l.estado_prev || "?"} → ${l.estado_new || "?"}`
          : (String(l.evento).startsWith("estado_") ? "" : l.evento),
        actor: l.actor_name || "Sistema",
        dept: l.actor_dept || "",
        color: colorDeEstado(l.estado_new)
      });
    });

    inspecciones.forEach(insp => {
      if (insp.inicio_limpieza) {
        timeline.push({
          hora: formatTimeStr(insp.inicio_limpieza),
          timestamp: insp.inicio_limpieza,
          tipo: "inicio_limpieza",
          evento: "INICIO LIMPIEZA",
          descripcion: `Camarera: ${insp.camareras_nombres || insp.camarera_nombre || "-"} | Tipo: ${insp.tipo_nombre || "-"}`,
          actor: insp.inspector_nombre || "-",
          dept: insp.inspector_dept || "Ama de llaves",
          color: "#C8A57A"
        });
      }
      if (insp.fin_limpieza) {
        const finDesc = `Camarera: ${insp.camareras_nombres || insp.camarera_nombre || "-"}` + (insp.observaciones ? ` | Obs: ${insp.observaciones}` : "");
        timeline.push({
          hora: formatTimeStr(insp.fin_limpieza),
          timestamp: insp.fin_limpieza,
          tipo: "fin_limpieza",
          evento: "FIN LIMPIEZA",
          descripcion: finDesc,
          actor: insp.inspector_nombre || "-",
          dept: insp.inspector_dept || "Ama de llaves",
          color: "#38BDF8"
        });
      }
      if (insp.hora_checklist) {
        const familiar = Number(insp.es_familiar) ? " (Familiar)" : "";
        const decorada = Number(insp.es_decorada) ? " (Decorada)" : "";
        timeline.push({
          hora: formatTimeStr(insp.hora_checklist),
          timestamp: insp.hora_checklist,
          tipo: "checklist",
          evento: "INSPECCION COMPLETADA",
          descripcion: `Inspector: ${insp.inspector_nombre || "-"}${familiar}${decorada}`,
          actor: insp.inspector_nombre || "-",
          dept: insp.inspector_dept || "Ama de llaves",
          color: "#2EE59D"
        });
      }
    });

    const getWeight = (item) => {
      if (item.evento === "estado_lista") return 1;
      if (item.evento === "estado_limpieza") return 5;
      if (item.tipo === "inicio_limpieza") return 10;
      if (item.tipo === "fin_limpieza") return 20;
      if (item.evento === "estado_inspeccion") return 25;
      if (item.tipo === "checklist") return 30;
      if (item.evento === "estado_libre" || item.evento === "estado_ocupada limpia") return 35;
      return 50;
    };

    timeline.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime() || 0;
      const timeB = new Date(b.timestamp).getTime() || 0;
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return getWeight(a) - getWeight(b);
    });

    const [roomInfo] = await pool.query(`
      SELECT h.etiqueta, h.modulo_id, m.descripcion AS modulo_nombre
      FROM habitaciones h
      LEFT JOIN modulos m ON m.id = h.modulo_id
      WHERE h.modulo_id = ? AND h.etiqueta = ?
      LIMIT 1
    `, [modulo_id, etiqueta]);

    res.json({
      ok: true,
      data: {
        habitacion: roomInfo[0] || { etiqueta, modulo_id },
        fecha,
        timeline
      }
    });
  } catch (e) {
    console.error("Error en historial:", e);
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

module.exports = {
  getReportePagos,
  getReporteRendimiento,
  getReporteRendimientoAmas,
  getReporteRendimientoDaily,
  getReporteDetalleDias,
  getReporteHistorial
};

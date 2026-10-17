const pool = require("../config/db");

async function getCamareras(req, res) {
  try {
    const [rows] = await pool.query("SELECT id, nombre, factura FROM camareras WHERE activo=1 ORDER BY nombre");
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function createCamarera(req, res) {
  try {
    let nombre = String(req.body?.nombre || "").trim().replace(/\s+/g, " ");
    const factura = req.body?.factura ? 1 : 0;
    if (!nombre) return res.status(400).json({ ok: false, error: "Nombre requerido" });
    const [dup] = await pool.query("SELECT id FROM camareras WHERE LOWER(nombre)=LOWER(?) AND activo=1", [nombre]);
    if (dup.length) return res.status(409).json({ ok: false, error: `Ya existe una camarera con el nombre "${nombre}"` });
    const [r] = await pool.query("INSERT INTO camareras (nombre, factura) VALUES (?,?)", [nombre, factura]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: "Ya existe una camarera con ese nombre" });
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function updateCamarera(req, res) {
  try {
    const id = Number(req.body?.id);
    let nombre = String(req.body?.nombre || "").trim().replace(/\s+/g, " ");
    if (!id || !nombre) return res.status(400).json({ ok: false, error: "Datos incompletos" });
    const [dup] = await pool.query("SELECT id FROM camareras WHERE LOWER(nombre)=LOWER(?) AND activo=1 AND id!=?", [nombre, id]);
    if (dup.length) return res.status(409).json({ ok: false, error: `Ya existe otra camarera con el nombre "${nombre}"` });
    if (req.body?.factura !== undefined) {
      const factura = req.body.factura ? 1 : 0;
      await pool.query("UPDATE camareras SET nombre=?, factura=? WHERE id=?", [nombre, factura, id]);
    } else {
      await pool.query("UPDATE camareras SET nombre=? WHERE id=?", [nombre, id]);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function deleteCamarera(req, res) {
  try {
    const id = Number(req.body?.id);
    if (!id) return res.status(400).json({ ok: false, error: "ID requerido" });
    const [refs] = await pool.query("SELECT COUNT(*) AS cnt FROM inspecciones WHERE camarera_id=?", [id]);
    const count = Number(refs[0]?.cnt || 0);
    if (count > 0) {
      return res.status(409).json({
        ok: false,
        error: `No se puede eliminar: tiene ${count} inspeccion${count !== 1 ? 'es' : ''} asignada${count !== 1 ? 's' : ''}. Puedes desactivarla (se marcará como inactiva).`,
        code: "HAS_REFERENCES",
        refCount: count
      });
    }
    await pool.query("UPDATE camareras SET activo=0 WHERE id=?", [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function getConfigPagos(req, res) {
  try {
    const [rows] = await pool.query("SELECT id, porcentaje_factura, extra_factura_si, extra_factura_no FROM configuracion_pagos LIMIT 1");
    const config = rows[0] || { porcentaje_factura: 30.00, extra_factura_si: 46.00, extra_factura_no: 36.00 };
    res.json({ ok: true, data: config });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function updateConfigPagos(req, res) {
  try {
    const porcentaje_factura = Number(req.body?.porcentaje_factura);
    const extra_factura_si = Number(req.body?.extra_factura_si);
    const extra_factura_no = Number(req.body?.extra_factura_no);

    if (!Number.isFinite(porcentaje_factura) || porcentaje_factura < 0) {
      return res.status(400).json({ ok: false, error: "Porcentaje invalido" });
    }
    if (!Number.isFinite(extra_factura_si) || extra_factura_si < 0) {
      return res.status(400).json({ ok: false, error: "Extra factura si invalido" });
    }
    if (!Number.isFinite(extra_factura_no) || extra_factura_no < 0) {
      return res.status(400).json({ ok: false, error: "Extra factura no invalido" });
    }

    const [rows] = await pool.query("SELECT id FROM configuracion_pagos LIMIT 1");
    if (rows.length) {
      await pool.query(
        "UPDATE configuracion_pagos SET porcentaje_factura=?, extra_factura_si=?, extra_factura_no=? WHERE id=?",
        [porcentaje_factura, extra_factura_si, extra_factura_no, rows[0].id]
      );
    } else {
      await pool.query(
        "INSERT INTO configuracion_pagos (porcentaje_factura, extra_factura_si, extra_factura_no) VALUES (?,?,?)",
        [porcentaje_factura, extra_factura_si, extra_factura_no]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

module.exports = {
  getCamareras,
  createCamarera,
  updateCamarera,
  deleteCamarera,
  getConfigPagos,
  updateConfigPagos
};

const pool = require("../config/db");

// ===== CHECKLIST CATEGORIAS =====
async function getCategorias(req, res) {
  try {
    const [rows] = await pool.query("SELECT id, nombre, ayuda, orden FROM checklist_categorias WHERE activo=1 ORDER BY orden");
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function createCategoria(req, res) {
  try {
    const nombre = String(req.body?.nombre || "").trim();
    const ayuda = String(req.body?.ayuda || "").trim();
    if (!nombre) return res.status(400).json({ ok: false, error: "Nombre requerido" });
    const [r] = await pool.query("INSERT INTO checklist_categorias (nombre, ayuda) VALUES (?,?)", [nombre, ayuda]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function updateCategoria(req, res) {
  try {
    const id = Number(req.body?.id);
    const nombre = String(req.body?.nombre || "").trim();
    if (!id || !nombre) return res.status(400).json({ ok: false, error: "Datos incompletos" });
    await pool.query("UPDATE checklist_categorias SET nombre=? WHERE id=?", [nombre, id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function deleteCategoria(req, res) {
  try {
    const id = Number(req.body?.id);
    if (!id) return res.status(400).json({ ok: false, error: "ID requerido" });
    await pool.query("UPDATE checklist_categorias SET activo=0 WHERE id=?", [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

// ===== CHECKLIST ITEMS =====
async function getItems(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT ci.id, ci.categoria_id, ci.nombre, ci.orden, cc.nombre AS categoria_nombre
      FROM checklist_items ci
      JOIN checklist_categorias cc ON cc.id = ci.categoria_id
      WHERE ci.activo=1 AND cc.activo=1
      ORDER BY ci.orden
    `);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function createItem(req, res) {
  try {
    const categoria_id = Number(req.body?.categoria_id);
    const nombre = String(req.body?.nombre || "").trim();
    if (!categoria_id || !nombre) return res.status(400).json({ ok: false, error: "Datos incompletos" });
    const [r] = await pool.query("INSERT INTO checklist_items (categoria_id, nombre) VALUES (?,?)", [categoria_id, nombre]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function updateItem(req, res) {
  try {
    const id = Number(req.body?.id);
    const nombre = String(req.body?.nombre || "").trim();
    const categoria_id = req.body?.categoria_id ? Number(req.body.categoria_id) : null;
    if (!id || !nombre) return res.status(400).json({ ok: false, error: "Datos incompletos" });
    const sql = categoria_id ? "UPDATE checklist_items SET nombre=?, categoria_id=? WHERE id=?" : "UPDATE checklist_items SET nombre=? WHERE id=?";
    const params = categoria_id ? [nombre, categoria_id, id] : [nombre, id];
    await pool.query(sql, params);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function deleteItem(req, res) {
  try {
    const id = Number(req.body?.id);
    if (!id) return res.status(400).json({ ok: false, error: "ID requerido" });
    await pool.query("UPDATE checklist_items SET activo=0 WHERE id=?", [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

// ===== TIPOS DE LIMPIEZA =====
async function getTiposLimpieza(req, res) {
  try {
    const [rows] = await pool.query("SELECT id, nombre FROM tipos_limpieza WHERE activo=1 ORDER BY id");
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function createTipoLimpieza(req, res) {
  try {
    const nombre = String(req.body?.nombre || "").trim();
    if (!nombre) return res.status(400).json({ ok: false, error: "Nombre requerido" });
    const [r] = await pool.query("INSERT INTO tipos_limpieza (nombre) VALUES (?)", [nombre]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: "Ya existe ese tipo de limpieza" });
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function updateTipoLimpieza(req, res) {
  try {
    const id = Number(req.body?.id);
    const nombre = String(req.body?.nombre || "").trim();
    if (!id || !nombre) return res.status(400).json({ ok: false, error: "Datos incompletos" });
    await pool.query("UPDATE tipos_limpieza SET nombre=? WHERE id=?", [nombre, id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function deleteTipoLimpieza(req, res) {
  try {
    const id = Number(req.body?.id);
    if (!id) return res.status(400).json({ ok: false, error: "ID requerido" });
    await pool.query("UPDATE tipos_limpieza SET activo=0 WHERE id=?", [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

module.exports = {
  getCategorias,
  createCategoria,
  updateCategoria,
  deleteCategoria,
  getItems,
  createItem,
  updateItem,
  deleteItem,
  getTiposLimpieza,
  createTipoLimpieza,
  updateTipoLimpieza,
  deleteTipoLimpieza
};

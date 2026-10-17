const pool = require("../config/db");

async function getModules(req, res) {
  try {
    const [rows] = await pool.query("SELECT id, descripcion FROM modulos ORDER BY id");
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function createModulo(req, res) {
  try {
    let id = String(req.body?.id || "").trim().toUpperCase().replace(/\s+/g, "");
    const descripcion = String(req.body?.descripcion || "").trim().replace(/\s+/g, " ");
    if (!id || !descripcion) return res.status(400).json({ ok: false, error: "ID y descripcion requeridos" });

    const [dup] = await pool.query("SELECT id FROM modulos WHERE id=?", [id]);
    if (dup.length) return res.status(409).json({ ok: false, error: `El modulo "${id}" ya existe` });

    await pool.query("INSERT INTO modulos (id, descripcion) VALUES (?,?)", [id, descripcion]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: "El ID del modulo ya existe" });
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function updateModulo(req, res) {
  try {
    const id = String(req.body?.id || "").trim();
    const descripcion = String(req.body?.descripcion || "").trim();
    if (!id || !descripcion) return res.status(400).json({ ok: false, error: "Datos incompletos" });

    await pool.query("UPDATE modulos SET descripcion=? WHERE id=?", [descripcion, id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function deleteModulo(req, res) {
  try {
    const id = String(req.body?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "ID requerido" });

    const [refs] = await pool.query("SELECT COUNT(*) AS cnt FROM inspecciones WHERE modulo_id=?", [id]);
    const count = Number(refs[0]?.cnt || 0);
    if (count > 0) {
      return res.status(409).json({
        ok: false,
        error: `No se puede eliminar: hay ${count} inspeccion${count !== 1 ? 'es' : ''} asociada${count !== 1 ? 's' : ''} a este modulo.`,
        code: "HAS_REFERENCES",
        refCount: count
      });
    }

    await pool.query("DELETE FROM habitaciones WHERE modulo_id=?", [id]);
    await pool.query("DELETE FROM modulos WHERE id=?", [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

module.exports = {
  getModules,
  createModulo,
  updateModulo,
  deleteModulo
};

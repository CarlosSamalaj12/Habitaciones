const bcrypt = require("bcryptjs");
const pool = require("../config/db");

async function createUser(req, res) {
  try {
    const nombre = String(req.body?.nombre || "").trim();
    const departamento = String(req.body?.departamento || "").trim();
    const clave = String(req.body?.clave || "");

    if (!nombre || !departamento || !clave) {
      return res.status(400).json({ ok: false, error: "Faltan datos" });
    }
    if (clave.length < 4) {
      return res.status(400).json({ ok: false, error: "La clave es muy corta" });
    }

    const [exist] = await pool.query("SELECT id FROM usuarios WHERE nombre=? LIMIT 1", [nombre]);
    if (exist.length) {
      return res.status(409).json({ ok: false, error: "El usuario ya existe" });
    }

    const hash = await bcrypt.hash(clave, 10);
    const [r] = await pool.query(
      "INSERT INTO usuarios (nombre, departamento, clave) VALUES (?,?,?)",
      [nombre, departamento, hash]
    );

    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function getUsers(req, res) {
  try {
    const [rows] = await pool.query("SELECT id, nombre, departamento FROM usuarios ORDER BY nombre");
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function getAmasLlaves(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT inspector_nombre AS nombre
      FROM inspecciones
      WHERE inspector_nombre IS NOT NULL AND inspector_nombre != ''
      ORDER BY inspector_nombre
    `);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function updateUser(req, res) {
  try {
    const id = Number(req.body?.id);
    if (!id) return res.status(400).json({ ok: false, error: "ID requerido" });

    const nombre = req.body?.nombre !== undefined ? String(req.body.nombre).trim() : null;
    const departamento = req.body?.departamento !== undefined ? String(req.body.departamento).trim() : null;

    const sets = [];
    const params = [];
    if (nombre !== null && nombre !== '') { sets.push("nombre=?"); params.push(nombre); }
    if (departamento !== null && departamento !== '') { sets.push("departamento=?"); params.push(departamento); }

    if (!sets.length) return res.status(400).json({ ok: false, error: "Sin campos para actualizar" });

    params.push(id);
    await pool.query(`UPDATE usuarios SET ${sets.join(", ")} WHERE id=?`, params);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: "Ya existe un usuario con ese nombre" });
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

async function deleteUser(req, res) {
  try {
    const id = Number(req.body?.id);
    if (!id) return res.status(400).json({ ok: false, error: "ID requerido" });
    await pool.query("DELETE FROM usuarios WHERE id=?", [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

module.exports = {
  createUser,
  getUsers,
  getAmasLlaves,
  updateUser,
  deleteUser
};

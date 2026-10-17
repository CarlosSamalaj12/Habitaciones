const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const { signAccessToken } = require("../middlewares/auth.middleware");
const { JWT_EXPIRES } = require("../config/env");

async function whoami(req, res) {
  res.json({ ok: true, file: __filename });
}

async function login(req, res) {
  try {
    const nombre = String(req.body?.nombre || "").trim();
    const clave = String(req.body?.clave || "").trim();
    if (!nombre || !clave) return res.status(400).json({ ok: false, error: "Faltan credenciales" });

    const [rows] = await pool.query(
      "SELECT id, nombre, departamento, clave FROM usuarios WHERE nombre=? LIMIT 1",
      [nombre]
    );

    if (!rows.length) return res.status(401).json({ ok: false, error: "Credenciales inválidas" });

    const u = rows[0];
    const stored = String(u.clave || "");
    let ok = false;
    if (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$")) {
      ok = await bcrypt.compare(clave, stored);
    } else {
      ok = stored === clave;
    }

    if (!ok) return res.status(401).json({ ok: false, error: "Credenciales inválidas" });

    const token = signAccessToken(u);
    res.json({
      ok: true,
      token,
      expiresIn: JWT_EXPIRES,
      user: { id: u.id, name: u.nombre, dept: u.departamento }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
}

module.exports = {
  whoami,
  login
};

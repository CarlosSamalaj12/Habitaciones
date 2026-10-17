const jwt = require("jsonwebtoken");
const { JWT_SECRET, JWT_EXPIRES, REQUIRE_AUTH } = require("../config/env");

const ROLES = {
  ADMIN: "ADMIN",
  RECEPCION: "RECEPCION",
  AMA_LLAVES: "AMA_LLAVES",
  GERENCIA: "GERENCIA",
  REPORTES: "REPORTES"
};

function normalizeRole(rawDept) {
  const d = String(rawDept || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  if (d === "administrador" || d === "admin") return "ADMIN";
  if (d.includes("gerencia")) return "GERENCIA";
  if (d.includes("reportes")) return "REPORTES";
  if (d.includes("ama") || d.includes("camar") || d.includes("limp") || d.includes("housekeeping")) return "AMA_LLAVES";
  return "RECEPCION";
}

function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, name: user.nombre, dept: user.departamento },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function requireAuth(req, res, next) {
  const auth = String(req.headers?.authorization || "");
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "Token requerido" });
  }
  const token = auth.slice(7).trim();
  if (!token) {
    return res.status(401).json({ ok: false, error: "Token requerido" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Token invalido o vencido" });
  }
}

function requireAuthIfEnabled(req, res, next) {
  if (!REQUIRE_AUTH) return next();
  return requireAuth(req, res, next);
}

module.exports = {
  ROLES,
  normalizeRole,
  signAccessToken,
  requireAuth,
  requireAuthIfEnabled
};

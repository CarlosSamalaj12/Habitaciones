// server.js (Backend único: MariaDB + Socket.io + APIs)
require("dotenv").config();
console.log("🔥 SERVER NUEVO CARGADO:", __filename);

const express = require("express");
const http = require("http");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const app = express();
app.get("/api/whoami", (req, res) => res.json({ ok: true, file: __filename }));

app.use(express.json({ limit: "2mb" }));

const server = http.createServer(app);

// ===== ENV =====
const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

// MariaDB
const DB_HOST = process.env.DB_HOST || "192.168.10.2";
const DB_USER = process.env.DB_USER || "hk_user";
const DB_PASS = process.env.DB_PASS || "";
const DB_NAME = process.env.DB_NAME || "bdinscamareria";
const DB_PORT = Number(process.env.DB_PORT || 3306);

// Monday
const MONDAY_TOKEN = process.env.MONDAY_TOKEN || "";
const MONDAY_BOARD_ID = Number(process.env.MONDAY_BOARD_ID || 0);
const MONDAY_API = "https://api.monday.com/v2";
const JWT_SECRET = String(process.env.JWT_SECRET || "").trim();
const JWT_EXPIRES = process.env.JWT_EXPIRES || "8h";
const REQUIRE_AUTH = String(process.env.REQUIRE_AUTH || "1").trim() === "1";
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

if (!JWT_SECRET) {
  console.error("JWT_SECRET no configurado.");
  process.exit(1);
}

if (!ALLOWED_ORIGINS.length) {
  console.error("ALLOWED_ORIGINS no configurado.");
  process.exit(1);
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

const corsOptions = {
  origin(origin, cb) {
    if (isAllowedOrigin(origin)) return cb(null, true);
    return cb(new Error("Origen no permitido"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
const io = new Server(server, { cors: corsOptions });

function signAccessToken(user){
  return jwt.sign(
    { id: user.id, name: user.nombre, dept: user.departamento },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function requireAuth(req, res, next){
  const auth = String(req.headers?.authorization || "");
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ ok:false, error:"Token requerido" });
  }
  const token = auth.slice(7).trim();
  if (!token) {
    return res.status(401).json({ ok:false, error:"Token requerido" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (e) {
    return res.status(401).json({ ok:false, error:"Token invalido o vencido" });
  }
}

function requireAuthIfEnabled(req, res, next){
  if (!REQUIRE_AUTH) return next();
  return requireAuth(req, res, next);
}
function normalizeRole(rawDept){
  const d = String(rawDept || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  if (d === "administrador" || d === "admin") return "ADMIN";
  if (d.includes("gerencia")) return "GERENCIA";
  if (d.includes("camar")) return "CAMARERIA";
  return "RECEPCION";
}

// ===== DB POOL =====
let pool;

async function initDB(){
  pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    port: DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,

    // ✅ CLAVE: evita que mysql2 convierta fechas por timezone
    dateStrings: true,

    // ✅ Guatemala (UTC-6). Aunque usemos dateStrings, esto ayuda si en algún punto pasan Date()
    timezone: "-06:00",
  });

  // ✅ Forzar timezone de la sesión MySQL (clave si columnas son TIMESTAMP)
  pool.on("connection", (conn) => {
    conn.query("SET time_zone = '-06:00'");
  });

  await pool.query("SELECT 1");
  console.log("✅ MariaDB conectada");
}

/**
 * ✅ Convierte cualquier fecha a DATETIME Guatemala (UTC-6) sin depender de ICU/timezone del SO
 * - Si ya viene "YYYY-MM-DD HH:MM:SS" => se guarda tal cual (GT)
 * - Si viene ISO/Date => se convierte restando 6 horas al UTC
 */
function toMySQLDatetime(value){
  if (!value) return null;

  if (typeof value === "string") {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s;
  }

  const d = (value instanceof Date) ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  // Guatemala = UTC-6 (sin DST)
  const gtMs = d.getTime() - (6 * 60 * 60 * 1000);
  const gt = new Date(gtMs);

  const pad = (n) => String(n).padStart(2, "0");
  const YYYY = gt.getUTCFullYear();
  const MM   = pad(gt.getUTCMonth() + 1);
  const DD   = pad(gt.getUTCDate());
  const hh   = pad(gt.getUTCHours());
  const mm   = pad(gt.getUTCMinutes());
  const ss   = pad(gt.getUTCSeconds());

  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}


// ===== HEALTH =====
app.get("/", (req,res)=> res.send("OK. Backend Habitaciones. Usa /health o /api/modules"));
app.get("/health", (req,res)=> res.json({ ok:true, service:"hk-sync", port:PORT }));
app.get("/api/health", (req,res)=> res.json({ ok:true, service:"hk-sync", port:PORT }));
app.get("/api/time", (req,res)=> {
  res.json({ ok: true, serverMs: Date.now(), serverIso: new Date().toISOString() });
});

// ===== USERS / LOGIN =====

app.post("/api/users/create", requireAuthIfEnabled, async (req,res)=>{
  try{
    const nombre = String(req.body?.nombre || "").trim();
    const departamento = String(req.body?.departamento || "").trim();
    const clave = String(req.body?.clave || "");

    if(!nombre || !departamento || !clave){
      return res.status(400).json({ ok:false, error:"Faltan datos" });
    }
    if (clave.length < 4) {
      return res.status(400).json({ ok:false, error:"La clave es muy corta" });
    }

    const [exist] = await pool.query("SELECT id FROM usuarios WHERE nombre=? LIMIT 1", [nombre]);
    if (exist.length) {
      return res.status(409).json({ ok:false, error:"El usuario ya existe" });
    }

    const hash = await bcrypt.hash(clave, 10);
    const [r] = await pool.query(
      "INSERT INTO usuarios (nombre, departamento, clave) VALUES (?,?,?)",
      [nombre, departamento, hash]
    );

    res.json({ ok:true, id: r.insertId });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.get("/api/users", requireAuthIfEnabled, async (req,res)=>{
  try{
    const [rows] = await pool.query("SELECT id, nombre, departamento FROM usuarios ORDER BY nombre");
    res.json({ ok:true, data: rows });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/login", async (req,res)=>{
  try{
    const nombre = String(req.body?.nombre || "").trim();
    const clave = String(req.body?.clave || "").trim();
    if(!nombre || !clave) return res.status(400).json({ ok:false, error:"Faltan credenciales" });

    const [rows] = await pool.query(
      "SELECT id, nombre, departamento, clave FROM usuarios WHERE nombre=? LIMIT 1",
      [nombre]
    );

    if(!rows.length) return res.status(401).json({ ok:false, error:"Credenciales inv??lidas" });

    const u = rows[0];
    const stored = String(u.clave || "");
    let ok = false;
    if (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$")) {
      ok = await bcrypt.compare(clave, stored);
    } else {
      ok = stored === clave;
    }

    if(!ok) return res.status(401).json({ ok:false, error:"Credenciales inv??lidas" });

    const token = signAccessToken(u);
    res.json({
      ok:true,
      token,
      expiresIn: JWT_EXPIRES,
      user: { id:u.id, name:u.nombre, dept:u.departamento }
    });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// ===== MODULES =====
app.get("/api/modules", requireAuthIfEnabled, async (req,res)=>{
  try{
    const [rows] = await pool.query("SELECT id, descripcion FROM modulos ORDER BY id");
    res.json({ ok:true, data: rows });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// ===== MONDAY =====
app.post("/api/enviar-inspeccion", requireAuthIfEnabled, async (req,res) => {
  try{
    if (!MONDAY_TOKEN) {
      return res.status(500).json({ ok:false, error:"MONDAY_TOKEN no configurado" });
    }

    const boardId = Number(req.body?.boardId || MONDAY_BOARD_ID || 0);
    const parentItemId = String(req.body?.parentItemId || "").trim();
    const itemName = String(req.body?.itemName || "").trim();
    const columnValues = req.body?.columnValues || {};

    if ((!boardId && !parentItemId) || !itemName) {
      return res.status(400).json({ ok:false, error:"Faltan datos (boardId o parentItemId, itemName)" });
    }

    const query = parentItemId
      ? `
        mutation ($parentItemId: ID!, $itemName: String!, $columnValues: JSON!) {
          create_subitem (parent_item_id: $parentItemId, item_name: $itemName, column_values: $columnValues) {
            id
          }
        }
      `
      : `
        mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
          create_item (board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
            id
          }
        }
      `;

    const normalizeHours = (vals) => {
      const out = { ...(vals || {}) };
      for (const [k, v] of Object.entries(out)) {
        if (v && typeof v === "object" && "hour" in v) {
          // Monday "hour" column expects { hour: <int>, minute: <int> }
          if (typeof v.hour === "string" && v.hour.includes(":")) {
            const [h, m] = v.hour.split(":").map((x) => Number(x));
            out[k] = { hour: Number.isFinite(h) ? h : 0, minute: Number.isFinite(m) ? m : 0 };
          } else {
            const h = Number(v.hour);
            const m = Number(v.minute);
            out[k] = { hour: Number.isFinite(h) ? h : 0, minute: Number.isFinite(m) ? m : 0 };
          }
        }
      }
      return out;
    };

    const normalizedColumns = normalizeHours(columnValues);

    const variables = parentItemId
      ? {
          parentItemId,
          itemName,
          columnValues: JSON.stringify(normalizedColumns || {})
        }
      : {
          boardId: String(boardId),
          itemName,
          columnValues: JSON.stringify(normalizedColumns || {})
        };

    const r = await fetch(MONDAY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": MONDAY_TOKEN
      },
      body: JSON.stringify({ query, variables })
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok || data?.errors) {
      console.error("Monday error (raw):", JSON.stringify(data, null, 2));
      console.error("Monday payload columnValues:", JSON.stringify(normalizedColumns, null, 2));
      return res.status(500).json({ ok:false, error:"Monday error", detail: data?.errors || data });
    }

    const itemId = data?.data?.create_item?.id;
    res.json({ ok:true, itemId });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// Consultar columnas del tablero Monday
app.get("/api/monday/columns", requireAuthIfEnabled, async (req,res) => {
  try{
    if (!MONDAY_TOKEN) {
      return res.status(500).json({ ok:false, error:"MONDAY_TOKEN no configurado" });
    }
    const boardId = Number(req.query?.boardId || MONDAY_BOARD_ID || 0);
    if (!boardId) return res.status(400).json({ ok:false, error:"Falta boardId" });

    const query = `
      query ($boardId: ID!) {
        boards (ids: [$boardId]) {
          id
          name
          columns { id title type }
        }
      }
    `;

    const r = await fetch(MONDAY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": MONDAY_TOKEN
      },
      body: JSON.stringify({ query, variables: { boardId: String(boardId) } })
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok || data?.errors) {
      return res.status(500).json({ ok:false, error:"Monday error", detail: data?.errors || data });
    }

    res.json({ ok:true, data });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// Labels de un dropdown (por columna)

// ===== ROOMS =====
app.get("/api/rooms", requireAuthIfEnabled, async (req,res)=>{
  try{
    const modulo_id = String(req.query?.modulo_id || "").trim();
    if(!modulo_id) return res.status(400).json({ ok:false, error:"Falta modulo_id" });

    const [rows] = await pool.query(`
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
        e.actualizado
      FROM habitaciones h
      LEFT JOIN estados_habitacion e ON e.habitacion_id = h.id
      WHERE h.modulo_id = ?
      ORDER BY h.etiqueta
    `,[modulo_id]);

    res.json({ ok:true, data: rows });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// ===== UPDATE =====
async function getRoomId(modulo_id, etiqueta){
  const [rows] = await pool.query(
    "SELECT id FROM habitaciones WHERE modulo_id=? AND etiqueta=? LIMIT 1",
    [modulo_id, etiqueta]
  );
  return rows[0]?.id || null;
}

async function fetchOneRoom(habitacion_id){
  const [rows] = await pool.query(`
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
      e.actualizado
    FROM habitaciones h
    LEFT JOIN estados_habitacion e ON e.habitacion_id = h.id
    WHERE h.id = ?
    LIMIT 1
  `,[habitacion_id]);

  return rows[0] || null;
}

async function logRoomEvent({ before, after, patch, actor, source }) {
  try {
    if (!before && !after) return;
    const ref = after || before || {};
    const patchJson = JSON.stringify(patch || {});
    const actorId = actor?.id ?? null;
    const actorName = actor?.name ?? null;
    const actorDept = actor?.dept ?? null;
    const src = source ?? null;

    let evento = "room_update";
    if (patch?.estado) evento = `estado_${String(patch.estado).trim().toLowerCase()}`;

    await pool.query(`
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

function normalizePatch(patch){
  const p = patch || {};
  const out = {};

  const hasEstado = ("estado" in p);
  if (hasEstado) out.estado = p.estado ?? null;
  else out.estado = "libre";

  if ("adultos" in p) out.adultos = Number.isFinite(Number(p.adultos)) ? Number(p.adultos) : 0;
  else if (p.estado === "libre") out.adultos = 0;
  else out.adultos = null;

  if ("ninos" in p) out.ninos = Number.isFinite(Number(p.ninos)) ? Number(p.ninos) : 0;
  else out.ninos = null;

  if ("observaciones" in p) out.observaciones = (p.observaciones == null) ? "" : String(p.observaciones);
  else if (p.estado === "libre") out.observaciones = "";
  else out.observaciones = null;

  if ("camarera_asignada" in p) out.camarera_asignada = p.camarera_asignada ?? null;
  if ("tipo_limpieza" in p) out.tipo_limpieza = p.tipo_limpieza ?? null;
  if ("decorada" in p) {
    const v = p.decorada;
    out.decorada = (v === true || v === 1 || String(v).trim().toLowerCase() === "si" || String(v).trim() === "1") ? 1 : 0;
  }
  if ("inspector_asignado" in p) out.inspector_asignado = p.inspector_asignado ?? null;
  if ("prioridad_limpieza" in p) out.prioridad_limpieza = p.prioridad_limpieza ?? null;

  if ("desde" in p) out.desde = toMySQLDatetime(p.desde);
  if ("inicio_limpieza" in p) out.inicio_limpieza = toMySQLDatetime(p.inicio_limpieza);
  if ("fin_limpieza" in p) out.fin_limpieza = toMySQLDatetime(p.fin_limpieza);
  if ("inicio_repaso" in p) out.inicio_repaso = toMySQLDatetime(p.inicio_repaso);
  if ("repaso" in p) out.repaso = p.repaso ?? null;

  // ✅ No borrar "desde" cuando se inicia limpieza
  if (p.estado === "limpieza" && ("desde" in p) && (p.desde == null || p.desde === "")) {
    delete out.desde;
  }

  out._skipEstadoUpdate = !hasEstado;
  return out;
}

async function upsertEstadoByRoomId(habitacion_id, patch){
  const p = normalizePatch(patch);

  await pool.query(`
    INSERT INTO estados_habitacion
      (habitacion_id, estado, adultos, ninos, observaciones, desde, inicio_limpieza, fin_limpieza, inicio_repaso, repaso, camarera_asignada, tipo_limpieza, decorada, inspector_asignado, prioridad_limpieza)
    VALUES
      (?, ?, COALESCE(?,0), COALESCE(?,0), ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?,0), ?, ?)
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
      camarera_asignada = VALUES(camarera_asignada),
      tipo_limpieza = VALUES(tipo_limpieza),
      decorada = CASE WHEN ? IS NULL THEN decorada ELSE VALUES(decorada) END,
      inspector_asignado = VALUES(inspector_asignado),
      prioridad_limpieza = VALUES(prioridad_limpieza),
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
    p._skipEstadoUpdate ? 1 : 0,
    p.decorada
  ]);
}

app.post("/api/room/update", requireAuthIfEnabled, async (req,res)=>{
  try{
    const modulo_id = String(req.body?.modulo_id || "").trim();
    const etiqueta  = String(req.body?.etiqueta || "").trim();
    const patch     = req.body?.patch || null;
    const actor     = req.body?.actor || null;
    const source    = req.body?.source || null;

    if(!modulo_id || !etiqueta || !patch){
      return res.status(400).json({ ok:false, error:"Faltan datos (modulo_id, etiqueta, patch)" });
    }

    // ✅ Validar ocupación: debe haber al menos 1 adulto
    if (patch?.estado === "ocupado") {
      const adults = Number(patch?.adultos);
      if (!Number.isFinite(adults) || adults < 1) {
        return res.status(400).json({ ok:false, error:"Debe haber al menos 1 adulto para ocupar" });
      }
    }

    const roomId = await getRoomId(modulo_id, etiqueta);
    const cur = await fetchOneRoom(roomId);
    if(!roomId) return res.status(404).json({ ok:false, error:"Habitación no existe" });

    if (patch?.estado === "mantenimiento") {
      if (cur?.estado === "ocupado" || cur?.estado === "ocupada limpia") {
        return res.status(400).json({ ok:false, error:"No se puede poner mantenimiento si está OCUPADO" });
      }
    }

    if (patch?.estado === "libre") {
      const curEstado = String(cur?.estado || "").trim().toLowerCase();
      const role = normalizeRole(req.user?.dept || actor?.dept || "");
      const fromInspeccion = String(source || "").trim().toLowerCase() === "inspeccion";

      if (curEstado === "limpieza" && role !== "ADMIN" && !(role === "CAMARERIA" && fromInspeccion)) {
        return res.status(403).json({ ok:false, error:"Solo Administrador puede liberar si est? en LIMPIEZA." });
      }

      if (role === "CAMARERIA") {
        if (curEstado !== "mantenimiento" && !(curEstado === "limpieza" && fromInspeccion)) {
          return res.status(403).json({ ok:false, error:"Camarer?a solo puede liberar habitaciones en MANTENIMIENTO." });
        }
      } else if (role === "RECEPCION") {
        const allowed = new Set(["ocupado", "ocupada limpia", "mantenimiento", "lista"]);
        if (!allowed.has(curEstado)) {
          return res.status(403).json({ ok:false, error:"Recepci?n solo puede liberar si est? OCUPADA, en MANTENIMIENTO o LISTA." });
        }
      } else if (role === "ADMIN") {
        const allowed = new Set(["ocupado", "ocupada limpia", "mantenimiento", "lista", "limpieza"]);
        if (!allowed.has(curEstado)) {
          return res.status(403).json({ ok:false, error:"Administrador solo puede liberar estados permitidos." });
        }
      } else {
        return res.status(403).json({ ok:false, error:"No tienes permiso para liberar habitaciones." });
      }
    }

    const normalized = normalizePatch(patch);
    await upsertEstadoByRoomId(roomId, normalized);
    const updated = await fetchOneRoom(roomId);
    await logRoomEvent({ before: cur, after: updated, patch, actor, source });

    io.emit("room:update", updated);
    res.json({ ok:true, data: updated });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

io.on("connection", (s)=> {
  console.log("🔌 socket conectado", s.id);
});

// ===== START =====
initDB().then(()=>{
  server.listen(PORT, HOST, ()=>{
    console.log("-----------------------------------------");
    console.log("🚀 Backend Habitaciones listo");
    console.log(`📍 Local: http://localhost:${PORT}`);
    console.log(`🌐 LAN:   http://192.168.10.2:${PORT}`);
    console.log("-----------------------------------------");
  });
}).catch(e=>{
  console.error("❌ No conectó DB:", e.message);
  process.exit(1);
});

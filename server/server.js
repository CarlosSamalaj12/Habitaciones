// server.js (Backend único: MariaDB + Socket.io + APIs)
require("dotenv").config();
console.log("🔥 SERVER NUEVO CARGADO:", __filename);

const os = require("os");
const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const webpush = require("web-push");

// ===== VAPID Keys (Push Notifications) =====
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BBNU_k9XBvfFRjyb-J6o4pWRtkBjT4jIeecqU9XoNPk5-fzEhlK_wC-d0AlUr8gBoTZ2wQQ4O57mjZ8idcB5yFI";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "n5Zb8cj0nuMVkfaHs8jqC0n1i8R7uaBgn0q-K_V7g4U";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@habitaciones.local";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

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

// Servir archivos estaticos del frontend (index.html, app.js, styles.css, etc.)
app.use(express.static(path.join(__dirname, ".."), {
  maxAge: '7d',
  immutable: true,
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

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
  if (d.includes("reportes")) return "REPORTES";
  if (d.includes("ama") || d.includes("camar")) return "AMA_LLAVES";
  return "RECEPCION";
}

// ===== DB POOL =====
let pool;

async function initDB(){
  console.log("initDB: starting...");
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

  // Migración: agregar columna es_familiar si no existe
  try {
    await pool.query("ALTER TABLE inspecciones ADD COLUMN es_familiar TINYINT(1) DEFAULT 0 AFTER es_decorada");
    console.log("✅ Columna es_familiar agregada a inspecciones");
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn("⚠️ No se pudo agregar es_familiar:", e.message);
    }
  }

  // Migración: agregar columna factura a camareras
  try {
    await pool.query("ALTER TABLE camareras ADD COLUMN factura TINYINT(1) DEFAULT 0 AFTER nombre");
    console.log("✅ Columna factura agregada a camareras");
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn("⚠️ No se pudo agregar factura a camareras:", e.message);
    }
  }

  // Migración: crear tabla configuracion_pagos si no existe
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS configuracion_pagos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        porcentaje_factura DECIMAL(5,2) NOT NULL DEFAULT 33.00,
        extra_factura_si DECIMAL(10,2) NOT NULL DEFAULT 46.00,
        extra_factura_no DECIMAL(10,2) NOT NULL DEFAULT 36.00,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("✅ Tabla configuracion_pagos creada/verificada");
  } catch (e) {
    console.warn("⚠️ No se pudo crear configuracion_pagos:", e.message);
  }

  // Insertar fila por defecto si la tabla esta vacia
  try {
    const [cnt] = await pool.query("SELECT COUNT(*) AS c FROM configuracion_pagos");
    if (cnt[0].c === 0) {
      await pool.query("INSERT INTO configuracion_pagos (porcentaje_factura, extra_factura_si, extra_factura_no) VALUES (33.00, 46.00, 36.00)");
      console.log("✅ Valores por defecto insertados en configuracion_pagos");
    }
  } catch (e) {
    console.warn("⚠️ No se pudo insertar config por defecto:", e.message);
  }

  // Migración: agregar 'inspeccion' al ENUM de estados_habitacion.estado si no existe
  try {
    // Primero intentamos convertir a VARCHAR para evitar problemas futuros con ENUM
    await pool.query("ALTER TABLE estados_habitacion MODIFY COLUMN estado VARCHAR(40) DEFAULT 'libre'");
    console.log("✅ Columna estado migrada a VARCHAR(40) en estados_habitacion");
  } catch (e) {
    console.warn("⚠️ No se pudo migrar columna estado:", e.message);
  }

  // Migración: agregar columna precio_especial a habitaciones
  try {
    await pool.query("ALTER TABLE habitaciones ADD COLUMN precio_especial DECIMAL(10,2) DEFAULT NULL AFTER etiqueta");
    console.log("✅ Columna precio_especial agregada a habitaciones");
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn("⚠️ No se pudo agregar precio_especial a habitaciones:", e.message);
    }
  }

  // Migración: crear tabla precios_especiales_habitacion (precio especial por habitacion + tipo_limpieza)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS precios_especiales_habitacion (
        id INT AUTO_INCREMENT PRIMARY KEY,
        habitacion_id INT NOT NULL,
        tipo_limpieza_id INT NOT NULL,
        precio DECIMAL(10,2) DEFAULT NULL,
        UNIQUE KEY uq_hab_tipo (habitacion_id, tipo_limpieza_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("✅ Tabla precios_especiales_habitacion creada/verificada");
  } catch (e) {
    console.warn("⚠️ No se pudo crear precios_especiales_habitacion:", e.message);
  }

  // Migración: agregar columna es_familiar a habitaciones
  try {
    await pool.query("ALTER TABLE habitaciones ADD COLUMN es_familiar TINYINT(1) DEFAULT 0 AFTER etiqueta");
    console.log("✅ Columna es_familiar agregada a habitaciones");
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn("⚠️ No se pudo agregar es_familiar a habitaciones:", e.message);
    }
  }

  // Migración: agregar UNIQUE KEY (modulo_id, etiqueta) a habitaciones si no existe
  try {
    await pool.query("ALTER TABLE habitaciones ADD UNIQUE KEY uq_mod_etiq (modulo_id, etiqueta)");
    console.log("✅ UNIQUE KEY (modulo_id, etiqueta) agregada a habitaciones");
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') {
      console.warn("⚠️ No se pudo agregar UNIQUE KEY a habitaciones:", e.message);
    }
  }

  // Migración: agregar columna es_familiar a precios_especiales_habitacion y actualizar UNIQUE KEY
  try {
    // Primero intentamos agregar la columna
    await pool.query("ALTER TABLE precios_especiales_habitacion ADD COLUMN es_familiar TINYINT(1) DEFAULT 0 AFTER tipo_limpieza_id");
    console.log("✅ Columna es_familiar agregada a precios_especiales_habitacion");
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn("⚠️ No se pudo agregar es_familiar a precios_especiales_habitacion:", e.message);
    }
  }
  // Actualizar UNIQUE KEY para incluir es_familiar
  try {
    await pool.query("ALTER TABLE precios_especiales_habitacion DROP INDEX uq_hab_tipo");
  } catch (e) { /* puede que no exista */ }
  try {
    await pool.query("ALTER TABLE precios_especiales_habitacion ADD UNIQUE KEY uq_hab_tipo_fam (habitacion_id, tipo_limpieza_id, es_familiar)");
    console.log("✅ UNIQUE KEY actualizada en precios_especiales_habitacion");
  } catch (e) {
    if (e.code !== 'ER_DUP_KEYNAME') {
      console.warn("⚠️ No se pudo actualizar UNIQUE KEY:", e.message);
    }
  }

  // Migración: eliminar tabla precios_limpieza (ya no se usa, reemplazada por precios_especiales_habitacion)
  try {
    await pool.query("DROP TABLE IF EXISTS precios_limpieza");
    console.log("✅ Tabla precios_limpieza eliminada");
  } catch (e) {
    console.warn("⚠️ No se pudo eliminar precios_limpieza:", e.message);
  }

  // Migración: crear tabla push_subscriptions
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_nombre VARCHAR(255) NOT NULL,
        usuario_dept VARCHAR(100) DEFAULT NULL,
        endpoint TEXT NOT NULL,
        auth VARCHAR(255) NOT NULL,
        p256dh VARCHAR(255) NOT NULL,
        user_agent VARCHAR(500) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_endpoint (endpoint(255))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("✅ Tabla push_subscriptions creada/verificada");
  } catch (e) {
    console.warn("⚠️ No se pudo crear push_subscriptions:", e.message);
  }

  // Migration: agregar columna usuario_dept si no existe (para tablas ya creadas)
  try {
    await pool.query("ALTER TABLE push_subscriptions ADD COLUMN usuario_dept VARCHAR(100) DEFAULT NULL AFTER usuario_nombre");
    console.log("✅ Columna usuario_dept agregada a push_subscriptions");
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn("⚠️ No se pudo agregar usuario_dept:", e.message);
    }
  }

  // Migration: crear tabla inspecciones_camareras si no existe (soporte multiple camareras)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inspecciones_camareras (
        id INT AUTO_INCREMENT PRIMARY KEY,
        inspeccion_id INT NOT NULL,
        camarera_id INT NOT NULL,
        FOREIGN KEY (inspeccion_id) REFERENCES inspecciones(id) ON DELETE CASCADE,
        FOREIGN KEY (camarera_id) REFERENCES camareras(id) ON DELETE CASCADE,
        UNIQUE KEY uq_inspeccion_camarera (inspeccion_id, camarera_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("✅ Tabla inspecciones_camareras creada/verificada");

    // Migration: copiar datos existentes de inspecciones.camarera_id a inspecciones_camareras
    try {
      const [count] = await pool.query("SELECT COUNT(*) AS c FROM inspecciones_camareras");
      if (count[0].c === 0) {
        await pool.query(`
          INSERT IGNORE INTO inspecciones_camareras (inspeccion_id, camarera_id)
          SELECT id, camarera_id FROM inspecciones WHERE camarera_id IS NOT NULL
        `);
        console.log("✅ Datos de camareras migrados a inspecciones_camareras");
      }
    } catch (e) {
      console.warn("⚠️ No se pudieron migrar datos de camareras:", e.message);
    }
  } catch (e) {
    console.warn("⚠️ No se pudo crear inspecciones_camareras:", e.message);
  }

  // Migration: agregar columna hora_listo_limpieza a estados_habitacion (para medir tiempo de respuesta del ama de llaves)
  try {
    await pool.query("ALTER TABLE estados_habitacion ADD COLUMN hora_listo_limpieza DATETIME DEFAULT NULL AFTER inicio_limpieza");
    console.log("✅ Columna hora_listo_limpieza agregada a estados_habitacion");
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn("⚠️ No se pudo agregar hora_listo_limpieza:", e.message);
    }
  }

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


// ===== PUSH SUBSCRIPTIONS =====

// GET /api/push/vapid-key - Devuelve la clave publica para que el frontend se suscriba
app.get("/api/push/vapid-key", (req, res) => {
  res.json({ ok: true, publicKey: VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe - Guardar suscripcion
app.post("/api/push/subscribe", requireAuthIfEnabled, async (req, res) => {
  try {
    const { usuario_nombre, usuario_dept, subscription } = req.body;
    if (!usuario_nombre || !subscription?.endpoint || !subscription?.keys?.auth || !subscription?.keys?.p256dh) {
      return res.status(400).json({ ok: false, error: "Faltan datos de suscripcion" });
    }

    // Eliminar suscripcion anterior por si cambio
    await pool.query("DELETE FROM push_subscriptions WHERE endpoint=?", [subscription.endpoint]);

    await pool.query(
      "INSERT INTO push_subscriptions (usuario_nombre, usuario_dept, endpoint, auth, p256dh, user_agent) VALUES (?,?,?,?,?,?)",
      [usuario_nombre, usuario_dept || null, subscription.endpoint, subscription.keys.auth, subscription.keys.p256dh, req.headers['user-agent'] || null]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("Error guardando suscripcion push:", e);
    res.status(500).json({ ok: false, error: "Error interno" });
  }
});

// POST /api/push/unsubscribe - Eliminar suscripcion (logout)
app.post("/api/push/unsubscribe", requireAuthIfEnabled, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ ok: false, error: "Falta endpoint" });
    await pool.query("DELETE FROM push_subscriptions WHERE endpoint=?", [endpoint]);
    res.json({ ok: true });
  } catch (e) {
    console.error("Error eliminando suscripcion:", e);
    res.status(500).json({ ok: false, error: "Error interno" });
  }
});

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

app.get("/api/users", async (req,res)=>{
  try{
    const [rows] = await pool.query("SELECT id, nombre, departamento FROM usuarios ORDER BY nombre");
    res.json({ ok:true, data: rows });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// GET /api/amas-llaves - lista de amas de llaves (inspectores únicos de inspecciones)
app.get("/api/amas-llaves", requireAuthIfEnabled, async (req,res)=>{
  try{
    const [rows] = await pool.query(`
      SELECT DISTINCT inspector_nombre AS nombre
      FROM inspecciones
      WHERE inspector_nombre IS NOT NULL AND inspector_nombre != ''
      ORDER BY inspector_nombre
    `);
    res.json({ ok:true, data: rows });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/users/update", requireAuthIfEnabled, async (req,res)=>{
  try{
    const id = Number(req.body?.id);
    if(!id) return res.status(400).json({ ok:false, error:"ID requerido" });

    const nombre = req.body?.nombre !== undefined ? String(req.body.nombre).trim() : null;
    const departamento = req.body?.departamento !== undefined ? String(req.body.departamento).trim() : null;

    const sets = [];
    const params = [];
    if (nombre !== null && nombre !== '') { sets.push("nombre=?"); params.push(nombre); }
    if (departamento !== null && departamento !== '') { sets.push("departamento=?"); params.push(departamento); }

    if (!sets.length) return res.status(400).json({ ok:false, error:"Sin campos para actualizar" });

    params.push(id);
    await pool.query(`UPDATE usuarios SET ${sets.join(", ")} WHERE id=?`, params);
    res.json({ ok:true });
  }catch(e){
    if(e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok:false, error:"Ya existe un usuario con ese nombre" });
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/users/delete", requireAuthIfEnabled, async (req,res)=>{
  try{
    const id = Number(req.body?.id);
    if(!id) return res.status(400).json({ ok:false, error:"ID requerido" });
    await pool.query("DELETE FROM usuarios WHERE id=?", [id]);
    res.json({ ok:true });
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

    if(!rows.length) return res.status(401).json({ ok:false, error:"Credenciales inválidas" });

    const u = rows[0];
    const stored = String(u.clave || "");
    let ok = false;
    if (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$")) {
      ok = await bcrypt.compare(clave, stored);
    } else {
      ok = stored === clave;
    }

    if(!ok) return res.status(401).json({ ok:false, error:"Credenciales inválidas" });

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

// ===== MODULOS CRUD =====
app.post("/api/modulos/create", requireAuthIfEnabled, async (req,res)=>{
  try{
    let id = String(req.body?.id || "").trim().toUpperCase().replace(/\s+/g, "");
    const descripcion = String(req.body?.descripcion || "").trim().replace(/\s+/g, " ");
    if(!id || !descripcion) return res.status(400).json({ ok:false, error:"ID y descripcion requeridos" });
    const [dup] = await pool.query("SELECT id FROM modulos WHERE id=?", [id]);
    if(dup.length) return res.status(409).json({ ok:false, error:`El modulo "${id}" ya existe` });
    await pool.query("INSERT INTO modulos (id, descripcion) VALUES (?,?)", [id, descripcion]);
    res.json({ ok:true });
  }catch(e){
    if(e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok:false, error:"El ID del modulo ya existe" });
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/modulos/update", requireAuthIfEnabled, async (req,res)=>{
  try{
    const id = String(req.body?.id || "").trim();
    const descripcion = String(req.body?.descripcion || "").trim();
    if(!id || !descripcion) return res.status(400).json({ ok:false, error:"Datos incompletos" });
    await pool.query("UPDATE modulos SET descripcion=? WHERE id=?", [descripcion, id]);
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/modulos/delete", requireAuthIfEnabled, async (req,res)=>{
  try{
    const id = String(req.body?.id || "").trim();
    if(!id) return res.status(400).json({ ok:false, error:"ID requerido" });
    const [refs] = await pool.query("SELECT COUNT(*) AS cnt FROM inspecciones WHERE modulo_id=?", [id]);
    const count = Number(refs[0]?.cnt || 0);
    if(count > 0) {
      return res.status(409).json({
        ok: false,
        error: `No se puede eliminar: hay ${count} inspeccion${count !== 1 ? 'es' : ''} asociada${count !== 1 ? 's' : ''} a este modulo.`,
        code: "HAS_REFERENCES",
        refCount: count
      });
    }
    await pool.query("DELETE FROM habitaciones WHERE modulo_id=?", [id]);
    await pool.query("DELETE FROM modulos WHERE id=?", [id]);
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// ===== HABITACIONES CRUD =====
app.post("/api/habitaciones/create", requireAuthIfEnabled, async (req,res)=>{
  try{
    const modulo_id = String(req.body?.modulo_id || "").trim();
    let etiqueta = String(req.body?.etiqueta || "").trim();
    const es_familiar = req.body?.es_familiar ? 1 : 0;

    if(!modulo_id) return res.status(400).json({ ok:false, error:"Modulo requerido" });
    if(!etiqueta) return res.status(400).json({ ok:false, error:"Etiqueta requerida" });

    const [r] = await pool.query(
      "INSERT INTO habitaciones (modulo_id, etiqueta, es_familiar) VALUES (?,?,?)",
      [modulo_id, etiqueta, es_familiar]
    );
    res.json({ ok:true });
  }catch(e){
    if(e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok:false, error:"Esa habitacion ya existe en ese modulo" });
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/habitaciones/update", requireAuthIfEnabled, async (req,res)=>{
  try{
    const id = Number(req.body?.id);
    if(!id) return res.status(400).json({ ok:false, error:"ID requerido" });

    const etiqueta = req.body?.etiqueta !== undefined ? String(req.body.etiqueta).trim() : null;
    const es_familiar = req.body?.es_familiar !== undefined ? (req.body.es_familiar ? 1 : 0) : null;

    const sets = [];
    const params = [];
    if (etiqueta !== null) { sets.push("etiqueta=?"); params.push(etiqueta); }
    if (es_familiar !== null) { sets.push("es_familiar=?"); params.push(es_familiar); }

    if (!sets.length) return res.status(400).json({ ok:false, error:"Sin campos para actualizar" });

    params.push(id);
    await pool.query(`UPDATE habitaciones SET ${sets.join(", ")} WHERE id=?`, params);
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/habitaciones/delete", requireAuthIfEnabled, async (req,res)=>{
  try{
    const id = Number(req.body?.id);
    if(!id) return res.status(400).json({ ok:false, error:"ID requerido" });
    const [hab] = await pool.query("SELECT modulo_id, etiqueta FROM habitaciones WHERE id=?", [id]);
    if(!hab.length) return res.status(404).json({ ok:false, error:"Habitacion no encontrada" });
    const { modulo_id, etiqueta } = hab[0];
    const [refs] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM inspecciones WHERE modulo_id=? AND habitacion_etiqueta=?",
      [modulo_id, etiqueta]
    );
    const count = Number(refs[0]?.cnt || 0);
    if(count > 0) {
      return res.status(409).json({
        ok: false,
        error: `No se puede eliminar: hay ${count} inspeccion${count !== 1 ? 'es' : ''} asociada${count !== 1 ? 's' : ''} a esta habitacion.`,
        code: "HAS_REFERENCES",
        refCount: count
      });
    }
    await pool.query("DELETE FROM habitaciones WHERE id=?", [id]);
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});



// ===== CAMARERAS =====
app.get("/api/camareras", async (req,res)=>{
  try{
    const [rows] = await pool.query("SELECT id, nombre, factura FROM camareras WHERE activo=1 ORDER BY nombre");
    res.json({ ok:true, data: rows });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/camareras/create", requireAuthIfEnabled, async (req,res)=>{
  try{
    let nombre = String(req.body?.nombre || "").trim().replace(/\s+/g, " ");
    const factura = req.body?.factura ? 1 : 0;
    if(!nombre) return res.status(400).json({ ok:false, error:"Nombre requerido" });
    const [dup] = await pool.query("SELECT id FROM camareras WHERE LOWER(nombre)=LOWER(?) AND activo=1", [nombre]);
    if(dup.length) return res.status(409).json({ ok:false, error:`Ya existe una camarera con el nombre "${nombre}"` });
    const [r] = await pool.query("INSERT INTO camareras (nombre, factura) VALUES (?,?)", [nombre, factura]);
    res.json({ ok:true, id: r.insertId });
  }catch(e){
    if(e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok:false, error:"Ya existe una camarera con ese nombre" });
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/camareras/update", requireAuthIfEnabled, async (req,res)=>{
  try{
    const id = Number(req.body?.id);
    let nombre = String(req.body?.nombre || "").trim().replace(/\s+/g, " ");
    if(!id || !nombre) return res.status(400).json({ ok:false, error:"Datos incompletos" });
    const [dup] = await pool.query("SELECT id FROM camareras WHERE LOWER(nombre)=LOWER(?) AND activo=1 AND id!=?", [nombre, id]);
    if(dup.length) return res.status(409).json({ ok:false, error:`Ya existe otra camarera con el nombre "${nombre}"` });
    if (req.body?.factura !== undefined) {
      const factura = req.body.factura ? 1 : 0;
      await pool.query("UPDATE camareras SET nombre=?, factura=? WHERE id=?", [nombre, factura, id]);
    } else {
      await pool.query("UPDATE camareras SET nombre=? WHERE id=?", [nombre, id]);
    }
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/camareras/delete", requireAuthIfEnabled, async (req,res)=>{
  try{
    const id = Number(req.body?.id);
    if(!id) return res.status(400).json({ ok:false, error:"ID requerido" });
    const [refs] = await pool.query("SELECT COUNT(*) AS cnt FROM inspecciones WHERE camarera_id=?", [id]);
    const count = Number(refs[0]?.cnt || 0);
    if(count > 0) {
      return res.status(409).json({
        ok: false,
        error: `No se puede eliminar: tiene ${count} inspeccion${count !== 1 ? 'es' : ''} asignada${count !== 1 ? 's' : ''}. Puedes desactivarla (se marcará como inactiva).`,
        code: "HAS_REFERENCES",
        refCount: count
      });
    }
    await pool.query("UPDATE camareras SET activo=0 WHERE id=?", [id]);
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// ===== CONFIGURACION PAGOS =====
app.get("/api/config-pagos", async (req,res)=>{
  try{
    const [rows] = await pool.query("SELECT id, porcentaje_factura, extra_factura_si, extra_factura_no FROM configuracion_pagos LIMIT 1");
    const config = rows[0] || { porcentaje_factura: 33.00, extra_factura_si: 46.00, extra_factura_no: 36.00 };
    res.json({ ok:true, data: config });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/config-pagos/update", requireAuthIfEnabled, async (req,res)=>{
  try{
    const porcentaje_factura = Number(req.body?.porcentaje_factura);
    const extra_factura_si = Number(req.body?.extra_factura_si);
    const extra_factura_no = Number(req.body?.extra_factura_no);

    if (!Number.isFinite(porcentaje_factura) || porcentaje_factura < 0) {
      return res.status(400).json({ ok:false, error:"Porcentaje invalido" });
    }
    if (!Number.isFinite(extra_factura_si) || extra_factura_si < 0) {
      return res.status(400).json({ ok:false, error:"Extra factura si invalido" });
    }
    if (!Number.isFinite(extra_factura_no) || extra_factura_no < 0) {
      return res.status(400).json({ ok:false, error:"Extra factura no invalido" });
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
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// ===== CHECKLIST CATEGORIAS =====
app.get("/api/checklist/categorias", async (req,res)=>{
  try{
    const [rows] = await pool.query("SELECT id, nombre, ayuda, orden FROM checklist_categorias WHERE activo=1 ORDER BY orden");
    res.json({ ok:true, data: rows });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/checklist/categorias/create", requireAuthIfEnabled, async (req,res)=>{
  try{
    const nombre = String(req.body?.nombre || "").trim();
    const ayuda = String(req.body?.ayuda || "").trim();
    if(!nombre) return res.status(400).json({ ok:false, error:"Nombre requerido" });
    const [r] = await pool.query("INSERT INTO checklist_categorias (nombre, ayuda) VALUES (?,?)", [nombre, ayuda]);
    res.json({ ok:true, id: r.insertId });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/checklist/categorias/update", requireAuthIfEnabled, async (req,res)=>{
  try{
    const id = Number(req.body?.id);
    const nombre = String(req.body?.nombre || "").trim();
    if(!id || !nombre) return res.status(400).json({ ok:false, error:"Datos incompletos" });
    await pool.query("UPDATE checklist_categorias SET nombre=? WHERE id=?", [nombre, id]);
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/checklist/categorias/delete", requireAuthIfEnabled, async (req,res)=>{
  try{
    const id = Number(req.body?.id);
    if(!id) return res.status(400).json({ ok:false, error:"ID requerido" });
    await pool.query("UPDATE checklist_categorias SET activo=0 WHERE id=?", [id]);
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// ===== CHECKLIST ITEMS =====
app.get("/api/checklist/items", async (req,res)=>{
  try{
    const [rows] = await pool.query(`
      SELECT ci.id, ci.categoria_id, ci.nombre, ci.orden, cc.nombre AS categoria_nombre
      FROM checklist_items ci
      JOIN checklist_categorias cc ON cc.id = ci.categoria_id
      WHERE ci.activo=1 AND cc.activo=1
      ORDER BY ci.orden
    `);
    res.json({ ok:true, data: rows });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/checklist/items/create", requireAuthIfEnabled, async (req,res)=>{
  try{
    const categoria_id = Number(req.body?.categoria_id);
    const nombre = String(req.body?.nombre || "").trim();
    if(!categoria_id || !nombre) return res.status(400).json({ ok:false, error:"Datos incompletos" });
    const [r] = await pool.query("INSERT INTO checklist_items (categoria_id, nombre) VALUES (?,?)", [categoria_id, nombre]);
    res.json({ ok:true, id: r.insertId });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/checklist/items/update", requireAuthIfEnabled, async (req,res)=>{
  try{
    const id = Number(req.body?.id);
    const nombre = String(req.body?.nombre || "").trim();
    const categoria_id = req.body?.categoria_id ? Number(req.body.categoria_id) : null;
    if(!id || !nombre) return res.status(400).json({ ok:false, error:"Datos incompletos" });
    const sql = categoria_id ? "UPDATE checklist_items SET nombre=?, categoria_id=? WHERE id=?" : "UPDATE checklist_items SET nombre=? WHERE id=?";
    const params = categoria_id ? [nombre, categoria_id, id] : [nombre, id];
    await pool.query(sql, params);
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/checklist/items/delete", requireAuthIfEnabled, async (req,res)=>{
  try{
    const id = Number(req.body?.id);
    if(!id) return res.status(400).json({ ok:false, error:"ID requerido" });
    await pool.query("UPDATE checklist_items SET activo=0 WHERE id=?", [id]);
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// ===== TIPOS DE LIMPIEZA =====
app.get("/api/tipos-limpieza", async (req,res)=>{
  try{
    const [rows] = await pool.query("SELECT id, nombre FROM tipos_limpieza WHERE activo=1 ORDER BY id");
    res.json({ ok:true, data: rows });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/tipos-limpieza/create", requireAuthIfEnabled, async (req,res)=>{
  try{
    const nombre = String(req.body?.nombre || "").trim();
    if(!nombre) return res.status(400).json({ ok:false, error:"Nombre requerido" });
    const [r] = await pool.query("INSERT INTO tipos_limpieza (nombre) VALUES (?)", [nombre]);
    res.json({ ok:true, id: r.insertId });
  }catch(e){
    if(e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok:false, error:"Ya existe ese tipo de limpieza" });
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/tipos-limpieza/update", requireAuthIfEnabled, async (req,res)=>{
  try{
    const id = Number(req.body?.id);
    const nombre = String(req.body?.nombre || "").trim();
    if(!id || !nombre) return res.status(400).json({ ok:false, error:"Datos incompletos" });
    await pool.query("UPDATE tipos_limpieza SET nombre=? WHERE id=?", [nombre, id]);
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.post("/api/tipos-limpieza/delete", requireAuthIfEnabled, async (req,res)=>{
  try{
    const id = Number(req.body?.id);
    if(!id) return res.status(400).json({ ok:false, error:"ID requerido" });
    await pool.query("UPDATE tipos_limpieza SET activo=0 WHERE id=?", [id]);
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// ===== INSPECCIONES (LOCAL) =====
app.post("/api/inspecciones/guardar", async (req,res)=>{
  try{
    const data = req.body;
    if(!data?.modulo_id || !data?.habitacion_etiqueta || !data?.fecha){
      return res.status(400).json({ ok:false, error:"Faltan datos requeridos" });
    }

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

    // Verificar si ya existe una inspeccion identica (misma hab, fecha, horas, inspector)
    const [existing] = await pool.query(`
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

    if(existing.length){
      const inspeccion_id = existing[0].id;
      // Reemplazar detalles (por si cambiaron estados)
      if(Array.isArray(data.detalles) && data.detalles.length){
        await pool.query("DELETE FROM inspeccion_detalles WHERE inspeccion_id=?", [inspeccion_id]);
        const validDetails = data.detalles
          .filter(d => d.item_id)
          .map(d => [inspeccion_id, d.item_id, ['CUMPLE','NO_CUMPLE','NO_APLICA'].includes(d.estado) ? d.estado : 'NO_APLICA']);
        if (validDetails.length) {
          const placeholders = validDetails.map(() => '(?,?,?)').join(',');
          await pool.query(`INSERT INTO inspeccion_detalles (inspeccion_id, item_id, estado) VALUES ${placeholders}`, validDetails.flat());
        }
      }
      // Actualizar camareras si hay nuevas
      if (camareraIds.length) {
        await pool.query("DELETE FROM inspecciones_camareras WHERE inspeccion_id=?", [inspeccion_id]);
        const camPlaceholders = camareraIds.map(() => '(?,?)').join(',');
        await pool.query(`INSERT INTO inspecciones_camareras (inspeccion_id, camarera_id) VALUES ${camPlaceholders}`, camareraIds.flatMap(id => [inspeccion_id, id]));
      }
      return res.json({ ok:true, id: inspeccion_id, dedup: true });
    }

    const [header] = await pool.query(`
      INSERT INTO inspecciones
        (modulo_id, modulo_nombre, habitacion_etiqueta, fecha, camarera_id, tipo_limpieza_id,
         inspector_nombre, inspector_dept, inicio_limpieza, fin_limpieza, hora_checklist,
         observaciones, es_decorada, es_familiar)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      data.modulo_id,
      data.modulo_nombre || '',
      data.habitacion_etiqueta,
      data.fecha,
      primaryCamareraId,
      data.tipo_limpieza_id || null,
      data.inspector_nombre || '',
      data.inspector_dept || '',
      inicio, fin, horaChk,
      data.observaciones || null,
      data.es_decorada ? 1 : 0,
      data.es_familiar ? 1 : 0
    ]);

    const inspeccion_id = header.insertId;

    // Guardar relacion multiple de camareras
    if (camareraIds.length) {
      const camPlaceholders = camareraIds.map(() => '(?,?)').join(',');
      await pool.query(`INSERT INTO inspecciones_camareras (inspeccion_id, camarera_id) VALUES ${camPlaceholders}`, camareraIds.flatMap(id => [inspeccion_id, id]));
    }

    if(Array.isArray(data.detalles)){
      const validDetails = data.detalles
        .filter(d => d.item_id)
        .map(d => [inspeccion_id, d.item_id, ['CUMPLE','NO_CUMPLE','NO_APLICA'].includes(d.estado) ? d.estado : 'NO_APLICA']);
      if (validDetails.length) {
        const placeholders = validDetails.map(() => '(?,?,?)').join(',');
        await pool.query(`INSERT INTO inspeccion_detalles (inspeccion_id, item_id, estado) VALUES ${placeholders}`, validDetails.flat());
      }
    }

    res.json({ ok:true, id: inspeccion_id });
  }catch(e){
    console.error("Error guardando inspeccion:", e);
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// ===== REPORTES =====

// GET /api/reportes/pagos?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD&camarera_id=N&modulo_id=X
app.get("/api/reportes/pagos", requireAuthIfEnabled, async (req,res)=>{
  try{
    const fecha_desde = String(req.query?.fecha_desde || "").trim();
    const fecha_hasta = String(req.query?.fecha_hasta || "").trim();
    const filtro_camarera_id = req.query?.camarera_id ? Number(req.query.camarera_id) : null;
    const modulo_id = String(req.query?.modulo_id || "").trim();

    if (!fecha_desde || !fecha_hasta) {
      return res.status(400).json({ ok:false, error:"Faltan fecha_desde y fecha_hasta" });
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

    // Obtener inspecciones con sus camareras (relacion multiple)
    const sqlInspecciones = `
      SELECT
        i.id, i.modulo_nombre, i.habitacion_etiqueta, i.fecha,
        i.inicio_limpieza, i.fin_limpieza, i.hora_checklist,
        i.es_familiar, i.observaciones,
        i.camarera_id,
        t.id AS tipo_limpieza_id, t.nombre AS tipo_nombre,
        COALESCE(det.cumplen, 0) AS cumplen,
        COALESCE(det.no_cumplen, 0) AS no_cumplen,
        COALESCE(det.no_aplica, 0) AS no_aplica,
        COALESCE(det.total_items, 0) AS total_items,
        COALESCE(pe.precio, 0) AS pago_base,
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

    // Obtener info de camareras
    const camarerasMap = {};
    const [camarerasRows] = await pool.query("SELECT id, nombre, factura FROM camareras WHERE activo=1");
    camarerasRows.forEach(c => { camarerasMap[c.id] = c; });

    // Contar habitaciones por camarera por dia
    const countPorDia = {};
    inspecciones.forEach(insp => {
      if (!insp.camareras_list) return;
      const camarerasIds = String(insp.camareras_list).split(",").map(Number).filter(id => id);
      camarerasIds.forEach(cid => {
        if (!countPorDia[cid]) countPorDia[cid] = {};
        const dia = String(insp.fecha).slice(0, 10);
        countPorDia[cid][dia] = (countPorDia[cid][dia] || 0) + 1;
      });
    });

    // Obtener configuracion de pagos
    let pct = 33, extraSi = 46, extraNo = 36;
    try {
      const [cfg] = await pool.query("SELECT porcentaje_factura, extra_factura_si, extra_factura_no FROM configuracion_pagos LIMIT 1");
      if (cfg.length) {
        pct = Number(cfg[0].porcentaje_factura) || 33;
        extraSi = Number(cfg[0].extra_factura_si) || 46;
        extraNo = Number(cfg[0].extra_factura_no) || 36;
      }
    } catch (e) {}

    // Construir filas expandidas (una por cada camarera de cada inspeccion)
    const filasExpandidas = [];
    inspecciones.forEach(insp => {
      if (!insp.camareras_list) return;
      let camarerasIds = String(insp.camareras_list).split(",").map(Number).filter(id => id);
      // Filtrar por camarera si se especifico
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
        const countDia = countPorDia[cid]?.[dia] || 0;
        const aplicaExtra = countDia > 6;
        const tieneFactura = Number(cam.factura) === 1;
        let pagoFinal;
        if (aplicaExtra) {
          // Si aplica extra: (base/n) * (1+pct) + extra
          pagoFinal = pagoBaseDividido * (1 + pct / 100) + (tieneFactura ? extraSi : extraNo);
        } else {
          // Si NO aplica extra: solo base/n (sin extra ni porcentaje)
          pagoFinal = pagoBaseDividido;
        }
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
          pago_final: Math.round(pagoFinal * 100) / 100
        });
      });
    });

    // Agrupar por camarera para resumen
    const grupoPagos = {};
    filasExpandidas.forEach(r => {
      const cid = r.camarera_id;
      if (!grupoPagos[cid]) {
        grupoPagos[cid] = {
          base: 0,
          factura: Number(r.camarera_factura),
          nombre: r.camarera_nombre,
          count_dia: {}
        };
      }
      grupoPagos[cid].base += r.pago_base;
      const dia = String(r.fecha).slice(0, 10);
      if (!grupoPagos[cid].count_dia[dia]) grupoPagos[cid].count_dia[dia] = 0;
      grupoPagos[cid].count_dia[dia]++;
    });

    let totalPagoFinal = 0;
    Object.keys(grupoPagos).forEach(cid => {
      const g = grupoPagos[cid];
      let pagoTotal = 0;
      Object.keys(g.count_dia).forEach(dia => {
        const count = g.count_dia[dia];
        const aplicaExtra = count > 6;
        if (aplicaExtra) {
          pagoTotal += g.base * (1 + pct / 100) + (g.factura ? extraSi : extraNo);
        } else {
          pagoTotal += g.base;
        }
      });
      const rounded = Math.round(pagoTotal * 100) / 100;
      grupoPagos[cid].pagoFinal = rounded;
      totalPagoFinal += rounded;
    });

    const globalOk = filasExpandidas.reduce((sum, r) => sum + (Number(r.cumplen) || 0), 0);
    const globalNo = filasExpandidas.reduce((sum, r) => sum + (Number(r.no_cumplen) || 0), 0);
    const globalNa = filasExpandidas.reduce((sum, r) => sum + (Number(r.no_aplica) || 0), 0);
    const totalPagoBase = filasExpandidas.reduce((sum, r) => sum + (Number(r.pago_base) || 0), 0);

    // Construir detalle_pagos keyed por nombre de camarera
    const detallePagos = {};
    const porCamarera = {};
    Object.keys(grupoPagos).forEach(cid => {
      const g = grupoPagos[cid];
      const nombre = g.nombre;
      const countDias = Object.keys(g.count_dia).length;
      const aplicaExtra = Object.values(g.count_dia).some(c => c > 6);
      detallePagos[nombre] = {
        factura: g.factura,
        pct: aplicaExtra ? pct : 0,
        extra: aplicaExtra ? (g.factura ? extraSi : extraNo) : 0,
        pagoFinal: g.pagoFinal,
        base: Math.round(g.base * 100) / 100,
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
  }catch(e){
    console.error("Error en reporte pagos:", e);
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// GET /api/reportes/rendimiento?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD&camarera_id=N&ama_llaves_nombre=X
app.get("/api/reportes/rendimiento", requireAuthIfEnabled, async (req,res)=>{
  try{
    const fecha_desde = String(req.query?.fecha_desde || "").trim();
    const fecha_hasta = String(req.query?.fecha_hasta || "").trim();
    const camarera_id = req.query?.camarera_id ? Number(req.query.camarera_id) : null;
    const ama_llaves_nombre = req.query?.ama_llaves_nombre ? String(req.query.ama_llaves_nombre).trim() : null;

    if (!fecha_desde || !fecha_hasta) {
      return res.status(400).json({ ok:false, error:"Faltan fecha_desde y fecha_hasta" });
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
        COALESCE(SUM(COALESCE(pe.precio, 0) / NULLIF(cnt_cams.count_camareras, 0)), 0) AS total_pago,
        COALESCE(ROUND(AVG(TIMESTAMPDIFF(MINUTE, i.inicio_limpieza, i.fin_limpieza)), 0), 0) AS promedio_minutos,
        COALESCE(ROUND(AVG(TIMESTAMPDIFF(MINUTE, i.fin_limpieza, i.hora_checklist)), 0), 0) AS promedio_inspeccion_min,
        COUNT(DISTINCT CASE WHEN cnt_cams.count_camareras > 1 THEN i.id END) AS habitaciones_compartidas,
        COALESCE(ROUND(AVG(CASE WHEN est.hora_listo_limpieza IS NOT NULL AND i.inicio_limpieza IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, est.hora_listo_limpieza, i.inicio_limpieza) END), 0), 0) AS promedio_tiempo_asignacion
      FROM inspecciones i
      JOIN inspecciones_camareras ic ON ic.inspeccion_id = i.id
      JOIN camareras c ON c.id = ic.camarera_id
      LEFT JOIN habitaciones h ON h.modulo_id = i.modulo_id AND h.etiqueta = i.habitacion_etiqueta
      LEFT JOIN precios_especiales_habitacion pe ON pe.habitacion_id = h.id AND pe.tipo_limpieza_id = i.tipo_limpieza_id AND pe.es_familiar = COALESCE(i.es_familiar, 0)
      LEFT JOIN estados_habitacion est ON est.habitacion_id = h.id
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

    res.json({ ok:true, data: rows });
  }catch(e){
    console.error("Error en reporte rendimiento:", e);
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// GET /api/reportes/rendimiento/amas?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD&ama_nombre=X
// Retorna rendimiento agrupado por AMA DE LLAVES (inspector)
app.get("/api/reportes/rendimiento/amas", requireAuthIfEnabled, async (req,res)=>{
  try{
    const fecha_desde = String(req.query?.fecha_desde || "").trim();
    const fecha_hasta = String(req.query?.fecha_hasta || "").trim();
    const ama_nombre = req.query?.ama_nombre ? String(req.query.ama_nombre).trim() : null;

    if (!fecha_desde || !fecha_hasta) {
      return res.status(400).json({ ok:false, error:"Faltan fecha_desde y fecha_hasta" });
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
        COALESCE(ROUND(AVG(CASE WHEN est.hora_listo_limpieza IS NOT NULL AND i.inicio_limpieza IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, est.hora_listo_limpieza, i.inicio_limpieza) END), 0), 0) AS promedio_tiempo_asignacion
      FROM inspecciones i
      LEFT JOIN habitaciones h ON h.modulo_id = i.modulo_id AND h.etiqueta = i.habitacion_etiqueta
      LEFT JOIN precios_especiales_habitacion pe ON pe.habitacion_id = h.id AND pe.tipo_limpieza_id = i.tipo_limpieza_id AND pe.es_familiar = COALESCE(i.es_familiar, 0)
      LEFT JOIN estados_habitacion est ON est.habitacion_id = h.id
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

    res.json({ ok:true, data: rows });
  }catch(e){
    console.error("Error en reporte rendimiento amas:", e);
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// GET /api/reportes/rendimiento/daily?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD&camarera_id=N&ama_llaves_nombre=X
// Retorna desglose diario por camarera para graficas
app.get("/api/reportes/rendimiento/daily", requireAuthIfEnabled, async (req,res)=>{
  try{
    const fecha_desde = String(req.query?.fecha_desde || "").trim();
    const fecha_hasta = String(req.query?.fecha_hasta || "").trim();
    const camarera_id = req.query?.camarera_id ? Number(req.query.camarera_id) : null;
    const ama_llaves_nombre = req.query?.ama_llaves_nombre ? String(req.query.ama_llaves_nombre).trim() : null;

    if (!fecha_desde || !fecha_hasta) {
      return res.status(400).json({ ok:false, error:"Faltan fecha_desde y fecha_hasta" });
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
        COALESCE(SUM(COALESCE(pe.precio, 0) / NULLIF(cnt_cams.count_camareras, 0)), 0) AS pago_total,
        COUNT(DISTINCT CASE WHEN cnt_cams.count_camareras > 1 THEN i.id END) AS habitaciones_compartidas,
        COALESCE(ROUND(AVG(CASE WHEN est.hora_listo_limpieza IS NOT NULL AND i.inicio_limpieza IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, est.hora_listo_limpieza, i.inicio_limpieza) END), 0), 0) AS tiempo_asignacion_min
      FROM inspecciones i
      JOIN inspecciones_camareras ic ON ic.inspeccion_id = i.id
      JOIN camareras c ON c.id = ic.camarera_id
      LEFT JOIN habitaciones h ON h.modulo_id = i.modulo_id AND h.etiqueta = i.habitacion_etiqueta
      LEFT JOIN precios_especiales_habitacion pe ON pe.habitacion_id = h.id AND pe.tipo_limpieza_id = i.tipo_limpieza_id AND pe.es_familiar = COALESCE(i.es_familiar, 0)
      LEFT JOIN estados_habitacion est ON est.habitacion_id = h.id
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

    // Agrupar por camarera
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
        tiempo_asignacion_min: Number(r.tiempo_asignacion_min || 0)
      });
    });

    res.json({
      ok: true,
      data: Object.values(grouped)
    });
  }catch(e){
    console.error("Error en rendimiento daily:", e);
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// GET /api/reportes/historial?modulo_id=X&etiqueta=Y&fecha=YYYY-MM-DD
app.get("/api/reportes/historial", requireAuthIfEnabled, async (req,res)=>{
  try{
    const modulo_id = String(req.query?.modulo_id || "").trim();
    const etiqueta = String(req.query?.etiqueta || "").trim();
    const fecha = String(req.query?.fecha || "").trim();

    if (!modulo_id || !etiqueta || !fecha) {
      return res.status(400).json({ ok:false, error:"Faltan modulo_id, etiqueta, fecha" });
    }

    // 1) Obtener eventos del log para esa habitacion en esa fecha
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

    // 2) Obtener inspecciones de esa habitacion en esa fecha
    const [inspecciones] = await pool.query(`
      SELECT
        i.id, i.fecha,
        i.inicio_limpieza, i.fin_limpieza, i.hora_checklist,
        c.nombre AS camarera_nombre,
        t.nombre AS tipo_nombre,
        i.inspector_nombre, i.es_decorada, i.es_familiar,
        i.observaciones
      FROM inspecciones i
      LEFT JOIN camareras c ON c.id = i.camarera_id
      LEFT JOIN tipos_limpieza t ON t.id = i.tipo_limpieza_id
      WHERE i.modulo_id = ? AND i.habitacion_etiqueta = ?
        AND i.fecha = ?
      ORDER BY i.inicio_limpieza ASC
    `, [modulo_id, etiqueta, fecha]);

    // 3) Construir linea de tiempo combinada
    const timeline = [];

    logs.forEach(l => {
      const ts = String(l.timestamp || "");
      const time = ts.includes(" ") ? ts.split(" ")[1]?.substring(0, 5) : "--:--";
      timeline.push({
        hora: time,
        timestamp: ts,
        tipo: "log",
        evento: l.evento,
        descripcion: l.evento === "room_update"
          ? `Cambio de estado: ${l.estado_prev || "?"} → ${l.estado_new || "?"}`
          : l.evento,
        actor: l.actor_name || "Sistema",
        dept: l.actor_dept || "",
        color: colorDeEstado(l.estado_new)
      });
    });

    // Inspecciones como eventos en la timeline
    inspecciones.forEach(insp => {
      if (insp.inicio_limpieza) {
        const ts = String(insp.inicio_limpieza || "");
        const time = ts.includes(" ") ? ts.split(" ")[1]?.substring(0, 5) : "--:--";
        timeline.push({
          hora: time,
          timestamp: ts,
          tipo: "inicio_limpieza",
          evento: "INICIO LIMPIEZA",
          descripcion: `Camarera: ${insp.camarera_nombre || "-"} | Tipo: ${insp.tipo_nombre || "-"}`,
          actor: insp.camarera_nombre || "-",
          dept: "CAMARERIA",
          color: "#C8A57A"
        });
      }
      if (insp.fin_limpieza) {
        const ts = String(insp.fin_limpieza || "");
        const time = ts.includes(" ") ? ts.split(" ")[1]?.substring(0, 5) : "--:--";
        timeline.push({
          hora: time,
          timestamp: ts,
          tipo: "fin_limpieza",
          evento: "FIN LIMPIEZA",
          descripcion: insp.observaciones || "-",
          actor: insp.camarera_nombre || "-",
          dept: "CAMARERIA",
          color: "#38BDF8"
        });
      }
      if (insp.hora_checklist) {
        const ts = String(insp.hora_checklist || "");
        const time = ts.includes(" ") ? ts.split(" ")[1]?.substring(0, 5) : "--:--";
        const familiar = Number(insp.es_familiar) ? " (Familiar)" : "";
        const decorada = Number(insp.es_decorada) ? " (Decorada)" : "";
        timeline.push({
          hora: time,
          timestamp: ts,
          tipo: "checklist",
          evento: "INSPECCION COMPLETADA",
          descripcion: `Inspector: ${insp.inspector_nombre || "-"}${familiar}${decorada}`,
          actor: insp.inspector_nombre || "-",
          dept: "CAMARERIA",
          color: "#2EE59D"
        });
      }
    });

    // Ordenar por timestamp
    timeline.sort((a, b) => {
      if (a.timestamp < b.timestamp) return -1;
      if (a.timestamp > b.timestamp) return 1;
      return 0;
    });

    // Info de la habitacion
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
  }catch(e){
    console.error("Error en historial:", e);
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

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

app.get("/api/inspecciones", async (req,res)=>{
  try{
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
    if(modulo_id){ sql += " AND i.modulo_id=?"; params.push(modulo_id); }
    if(fecha_desde){ sql += " AND i.fecha>=?"; params.push(fecha_desde); }
    if(fecha_hasta){ sql += " AND i.fecha<=?"; params.push(fecha_hasta); }
    sql += " ORDER BY i.created_at DESC";
    if(limit){ sql += " LIMIT ?"; params.push(Number(limit)); }

    const [rows] = await pool.query(sql, params);
    res.json({ ok:true, data: rows });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// POST /api/inspecciones/buscar - Busqueda avanzada con filtros
app.post("/api/inspecciones/buscar", requireAuthIfEnabled, async (req,res)=>{
  try{
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
  }catch(e){
    console.error("Error en buscar inspecciones:", e);
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// POST /api/inspecciones/actualizar - Actualizar cabecera de inspeccion
app.post("/api/inspecciones/actualizar", requireAuthIfEnabled, async (req,res)=>{
  try{
    const id = Number(req.body?.id);
    if (!id) return res.status(400).json({ ok:false, error:"ID requerido" });

    // Verificar que existe
    const [exist] = await pool.query("SELECT id FROM inspecciones WHERE id=?", [id]);
    if (!exist.length) return res.status(404).json({ ok:false, error:"Inspeccion no encontrada" });

    const updates = [];
    const params = [];

    if (req.body?.fecha !== undefined) {
      updates.push("fecha=?");
      params.push(String(req.body.fecha).trim());
    }
    if (req.body?.camarera_id !== undefined) {
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
    if (req.body?.inspector_nombre !== undefined) {
      updates.push("inspector_nombre=?");
      params.push(String(req.body.inspector_nombre || '').trim());
    }
    if (req.body?.modulo_id !== undefined) {
      updates.push("modulo_id=?");
      params.push(String(req.body.modulo_id).trim());
    }
    if (req.body?.habitacion_etiqueta !== undefined) {
      updates.push("habitacion_etiqueta=?");
      params.push(String(req.body.habitacion_etiqueta).trim());
    }

    if (!updates.length) {
      return res.status(400).json({ ok:false, error:"No hay campos para actualizar" });
    }

    params.push(id);
    await pool.query(`UPDATE inspecciones SET ${updates.join(", ")} WHERE id=?`, params);

    res.json({ ok: true });
  }catch(e){
    console.error("Error actualizando inspeccion:", e);
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// POST /api/inspecciones/detalle/actualizar - Actualizar estado de un item del checklist
app.post("/api/inspecciones/detalle/actualizar", requireAuthIfEnabled, async (req,res)=>{
  try{
    const id = Number(req.body?.id);
    const estado = String(req.body?.estado || '').trim().toUpperCase();

    if (!id) return res.status(400).json({ ok:false, error:"ID de detalle requerido" });
    if (!['CUMPLE','NO_CUMPLE','NO_APLICA'].includes(estado)) {
      return res.status(400).json({ ok:false, error:"Estado invalido. Use CUMPLE, NO_CUMPLE o NO_APLICA" });
    }

    await pool.query("UPDATE inspeccion_detalles SET estado=? WHERE id=?", [estado, id]);
    res.json({ ok: true });
  }catch(e){
    console.error("Error actualizando detalle:", e);
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.get("/api/inspecciones/:id", async (req,res)=>{
  try{
    const id = Number(req.params.id);
    if(!id) return res.status(400).json({ ok:false, error:"ID requerido" });

    const [ins] = await pool.query(`
      SELECT i.*, c.nombre AS camarera_nombre, t.nombre AS tipo_nombre
      FROM inspecciones i
      LEFT JOIN camareras c ON c.id = i.camarera_id
      LEFT JOIN tipos_limpieza t ON t.id = i.tipo_limpieza_id
      WHERE i.id=?
    `, [id]);
    if(!ins.length) return res.status(404).json({ ok:false, error:"No encontrada" });

    const [detalles] = await pool.query(`
      Select d.id, d.item_id, d.estado, ci.nombre AS item_nombre, cc.nombre AS categoria_nombre
      FROM inspeccion_detalles d
      JOIN checklist_items ci ON ci.id = d.item_id
      JOIN checklist_categorias cc ON cc.id = ci.categoria_id
      WHERE d.inspeccion_id=?
      ORDER BY ci.orden
    `, [id]);

    res.json({ ok:true, data: { ...ins[0], detalles } });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// ===== ROOMS =====

// POST /api/habitaciones/precio-especial - Actualizar precio especial de una habitacion
app.post("/api/habitaciones/precio-especial", requireAuthIfEnabled, async (req,res)=>{
  try{
    const id = Number(req.body?.id);
    const precio_especial = req.body?.precio_especial;

    if (!id) return res.status(400).json({ ok:false, error:"ID de habitacion requerido" });

    // Si precio_especial es null o undefined, lo ponemos NULL (quitar precio especial)
    if (precio_especial === null || precio_especial === undefined || precio_especial === '') {
      await pool.query("UPDATE habitaciones SET precio_especial=NULL WHERE id=?", [id]);
    } else {
      const precio = Number(precio_especial);
      if (!Number.isFinite(precio) || precio < 0) {
        return res.status(400).json({ ok:false, error:"Precio invalido" });
      }
      await pool.query("UPDATE habitaciones SET precio_especial=? WHERE id=?", [precio, id]);
    }

    res.json({ ok:true });
  }catch(e){
    console.error("Error actualizando precio especial:", e);
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// GET /api/precios-especiales-habitacion?modulo_id=X&es_familiar=0
app.get("/api/precios-especiales-habitacion", requireAuthIfEnabled, async (req,res)=>{
  try{
    const modulo_id = String(req.query?.modulo_id || "").trim();
    if(!modulo_id) return res.status(400).json({ ok:false, error:"Falta modulo_id" });
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

    res.json({ ok:true, data: rows });
  }catch(e){
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

// POST /api/precios-especiales-habitacion/update
app.post("/api/precios-especiales-habitacion/update", requireAuthIfEnabled, async (req,res)=>{
  try{
    const habitacion_id = Number(req.body?.habitacion_id);
    const tipo_limpieza_id = Number(req.body?.tipo_limpieza_id);
    const es_familiar = req.body?.es_familiar ? 1 : 0;
    const precio = req.body?.precio;

    if (!habitacion_id || !tipo_limpieza_id) {
      return res.status(400).json({ ok:false, error:"Faltan datos" });
    }

    if (precio === null || precio === undefined || precio === '' || Number(precio) <= 0) {
      await pool.query(
        "DELETE FROM precios_especiales_habitacion WHERE habitacion_id=? AND tipo_limpieza_id=? AND es_familiar=?",
        [habitacion_id, tipo_limpieza_id, es_familiar]
      );
    } else {
      const val = Number(precio);
      if (!Number.isFinite(val) || val < 0) {
        return res.status(400).json({ ok:false, error:"Precio invalido" });
      }
      await pool.query(`
        INSERT INTO precios_especiales_habitacion (habitacion_id, tipo_limpieza_id, es_familiar, precio)
        VALUES (?,?,?,?)
        ON DUPLICATE KEY UPDATE precio=?
      `, [habitacion_id, tipo_limpieza_id, es_familiar, val, val]);
    }

    res.json({ ok:true });
  }catch(e){
    console.error("Error actualizando precio especial:", e);
    res.status(500).json({ ok:false, error: "Error interno del servidor" });
  }
});

app.get("/api/rooms", requireAuthIfEnabled, async (req,res)=>{
  try{
    const modulo_id = String(req.query?.modulo_id || "").trim();
    if(!modulo_id) return res.status(400).json({ ok:false, error:"Falta modulo_id" });

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
      e.actualizado,
      e.hora_listo_limpieza
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
  if ("hora_listo_limpieza" in p) out.hora_listo_limpieza = toMySQLDatetime(p.hora_listo_limpieza);
  // inspeccion: fin_limpieza se usa como inicio del timer de inspeccion

  out._skipEstadoUpdate = !hasEstado;
  return out;
}

async function upsertEstadoByRoomId(habitacion_id, patch){
  const p = normalizePatch(patch);

  await pool.query(`
    INSERT INTO estados_habitacion
      (habitacion_id, estado, adultos, ninos, observaciones, desde, inicio_limpieza, fin_limpieza, inicio_repaso, repaso, camarera_asignada, tipo_limpieza, decorada, inspector_asignado, prioridad_limpieza, hora_listo_limpieza)
    VALUES
      (?, ?, COALESCE(?,0), COALESCE(?,0), ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?,0), ?, ?, ?)
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
      hora_listo_limpieza = COALESCE(VALUES(hora_listo_limpieza), hora_listo_limpieza),
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
    p.hora_listo_limpieza,
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

      // INSPECCION: ADMIN o AMA_LLAVES pueden liberar (o desde el flujo de inspeccion)
      if (curEstado === "inspeccion") {
        if (role !== "ADMIN" && role !== "AMA_LLAVES" && !fromInspeccion) {
          return res.status(403).json({ ok:false, error:"Solo el Administrador o Ama de llaves puede liberar desde inspección." });
        }
      }

      if (curEstado === "limpieza" && role !== "ADMIN" && !(role === "AMA_LLAVES" && fromInspeccion)) {
        return res.status(403).json({ ok:false, error:"Solo Administrador puede liberar si está en LIMPIEZA." });
      }

      if (role === "AMA_LLAVES") {
        // ✅ AMA DE LLAVES puede liberar desde: mantenimiento, inspeccion
        const estadosPermitidos = ["mantenimiento", "inspeccion"];
        if (!estadosPermitidos.includes(curEstado)) {
          return res.status(403).json({ ok:false, error:"Ama de llaves solo puede liberar habitaciones en MANTENIMIENTO o INSPECCIÓN." });
        }
      } else if (role === "RECEPCION") {
        const allowed = new Set(["ocupado", "ocupada limpia", "mantenimiento", "lista"]);
        if (!allowed.has(curEstado)) {
          return res.status(403).json({ ok:false, error:"Recepción solo puede liberar si está OCUPADA, en MANTENIMIENTO o LISTA." });
        }
      } else if (role === "ADMIN") {
        const allowed = new Set(["ocupado", "ocupada limpia", "mantenimiento", "lista", "limpieza", "inspeccion"]);
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

    // Enviar push notifications segun el tipo de cambio
    const oldEstado = cur?.estado || "";
    const newEstado = updated?.estado || "";
    const src = String(source || "").trim().toLowerCase();

    // OCUPADO → Notificar a Admin + Ama de llaves
    if (newEstado === "ocupado") {
      sendPushToRoles(
        modulo_id + " - " + etiqueta,
        "OCUPADO - Habitacion ocupada",
        "./index.html",
        ["ADMIN", "AMA_LLAVES"]
      ).catch(() => {});
    }
    // LISTA (liberada para limpieza) → Notificar a Admin + Ama de llaves
    else if ((oldEstado === "ocupado" || oldEstado === "ocupada limpia") && newEstado === "lista") {
      sendPushToRoles(
        modulo_id + " - " + etiqueta,
        "LISTA PARA LIMPIEZA - Habitacion liberada para limpieza",
        "./index.html",
        ["ADMIN", "AMA_LLAVES"]
      ).catch(() => {});
    }
    // INSPECCION COMPLETADA (inspeccion → libre desde flujo inspeccion) → Notificar a Recepcion + Admin
    else if (oldEstado === "inspeccion" && newEstado === "libre" && src === "inspeccion") {
      sendPushToRoles(
        modulo_id + " - " + etiqueta,
        "INSPECCION COMPLETADA - Habitacion liberada",
        "./index.html",
        ["ADMIN", "RECEPCION"]
      ).catch(() => {});
    }
    // Otros cambios: notificar a todos
    else {
      sendRoomPushNotification(updated).catch(() => {});
    }

    res.json({ ok:true, data: updated });
  }catch(e){
    console.error("❌ Error en /api/room/update:", e);
    res.status(500).json({ ok:false, error: e.message || "Error interno del servidor" });
  }
});

// ===== PUSH NOTIFICATIONS =====

/** Enviar push notification solo a usuarios con ciertos roles */
async function sendPushToRoles(title, body, url, targetRoles) {
  try {
    const targets = (targetRoles || []).map(r => String(r).trim().toLowerCase());
    const roleList = targets.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT id, endpoint, auth, p256dh FROM push_subscriptions WHERE LOWER(usuario_dept) IN (${roleList})`,
      targets
    );
    if (!rows.length) return;

    const payload = JSON.stringify({ title, body, url: url || "./index.html" });

    await Promise.allSettled(rows.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } }, payload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await pool.query("DELETE FROM push_subscriptions WHERE id=?", [sub.id]);
        }
      }
    }));
  } catch (e) {
    console.warn("Error enviando push por roles:", e.message);
  }
}

/** Enviar push notification a todos los usuarios suscritos */
async function sendPushToAll(title, body, url) {
  try {
    const [rows] = await pool.query("SELECT id, endpoint, auth, p256dh FROM push_subscriptions");
    if (!rows.length) return;

    const payload = JSON.stringify({ title, body, url: url || "./index.html" });

    await Promise.allSettled(rows.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } }, payload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await pool.query("DELETE FROM push_subscriptions WHERE id=?", [sub.id]);
        }
      }
    }));
  } catch (e) {
    console.warn("Error enviando push:", e.message);
  }
}

/** Enviar push notification de cambio de estado de habitacion */
async function sendRoomPushNotification(updatedRow) {
  const { modulo_id, etiqueta, estado } = updatedRow;
  if (!modulo_id || !etiqueta || !estado) return;

  const estadoLabels = {
    "libre": "LIBRE",
    "ocupado": "OCUPADO",
    "ocupada limpia": "OCUPADA LIMPIA",
    "lista": "LISTA PARA LIMPIEZA",
    "limpieza": "EN LIMPIEZA",
    "inspeccion": "INSPECCION",
    "mantenimiento": "MANTENIMIENTO",
    "repaso": "REPASO"
  };

  const label = estadoLabels[estado] || estado.toUpperCase();
  await sendPushToAll(
    modulo_id + " - " + etiqueta,
    "Estado: " + label,
    "./index.html"
  );
}

io.on("connection", (s)=> {
  console.log("🔌 socket conectado", s.id);
});

// ===== START =====
initDB().then(()=>{
  console.log("initDB completed, starting server.listen...");
  server.listen(PORT, HOST, ()=>{
    // Detectar IP local automaticamente
    let lanIp = "127.0.0.1";
    try {
      const ifaces = os.networkInterfaces();
      Object.keys(ifaces).forEach(name => {
        (ifaces[name] || []).forEach(iface => {
          if (iface.family === "IPv4" && !iface.internal) {
            lanIp = iface.address;
          }
        });
      });
    } catch (e) {}

    console.log("-----------------------------------------");
    console.log("🚀 Backend Habitaciones listo");
    console.log(`📍 Local: http://localhost:${PORT}`);
    console.log(`🌐 LAN:   http://${lanIp}:${PORT}`);
    console.log("-----------------------------------------");
  });
}).catch(e=>{
  console.error("❌ No conectó DB:", e.message);
  process.exit(1);
});

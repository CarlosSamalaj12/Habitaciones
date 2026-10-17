const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

// MariaDB / MySQL
const DB_HOST = process.env.DB_HOST || "192.168.10.2";
const DB_USER = process.env.DB_USER || "hk_user";
const DB_PASS = process.env.DB_PASS || "";
const DB_NAME = process.env.DB_NAME || "bdinscamareria";
const DB_PORT = Number(process.env.DB_PORT || 3306);

// Monday
const MONDAY_TOKEN = process.env.MONDAY_TOKEN || "";
const MONDAY_BOARD_ID = Number(process.env.MONDAY_BOARD_ID || 0);
const MONDAY_API = "https://api.monday.com/v2";

// Auth & JWT
const JWT_SECRET = String(process.env.JWT_SECRET || "").trim();
const JWT_EXPIRES = process.env.JWT_EXPIRES || "10h";
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
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Origen no permitido por CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

// VAPID Keys (Push Notifications)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BBNU_k9XBvfFRjyb-J6o4pWRtkBjT4jIeecqU9XoNPk5-fzEhlK_wC-d0AlUr8gBoTZ2wQQ4O57mjZ8idcB5yFI";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "n5Zb8cj0nuMVkfaHs8jqC0n1i8R7uaBgn0q-K_V7g4U";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@habitaciones.local";

module.exports = {
  PORT,
  HOST,
  DB_HOST,
  DB_USER,
  DB_PASS,
  DB_NAME,
  DB_PORT,
  MONDAY_TOKEN,
  MONDAY_BOARD_ID,
  MONDAY_API,
  JWT_SECRET,
  JWT_EXPIRES,
  REQUIRE_AUTH,
  ALLOWED_ORIGINS,
  isAllowedOrigin,
  corsOptions,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT
};

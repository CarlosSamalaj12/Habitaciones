const mysql = require("mysql2/promise");
const { DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT } = require("./env");

const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  port: DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  // Evita que mysql2 convierta fechas por timezone
  dateStrings: true,
  // Guatemala (UTC-6)
  timezone: "-06:00"
});

// Forzar timezone de la sesión MySQL (clave si columnas son TIMESTAMP)
pool.on("connection", (conn) => {
  conn.query("SET time_zone = '-06:00'");
});

module.exports = pool;

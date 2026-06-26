require("dotenv").config();
const mysql = require("mysql2/promise");

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || "192.168.10.2",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASS || "",
      database: process.env.DB_NAME || "bdinscamareria",
      port: Number(process.env.DB_PORT || 3306),
    });

    const [rows] = await conn.query("SELECT NOW() AS ahora, DATABASE() AS db, USER() AS usuario");
    console.log("✅ Conexión OK:", rows[0]);

    // (opcional) ver tablas
    const [tables] = await conn.query("SHOW TABLES");
    console.log("Tablas:", tables);

    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error("❌ Falló conexión:", err.code, err.message);
    process.exit(1);
  }
})();

const mysql = require("mysql2/promise");
require("dotenv").config();

(async () => {
  try {
    const c = await mysql.createConnection({
      host: process.env.DB_HOST || "192.168.10.2",
      user: process.env.DB_USER || "hk_user",
      password: process.env.DB_PASS || "",
      database: process.env.DB_NAME || "bdinscamareria",
      port: Number(process.env.DB_PORT || 3306)
    });

    console.log("=== TABLAS EXISTENTES ===");
    const [tables] = await c.query(
      "SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME",
      [process.env.DB_NAME || "bdinscamareria"]
    );
    tables.forEach(t => console.log("  " + t.TABLE_NAME + " | ENGINE: " + t.ENGINE + " | COLLATION: " + t.TABLE_COLLATION));

    // inspeccion_detalles
    const [det] = await c.query("SHOW TABLES LIKE 'inspeccion_detalles'");
    console.log("\ninspeccion_detalles existe: " + (det.length > 0));

    // inspecciones
    try {
      const [ins] = await c.query("DESCRIBE inspecciones");
      console.log("inspecciones columnas: " + ins.length);
    } catch(e) {
      console.log("inspecciones NO existe: " + e.message);
    }

    // tipos_limpieza
    try {
      const [tl] = await c.query("SELECT COUNT(*) AS c FROM tipos_limpieza");
      console.log("tipos_limpieza registros: " + tl[0].c);
    } catch(e) {
      console.log("tipos_limpieza NO existe: " + e.message);
    }

    // checklist_categorias
    try {
      const [cc] = await c.query("SELECT COUNT(*) AS c FROM checklist_categorias");
      console.log("checklist_categorias registros: " + cc[0].c);
    } catch(e) {
      console.log("checklist_categorias NO existe: " + e.message);
    }

    // checklist_items
    try {
      const [ci] = await c.query("SELECT COUNT(*) AS c FROM checklist_items");
      console.log("checklist_items registros: " + ci[0].c);
    } catch(e) {
      console.log("checklist_items NO existe: " + e.message);
    }

    // Verificar si existen indices duplicados en inspeccion_detalles
    if (det.length > 0) {
      try {
        const [idxs] = await c.query("SHOW INDEX FROM inspeccion_detalles");
        console.log("\nindices en inspeccion_detalles:");
        idxs.forEach(i => console.log("  " + i.Key_name + " (" + i.Column_name + ") " + (i.Non_unique ? "NO UNIQUE" : "UNIQUE")));
      } catch(e) {
        console.log("Error leyendo indices: " + e.message);
      }

      // Verificar FK constraints
      try {
        const [fks] = await c.query(
          "SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'inspeccion_detalles' AND CONSTRAINT_TYPE = 'FOREIGN KEY'",
          [process.env.DB_NAME || "bdinscamareria"]
        );
        console.log("\nFKs en inspeccion_detalles:");
        fks.forEach(f => console.log("  " + f.CONSTRAINT_NAME + " -> " + f.REFERENCED_TABLE_NAME));
      } catch(e) {
        console.log("Error: " + e.message);
      }
    }

    // Verificar motores de tablas relacionadas
    console.log("\n=== MOTORES ===");
    const relatedTables = ["inspecciones", "checklist_items", "checklist_categorias", "tipos_limpieza", "habitaciones"];
    for (const tbl of relatedTables) {
      try {
        const [info] = await c.query("SHOW TABLE STATUS WHERE Name = ?", [tbl]);
        if (info.length) {
          console.log("  " + tbl + " -> ENGINE: " + info[0].Engine + ", ROWS: " + info[0].Rows);
        }
      } catch(e) {
        console.log("  " + tbl + " -> ERROR: " + e.message);
      }
    }

    await c.end();
    process.exit(0);
  } catch(e) {
    console.error("ERROR DE CONEXION: " + e.message);
    process.exit(1);
  }
})();

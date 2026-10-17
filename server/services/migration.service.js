const pool = require("../config/db");

async function runStartupMigrations() {
  console.log("initDB: starting migrations and checks...");

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
        porcentaje_factura DECIMAL(5,2) NOT NULL DEFAULT 30.00,
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
      await pool.query("INSERT INTO configuracion_pagos (porcentaje_factura, extra_factura_si, extra_factura_no) VALUES (30.00, 46.00, 36.00)");
      console.log("✅ Valores por defecto insertados en configuracion_pagos");
    } else {
      await pool.query("UPDATE configuracion_pagos SET porcentaje_factura = 30.00 WHERE porcentaje_factura = 33.00");
    }
  } catch (e) {
    console.warn("⚠️ No se pudo insertar/actualizar config por defecto:", e.message);
  }

  // Migración: agregar 'inspeccion' al ENUM de estados_habitacion.estado si no existe
  try {
    await pool.query("ALTER TABLE estados_habitacion MODIFY COLUMN estado VARCHAR(40) DEFAULT 'libre'");
    console.log("✅ Columna estado migrada a VARCHAR(40) en estados_habitacion");
  } catch (e) {
    console.warn("⚠️ No se pudo migrar columna estado:", e.message);
  }

  // Migración: migrar observaciones de estados_habitacion a TEXT para evitar Data too long
  try {
    await pool.query("ALTER TABLE estados_habitacion MODIFY COLUMN observaciones TEXT");
    console.log("✅ Columna observaciones migrada a TEXT en estados_habitacion");
  } catch (e) {
    console.warn("⚠️ No se pudo migrar columna observaciones a TEXT:", e.message);
  }

  // Migración: migrar patch_json de estados_habitacion_log a TEXT
  try {
    await pool.query("ALTER TABLE estados_habitacion_log MODIFY COLUMN patch_json TEXT");
    console.log("✅ Columna patch_json migrada a TEXT en estados_habitacion_log");
  } catch (e) {
    console.warn("⚠️ No se pudo migrar columna patch_json a TEXT:", e.message);
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
    await pool.query("ALTER TABLE precios_especiales_habitacion ADD COLUMN es_familiar TINYINT(1) DEFAULT 0 AFTER tipo_limpieza_id");
    console.log("✅ Columna es_familiar agregada a precios_especiales_habitacion");
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn("⚠️ No se pudo agregar es_familiar a precios_especiales_habitacion:", e.message);
    }
  }
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

  // Migración: eliminar tabla precios_limpieza (ya no se usa)
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

  // Migración: agregar columna usuario_dept si no existe
  try {
    await pool.query("ALTER TABLE push_subscriptions ADD COLUMN usuario_dept VARCHAR(100) DEFAULT NULL AFTER usuario_nombre");
    console.log("✅ Columna usuario_dept agregada a push_subscriptions");
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn("⚠️ No se pudo agregar usuario_dept:", e.message);
    }
  }

  // Migración: crear tabla inspecciones_camareras si no existe
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

  // Migración: agregar columnas rectificado y motivo_rectificacion a inspecciones
  try {
    await pool.query("ALTER TABLE inspecciones ADD COLUMN rectificado TINYINT(1) DEFAULT 0 AFTER es_familiar");
    console.log("✅ Columna rectificado agregada a inspecciones");
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn("⚠️ No se pudo agregar rectificado:", e.message);
    }
  }
  try {
    await pool.query("ALTER TABLE inspecciones ADD COLUMN motivo_rectificacion TEXT DEFAULT NULL AFTER rectificado");
    console.log("✅ Columna motivo_rectificacion agregada a inspecciones");
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn("⚠️ No se pudo agregar motivo_rectificacion:", e.message);
    }
  }

  // Migración: agregar columna hora_listo_limpieza a estados_habitacion
  try {
    await pool.query("ALTER TABLE estados_habitacion ADD COLUMN hora_listo_limpieza DATETIME DEFAULT NULL AFTER inicio_limpieza");
    console.log("✅ Columna hora_listo_limpieza agregada a estados_habitacion");
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn("⚠️ No se pudo agregar hora_listo_limpieza:", e.message);
    }
  }

  // Migración: agregar columna hora_listo_limpieza a inspecciones
  try {
    await pool.query("ALTER TABLE inspecciones ADD COLUMN hora_listo_limpieza DATETIME DEFAULT NULL AFTER hora_checklist");
    console.log("✅ Columna hora_listo_limpieza agregada a inspecciones");
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') {
      console.warn("⚠️ No se pudo agregar hora_listo_limpieza a inspecciones:", e.message);
    }
  }

  // Backfill: copiar hora_listo_limpieza desde estados_habitacion a inspecciones existentes donde sea NULL
  try {
    const [pending] = await pool.query(`
      SELECT COUNT(*) AS c FROM inspecciones i
      JOIN habitaciones h ON h.modulo_id = i.modulo_id AND h.etiqueta = i.habitacion_etiqueta
      JOIN estados_habitacion est ON est.habitacion_id = h.id
      WHERE i.hora_listo_limpieza IS NULL AND est.hora_listo_limpieza IS NOT NULL
    `);
    if (pending[0].c > 0) {
      await pool.query(`
        UPDATE inspecciones i
        JOIN habitaciones h ON h.modulo_id = i.modulo_id AND h.etiqueta = i.habitacion_etiqueta
        JOIN estados_habitacion est ON est.habitacion_id = h.id
        SET i.hora_listo_limpieza = est.hora_listo_limpieza
        WHERE i.hora_listo_limpieza IS NULL AND est.hora_listo_limpieza IS NOT NULL
      `);
      console.log(`✅ Backfill: ${pending[0].c} inspecciones actualizadas con hora_listo_limpieza`);
    }
  } catch (e) {
    console.warn("⚠️ No se pudo hacer backfill de hora_listo_limpieza:", e.message);
  }

  await pool.query("SELECT 1");
  console.log("✅ MariaDB conectada");
}

module.exports = {
  runStartupMigrations
};

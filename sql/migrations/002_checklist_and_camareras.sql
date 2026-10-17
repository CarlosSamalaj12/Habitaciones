-- =============================================================================
-- MIGRACION 002: Modulo de Checklist e Inspecciones Locales
-- Tablas: camareras, tipos_limpieza, checklist_categorias, checklist_items,
--         inspecciones, inspeccion_detalles
-- =============================================================================

CREATE TABLE IF NOT EXISTS camareras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL UNIQUE,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tipos_limpieza (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE,
  activo TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS checklist_categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL,
  ayuda VARCHAR(200) DEFAULT '',
  orden INT DEFAULT 0,
  activo TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS checklist_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  categoria_id INT NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  orden INT DEFAULT 0,
  activo TINYINT(1) DEFAULT 1,
  FOREIGN KEY (categoria_id) REFERENCES checklist_categorias(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inspecciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  modulo_id VARCHAR(20) NOT NULL,
  modulo_nombre VARCHAR(120) DEFAULT '',
  habitacion_etiqueta VARCHAR(20) NOT NULL,
  fecha DATE NOT NULL,
  camarera_id INT DEFAULT NULL,
  tipo_limpieza_id INT DEFAULT NULL,
  inspector_nombre VARCHAR(120) DEFAULT '',
  inspector_dept VARCHAR(80) DEFAULT '',
  inicio_limpieza DATETIME DEFAULT NULL,
  fin_limpieza DATETIME DEFAULT NULL,
  hora_checklist DATETIME DEFAULT NULL,
  observaciones TEXT DEFAULT NULL,
  es_decorada TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_modulo (modulo_id),
  KEY idx_fecha (fecha),
  KEY idx_camarera (camarera_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inspeccion_detalles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inspeccion_id INT NOT NULL,
  item_id INT NOT NULL,
  estado ENUM('CUMPLE','NO_CUMPLE','NO_APLICA') NOT NULL DEFAULT 'NO_APLICA',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inspeccion_detalle_inspeccion FOREIGN KEY (inspeccion_id) REFERENCES inspecciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_inspeccion_detalle_item FOREIGN KEY (item_id) REFERENCES checklist_items(id) ON DELETE CASCADE,
  UNIQUE KEY uq_item (inspeccion_id, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

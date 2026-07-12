-- ============================================================
-- ESQUEMA PARA GESTION LOCAL DE INSPECCIONES (sin Monday)
-- ============================================================

-- Camareras (quien limpia)
CREATE TABLE IF NOT EXISTS camareras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL UNIQUE,
  factura TINYINT(1) DEFAULT 0 COMMENT '1=factura (aplica % extra + extra grande), 0=no factura (solo extra chico)',
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insertar camareras por defecto
INSERT IGNORE INTO camareras (nombre) VALUES
  ('Carolina De La Vega'),
  ('Aracely Julajuj'),
  ('Yerly Rodriguez'),
  ('Yessica Xep'),
  ('Reyna Saminez'),
  ('Ester Baran'),
  ('Yojana Aju'),
  ('Carlos Samalaj'),
  ('Nelly Palacios'),
  ('Jennifer Raxtun'),
  ('Marilyn Lopic');

-- Configuracion de pagos (parametros editables para factura)
CREATE TABLE IF NOT EXISTS configuracion_pagos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  porcentaje_factura DECIMAL(5,2) NOT NULL DEFAULT 33.00 COMMENT '% extra si factura',
  extra_factura_si DECIMAL(10,2) NOT NULL DEFAULT 46.00 COMMENT 'Q extras si factura',
  extra_factura_no DECIMAL(10,2) NOT NULL DEFAULT 36.00 COMMENT 'Q extras si NO factura',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO configuracion_pagos (id, porcentaje_factura, extra_factura_si, extra_factura_no)
VALUES (1, 33.00, 46.00, 36.00);

-- Categorias del checklist (Baño, Habitacion)
CREATE TABLE IF NOT EXISTS checklist_categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL,
  ayuda VARCHAR(200) DEFAULT '',
  orden INT DEFAULT 0,
  activo TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO checklist_categorias (id, nombre, ayuda, orden) VALUES
  (1, 'Baño', 'Toallas y Baño', 1),
  (2, 'Habitacion', 'Muebles, camas, blancos', 2);

-- Items del checklist (evaluacion)
CREATE TABLE IF NOT EXISTS checklist_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  categoria_id INT NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  orden INT DEFAULT 0,
  activo TINYINT(1) DEFAULT 1,
  FOREIGN KEY (categoria_id) REFERENCES checklist_categorias(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO checklist_items (categoria_id, nombre, orden) VALUES
  (1, 'Alfombra Plastico Baño', 1),
  (1, 'Amenidades Baño', 2),
  (1, 'Baño', 3),
  (1, 'Toallas de Mano', 4),
  (1, 'Toallas De Pies', 5),
  (1, 'Toallas de Cuerpo', 6),
  (2, 'Ciza', 7),
  (2, 'Closet', 8),
  (2, 'Mesas', 9),
  (2, 'Camas', 10),
  (2, 'Blancos De Cama', 11),
  (2, 'Edredon y Almohadas Extra', 12),
  (2, 'TV y Control', 13),
  (2, 'Ventana y Puerta', 14),
  (2, 'Amenidades Habitacion', 15),
  (2, 'Habitacion', 16),
  (2, 'Cocineta', 17);

-- Tipos de limpieza (Salida, Estadia, etc)
CREATE TABLE IF NOT EXISTS tipos_limpieza (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE,
  activo TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO tipos_limpieza (nombre) VALUES
  ('Estadia'),
  ('Media Estadia'),
  ('Limpieza Profunda'),
  ('Cliente no Quiere Limpieza'),
  ('Salida');

-- Precios por tipo de limpieza y tipo de habitacion (familiar o normal)
CREATE TABLE IF NOT EXISTS precios_limpieza (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tipo_limpieza_id INT NOT NULL,
  es_familiar TINYINT(1) DEFAULT 0,
  precio DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  FOREIGN KEY (tipo_limpieza_id) REFERENCES tipos_limpieza(id) ON DELETE CASCADE,
  UNIQUE KEY uq_precio (tipo_limpieza_id, es_familiar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO precios_limpieza (tipo_limpieza_id, es_familiar, precio) VALUES
  (1, 0, 0.00),  -- Estadia normal
  (1, 1, 0.00),  -- Estadia familiar
  (2, 0, 0.00),  -- Media Estadia normal
  (2, 1, 0.00),  -- Media Estadia familiar
  (3, 0, 0.00),  -- Limpieza Profunda normal
  (3, 1, 0.00),  -- Limpieza Profunda familiar
  (5, 0, 0.00),  -- Salida normal
  (5, 1, 0.00);  -- Salida familiar

-- Inspecciones realizadas (encabezado)
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

-- Detalle de cada item evaluado en la inspeccion
CREATE TABLE IF NOT EXISTS inspeccion_detalles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inspeccion_id INT NOT NULL,
  item_id INT NOT NULL,
  estado ENUM('CUMPLE','NO_CUMPLE','NO_APLICA') NOT NULL DEFAULT 'NO_APLICA',
  FOREIGN KEY (inspeccion_id) REFERENCES inspecciones(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES checklist_items(id) ON DELETE CASCADE,
  UNIQUE KEY uq_item (inspeccion_id, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- MIGRACION 006: Precios Especiales por Habitacion, Familiar y Parametros Factura
-- Tablas modificadas: habitaciones, camareras, configuracion_pagos,
--                    precios_especiales_habitacion
-- =============================================================================

-- 1. Configuracion global de pagos y factura
CREATE TABLE IF NOT EXISTS configuracion_pagos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  porcentaje_factura DECIMAL(5,2) NOT NULL DEFAULT 30.00,
  extra_factura_si DECIMAL(10,2) NOT NULL DEFAULT 46.00,
  extra_factura_no DECIMAL(10,2) NOT NULL DEFAULT 36.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO configuracion_pagos (id, porcentaje_factura, extra_factura_si, extra_factura_no)
VALUES (1, 30.00, 46.00, 36.00);

-- 2. Factura en camareras
ALTER TABLE camareras ADD COLUMN factura TINYINT(1) DEFAULT 0 AFTER nombre;

-- 3. Habitaciones familiares y precios especiales
ALTER TABLE habitaciones ADD COLUMN es_familiar TINYINT(1) DEFAULT 0 AFTER etiqueta;
ALTER TABLE habitaciones ADD COLUMN precio_especial DECIMAL(10,2) DEFAULT NULL AFTER etiqueta;
ALTER TABLE habitaciones ADD UNIQUE KEY uq_mod_etiq (modulo_id, etiqueta);

-- 4. Matriz de precios especiales por habitacion + tipo_limpieza + es_familiar
CREATE TABLE IF NOT EXISTS precios_especiales_habitacion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  habitacion_id INT NOT NULL,
  tipo_limpieza_id INT NOT NULL,
  es_familiar TINYINT(1) DEFAULT 0,
  precio DECIMAL(10,2) DEFAULT NULL,
  FOREIGN KEY (habitacion_id) REFERENCES habitaciones(id) ON DELETE CASCADE,
  FOREIGN KEY (tipo_limpieza_id) REFERENCES tipos_limpieza(id) ON DELETE CASCADE,
  UNIQUE KEY uq_hab_tipo_fam (habitacion_id, tipo_limpieza_id, es_familiar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Eliminar tabla obsoleta precios_limpieza si existia
DROP TABLE IF EXISTS precios_limpieza;

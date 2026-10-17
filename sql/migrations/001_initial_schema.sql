-- =============================================================================
-- MIGRACION 001: Esquema Base Inicial
-- Tablas: modulos, habitaciones, estados_habitacion, usuarios
-- =============================================================================

CREATE TABLE IF NOT EXISTS modulos (
  id VARCHAR(20) NOT NULL PRIMARY KEY,
  descripcion VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS habitaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  modulo_id VARCHAR(20) NOT NULL,
  etiqueta VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_modulo (modulo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS estados_habitacion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  habitacion_id INT NOT NULL UNIQUE,
  estado VARCHAR(40) DEFAULT 'libre',
  desde DATETIME DEFAULT NULL,
  adultos INT DEFAULT 0,
  ninos INT DEFAULT 0,
  observaciones TEXT DEFAULT NULL,
  inicio_limpieza DATETIME DEFAULT NULL,
  fin_limpieza DATETIME DEFAULT NULL,
  inicio_repaso DATETIME DEFAULT NULL,
  repaso VARCHAR(20) DEFAULT NULL,
  estado_limpieza VARCHAR(40) DEFAULT NULL,
  obs_limpieza TEXT DEFAULT NULL,
  inspected_by VARCHAR(120) DEFAULT NULL,
  camarera_asignada VARCHAR(120) DEFAULT NULL,
  tipo_limpieza VARCHAR(80) DEFAULT NULL,
  inspector_asignado VARCHAR(120) DEFAULT NULL,
  prioridad_limpieza VARCHAR(20) DEFAULT NULL,
  decorada TINYINT(1) DEFAULT 0,
  actualizado TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (habitacion_id) REFERENCES habitaciones(id) ON DELETE CASCADE,
  KEY idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  departamento VARCHAR(100) NOT NULL,
  clave VARCHAR(255) NOT NULL,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

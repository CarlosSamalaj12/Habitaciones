-- =============================================================================
-- ESQUEMA COMPLETO DE BASE DE DATOS (HOTEL JARDINES DEL LAGO)
-- Base de datos: bdinscamareria (MySQL 5.7+ / MariaDB 10.3+)
-- Motor: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_unicode_ci
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Modulos de hotel (Pisos, edificios, villas)
CREATE TABLE IF NOT EXISTS modulos (
  id VARCHAR(20) NOT NULL PRIMARY KEY,
  descripcion VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Habitaciones por modulo
CREATE TABLE IF NOT EXISTS habitaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  modulo_id VARCHAR(20) NOT NULL,
  etiqueta VARCHAR(20) NOT NULL,
  es_familiar TINYINT(1) DEFAULT 0,
  precio_especial DECIMAL(10,2) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mod_etiq (modulo_id, etiqueta),
  KEY idx_modulo (modulo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Estado en tiempo real de cada habitacion
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
  hora_listo_limpieza DATETIME DEFAULT NULL,
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

-- 4. Registro de auditoria y trazabilidad de cambios
CREATE TABLE IF NOT EXISTS estados_habitacion_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  habitacion_id INT NULL,
  modulo_id VARCHAR(20) NULL,
  etiqueta VARCHAR(20) NULL,
  actor_id INT NULL,
  actor_name VARCHAR(120) NULL,
  actor_dept VARCHAR(120) NULL,
  source VARCHAR(40) NULL,
  evento VARCHAR(60) NOT NULL,
  estado_prev VARCHAR(40) NULL,
  estado_new VARCHAR(40) NULL,
  patch_json LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_hab (habitacion_id),
  KEY idx_mod (modulo_id),
  KEY idx_evento (evento),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Personal de camareria
CREATE TABLE IF NOT EXISTS camareras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL UNIQUE,
  factura TINYINT(1) DEFAULT 0 COMMENT '1=aplica % y extra factura, 0=aplica extra no factura',
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Tipos de limpieza
CREATE TABLE IF NOT EXISTS tipos_limpieza (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Categorias para inspeccion / checklist
CREATE TABLE IF NOT EXISTS checklist_categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL,
  ayuda VARCHAR(200) DEFAULT '',
  orden INT DEFAULT 0,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Puntos evaluados en checklist
CREATE TABLE IF NOT EXISTS checklist_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  categoria_id INT NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  orden INT DEFAULT 0,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (categoria_id) REFERENCES checklist_categorias(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. Parametros globales de calculo de pago
CREATE TABLE IF NOT EXISTS configuracion_pagos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  porcentaje_factura DECIMAL(5,2) NOT NULL DEFAULT 30.00,
  extra_factura_si DECIMAL(10,2) NOT NULL DEFAULT 46.00,
  extra_factura_no DECIMAL(10,2) NOT NULL DEFAULT 36.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. Matriz de precios especiales por habitacion, tipo de limpieza y condicion familiar
CREATE TABLE IF NOT EXISTS precios_especiales_habitacion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  habitacion_id INT NOT NULL,
  tipo_limpieza_id INT NOT NULL,
  es_familiar TINYINT(1) DEFAULT 0,
  precio DECIMAL(10,2) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (habitacion_id) REFERENCES habitaciones(id) ON DELETE CASCADE,
  FOREIGN KEY (tipo_limpieza_id) REFERENCES tipos_limpieza(id) ON DELETE CASCADE,
  UNIQUE KEY uq_hab_tipo_fam (habitacion_id, tipo_limpieza_id, es_familiar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. Encabezado de inspecciones de limpieza realizadas
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
  hora_listo_limpieza DATETIME DEFAULT NULL,
  observaciones TEXT DEFAULT NULL,
  es_decorada TINYINT(1) DEFAULT 0,
  es_familiar TINYINT(1) DEFAULT 0,
  rectificado TINYINT(1) DEFAULT 0,
  motivo_rectificacion TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (camarera_id) REFERENCES camareras(id) ON DELETE SET NULL,
  FOREIGN KEY (tipo_limpieza_id) REFERENCES tipos_limpieza(id) ON DELETE SET NULL,
  KEY idx_modulo (modulo_id),
  KEY idx_fecha (fecha),
  KEY idx_camarera (camarera_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. Relacion N:M de camareras asignadas a una inspeccion
CREATE TABLE IF NOT EXISTS inspecciones_camareras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inspeccion_id INT NOT NULL,
  camarera_id INT NOT NULL,
  FOREIGN KEY (inspeccion_id) REFERENCES inspecciones(id) ON DELETE CASCADE,
  FOREIGN KEY (camarera_id) REFERENCES camareras(id) ON DELETE CASCADE,
  UNIQUE KEY uq_inspeccion_camarera (inspeccion_id, camarera_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. Evaluacion individual de cada punto del checklist por inspeccion
CREATE TABLE IF NOT EXISTS inspeccion_detalles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inspeccion_id INT NOT NULL,
  item_id INT NOT NULL,
  estado ENUM('CUMPLE','NO_CUMPLE','NO_APLICA') NOT NULL DEFAULT 'NO_APLICA',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inspeccion_id) REFERENCES inspecciones(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES checklist_items(id) ON DELETE CASCADE,
  UNIQUE KEY uq_item (inspeccion_id, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14. Suscripciones Web Push para notificaciones
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 15. Usuarios autorizados y credenciales
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  departamento VARCHAR(100) NOT NULL,
  clave VARCHAR(255) NOT NULL,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

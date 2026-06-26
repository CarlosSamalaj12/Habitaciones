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
);

-- ============================================================
-- SCRIPT PARA REPARAR LA TABLA inspeccion_detalles
-- Ejecutar en la base de datos bdinscamareria
-- ============================================================

-- 1. Respaldar datos existentes (si los hay)
DROP TABLE IF EXISTS inspeccion_detalles_backup;
CREATE TABLE inspeccion_detalles_backup LIKE inspeccion_detalles;
INSERT INTO inspeccion_detalles_backup SELECT * FROM inspeccion_detalles;
SELECT CONCAT('Respaldados: ', COUNT(*), ' registros en inspeccion_detalles_backup') AS resultado FROM inspeccion_detalles_backup;

-- 2. Eliminar la tabla problematica
DROP TABLE IF EXISTS inspeccion_detalles;

-- 3. Recrear la tabla con las foreign keys correctas
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

SELECT '✅ Tabla inspeccion_detalles creada correctamente' AS resultado;

-- 4. Verificar la estructura
DESCRIBE inspeccion_detalles;

-- 5. Verificar los indices (uq_item debe ser compuesto, no 2 indices separados)
SHOW INDEX FROM inspeccion_detalles;

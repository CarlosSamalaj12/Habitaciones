-- ============================================================
-- NUEVA TABLA: Relation multiple camareras per inspection
-- ============================================================

-- Tabla para asociar múltiples camareras a una inspección
CREATE TABLE IF NOT EXISTS inspecciones_camareras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inspeccion_id INT NOT NULL,
  camarera_id INT NOT NULL,
  FOREIGN KEY (inspeccion_id) REFERENCES inspecciones(id) ON DELETE CASCADE,
  FOREIGN KEY (camarera_id) REFERENCES camareras(id) ON DELETE CASCADE,
  UNIQUE KEY uq_inspeccion_camarera (inspeccion_id, camarera_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migrar datos existentes: copiar camarera_id de inspecciones a la nueva tabla
-- Esto solo se ejecuta si hay datos en inspecciones y la nueva tabla está vacía
INSERT IGNORE INTO inspecciones_camareras (inspeccion_id, camarera_id)
SELECT id, camarera_id FROM inspecciones WHERE camarera_id IS NOT NULL;

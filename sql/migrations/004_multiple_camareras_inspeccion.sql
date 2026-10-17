-- =============================================================================
-- MIGRACION 004: Soporte para Multiples Camareras por Inspeccion
-- Tabla: inspecciones_camareras (N:M)
-- =============================================================================

CREATE TABLE IF NOT EXISTS inspecciones_camareras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inspeccion_id INT NOT NULL,
  camarera_id INT NOT NULL,
  FOREIGN KEY (inspeccion_id) REFERENCES inspecciones(id) ON DELETE CASCADE,
  FOREIGN KEY (camarera_id) REFERENCES camareras(id) ON DELETE CASCADE,
  UNIQUE KEY uq_inspeccion_camarera (inspeccion_id, camarera_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Backfill migrando los datos existentes
INSERT IGNORE INTO inspecciones_camareras (inspeccion_id, camarera_id)
SELECT id, camarera_id FROM inspecciones WHERE camarera_id IS NOT NULL;

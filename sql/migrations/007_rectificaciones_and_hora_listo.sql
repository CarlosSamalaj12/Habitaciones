-- =============================================================================
-- MIGRACION 007: Rectificaciones de Inspecciones y Auditoria de Hora Listo
-- Tablas modificadas: inspecciones, estados_habitacion
-- =============================================================================

-- 1. Rectificacion en inspecciones (auditoria de cambios retroactivos)
ALTER TABLE inspecciones ADD COLUMN es_familiar TINYINT(1) DEFAULT 0 AFTER es_decorada;
ALTER TABLE inspecciones ADD COLUMN rectificado TINYINT(1) DEFAULT 0 AFTER es_familiar;
ALTER TABLE inspecciones ADD COLUMN motivo_rectificacion TEXT DEFAULT NULL AFTER rectificado;

-- 2. Registro exacto de hora que recepcion marco la habitacion como "Lista para Limpieza"
ALTER TABLE estados_habitacion ADD COLUMN hora_listo_limpieza DATETIME DEFAULT NULL AFTER inicio_limpieza;
ALTER TABLE inspecciones ADD COLUMN hora_listo_limpieza DATETIME DEFAULT NULL AFTER hora_checklist;

-- 3. Backfill de hora_listo_limpieza para registros historicos pendientes
UPDATE inspecciones i
JOIN habitaciones h ON h.modulo_id = i.modulo_id AND h.etiqueta = i.habitacion_etiqueta
JOIN estados_habitacion est ON est.habitacion_id = h.id
SET i.hora_listo_limpieza = est.hora_listo_limpieza
WHERE i.hora_listo_limpieza IS NULL AND est.hora_listo_limpieza IS NOT NULL;

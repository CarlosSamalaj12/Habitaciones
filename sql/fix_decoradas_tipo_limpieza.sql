-- ============================================================
-- SCRIPT: fix_decoradas_tipo_limpieza.sql
-- 
-- Proposito: Actualizar las inspecciones decoradas viejas
-- que tienen tipo_limpieza_id = NULL, extrayendo el nombre
-- del tipo de limpieza desde el campo observaciones
-- (Ej: "Tipo de limpieza: Salida")
--
-- Ejecutar en la base de datos bdinscamareria
-- ============================================================

-- 1. Hacer backup de los registros a modificar
DROP TABLE IF EXISTS inspecciones_decoradas_backup;
CREATE TABLE inspecciones_decoradas_backup LIKE inspecciones;
INSERT INTO inspecciones_decoradas_backup
SELECT * FROM inspecciones WHERE es_decorada = 1 AND tipo_limpieza_id IS NULL;
SELECT CONCAT('Backup creado: ', COUNT(*), ' registros en inspecciones_decoradas_backup') AS resultado FROM inspecciones_decoradas_backup;

-- 2. Ver los registros que se van a actualizar
SELECT i.id, i.habitacion_etiqueta, i.observaciones, i.tipo_limpieza_id AS tipo_limpieza_id_actual,
       TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(i.observaciones, 'Tipo de limpieza: ', -1), '\n', 1)) AS nombre_extraido,
       t.id AS tipo_limpieza_id_nuevo
FROM inspecciones i
LEFT JOIN tipos_limpieza t ON TRIM(t.nombre) = TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(i.observaciones, 'Tipo de limpieza: ', -1), '\n', 1))
WHERE i.es_decorada = 1 AND i.tipo_limpieza_id IS NULL;

-- 3. Actualizar tipo_limpieza_id extrayendo el nombre del tipo de limpieza desde observaciones
UPDATE inspecciones i
JOIN tipos_limpieza t ON TRIM(t.nombre) = TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(i.observaciones, 'Tipo de limpieza: ', -1), '\n', 1))
SET i.tipo_limpieza_id = t.id
WHERE i.es_decorada = 1 AND i.tipo_limpieza_id IS NULL;

-- 4. Verificar el resultado
SELECT CONCAT('Registros actualizados: ', ROW_COUNT()) AS resultado;

-- 5. Mostrar los registros que quedaron sin actualizar (si el nombre extraido no coincide)
SELECT i.id, i.habitacion_etiqueta, i.observaciones,
       TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(i.observaciones, 'Tipo de limpieza: ', -1), '\n', 1)) AS nombre_extraido,
       'NO ENCONTRADO en tabla tipos_limpieza' AS problema
FROM inspecciones i
WHERE i.es_decorada = 1 AND i.tipo_limpieza_id IS NULL;

-- 6. Mostrar resumen final
SELECT CONCAT('Quedan ', COUNT(*), ' decoradas sin tipo_limpieza_id (revisar paso 5)') AS resumen
FROM inspecciones WHERE es_decorada = 1 AND tipo_limpieza_id IS NULL;

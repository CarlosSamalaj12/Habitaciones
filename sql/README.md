# Estructura de Scripts y Migraciones SQL

Este directorio centraliza el esquema completo de la base de datos MariaDB / MySQL y su historial de migraciones ordenadas para el sistema de **Gestión de Habitaciones (Hotel Jardines del Lago)**.

## Archivos Principales

- **`schema.sql`**: Esquema consolidado y actualizado de toda la base de datos en estado de producción (todas las 15 tablas con sus índices, foreign keys y restricciones). Útil para aprovisionar una nueva instancia desde cero.
- **`migrations/`**: Scripts incrementales secuenciales numerados para trazabilidad de cambios en entornos existentes.

## Secuencia de Migraciones

| Archivo | Descripción | Tablas / Objetos Afectados |
|---|---|---|
| `001_initial_schema.sql` | Esquema base del hotel | `modulos`, `habitaciones`, `estados_habitacion`, `usuarios` |
| `002_checklist_and_camareras.sql` | Sistema local de inspecciones y checklist | `camareras`, `tipos_limpieza`, `checklist_categorias`, `checklist_items`, `inspecciones`, `inspeccion_detalles` |
| `003_estados_habitacion_log.sql` | Bitácora de eventos y ampliación a TEXT | `estados_habitacion_log`, `estados_habitacion` |
| `004_multiple_camareras_inspeccion.sql` | Relación N:M para múltiples camareras | `inspecciones_camareras` |
| `005_push_subscriptions.sql` | Suscripciones push web de usuarios | `push_subscriptions` |
| `006_precios_especiales_and_familiar.sql` | Precios por habitación, condición familiar y factura | `configuracion_pagos`, `precios_especiales_habitacion`, `habitaciones`, `camareras` |
| `007_rectificaciones_and_hora_listo.sql` | Campos de rectificación y timestamp de recepción | `inspecciones`, `estados_habitacion` |

## Migraciones Automáticas en Servidor

El backend Node.js ejecuta chequeos idempotentes automáticos al arrancar en:
`server/services/migration.service.js` (`runStartupMigrations()`)

Esto garantiza que al desplegar con `git pull` y reiniciar PM2 en producción, cualquier columna o tabla nueva se verifique y aplique automáticamente de forma segura sin requerir intervención manual en MariaDB.

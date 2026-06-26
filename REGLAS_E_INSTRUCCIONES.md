# Reglas e Instrucciones del Sistema Habitaciones

Este documento resume las reglas actuales implementadas en frontend y backend.
La fuente de verdad final para permisos y transiciones es el backend (`server/server.js`).

## 1) Arquitectura

- Frontend principal: `index.html` + `app.js` + `styles.css`
- Backend: `server/server.js` (Node + Express + MariaDB + Socket.IO)
- Formularios relacionados:
- `Inspeccion.html`
- `Decorada.html`

## 2) Autenticacion y sesion

- El backend puede requerir JWT segun `REQUIRE_AUTH`.
- Si `REQUIRE_AUTH=1`, rutas protegidas exigen `Authorization: Bearer <token>`.
- Login:
- `POST /api/login`
- Sesion local se guarda en `hk_session_v3`.
- Auto lock por inactividad: 1 hora (`AUTOLOCK_MS`).

## 3) Roles

Normalizacion de rol (frontend y backend):

- `ADMIN`: departamento `administrador` o `admin`
- `GERENCIA`: contiene `gerencia`
- `CAMARERIA`: contiene `camar`
- Si no coincide: `RECEPCION`

Regla general:

- `GERENCIA` es solo lectura (no debe ejecutar cambios de estado).
- Backend valida permisos al actualizar estado, aunque frontend tambien filtra.

## 4) Estados de habitacion

Estados usados en el sistema:

- `libre`
- `ocupado`
- `ocupada limpia`
- `lista`
- `limpieza`
- `mantenimiento`
- `repaso`

## 5) Transiciones operativas (frontend)

### 5.1 Ocupado

- Accion: boton `OCUPADO`
- Rol permitido: `RECEPCION` y `ADMIN`
- Requiere al menos 1 adulto.

### 5.2 Lista para limpieza

- Accion: boton `LIMPIEZA` cuando la usa recepcion
- Regla: solo si estado actual es `ocupado` o `ocupada limpia`.
- Efecto: pasa a `lista`.

### 5.3 Limpieza (flujo camareria)

- Camareria desde `lista` abre `Inspeccion.html`.
- Al iniciar limpieza en inspeccion, se actualiza a `limpieza` con metadatos.

### 5.4 Mantenimiento

- Permitido para `RECEPCION`, `ADMIN` y `CAMARERIA`.
- No permitido si la habitacion esta ocupada.

### 5.5 Repaso

- Permitido para `RECEPCION` y `ADMIN`.
- Solo desde estado `libre`.

### 5.6 Liberar

- Pasa a `libre`.
- Permisos y condiciones se validan en backend (ver seccion 6).

## 6) Validaciones de backend (criticas)

Endpoint clave:

- `POST /api/room/update`

Validaciones importantes:

- Si `estado=ocupado`, `adultos >= 1`.
- No permite `mantenimiento` si estado actual es ocupado.
- Al liberar (`estado=libre`), valida rol y estado previo:
- `CAMARERIA`: solo puede liberar en `mantenimiento` (o en flujo permitido desde inspeccion).
- `RECEPCION`: puede liberar desde `ocupado`, `ocupada limpia`, `mantenimiento`, `lista`.
- `ADMIN`: puede liberar tambien desde `limpieza`.

## 7) Observaciones: cuando se limpian y cuando se conservan

Regla backend en `normalizePatch`:

- Si patch incluye `observaciones`, se usa ese valor.
- Si patch NO incluye `observaciones` y `estado=libre`, backend fuerza `observaciones=""`.
- Si patch NO incluye `observaciones` y estado no es libre, conserva observacion previa.

Casos tipicos donde se borran:

- Liberar desde app principal con `observaciones: ""` explicito.
- Liberar a `libre` desde inspeccion sin mandar observaciones.
- Liberar desde repaso a libre sin mandar observaciones.

Casos donde se conservan/acumulan:

- Cambios a `lista`, `mantenimiento`, `repaso`, `ocupado` usando `appendActionObs(...)`.

## 8) Inspeccion y estado final

En `Inspeccion.html`, al guardar y enviar a Monday:

- Si `tipoLimpieza == "estadia"` -> estado final `ocupada limpia`
- Caso contrario -> estado final `libre`
- Siempre pone `decorada: 0` en ese cierre.

## 9) Tiempo real y sincronizacion

Mecanismo principal:

- Socket.IO evento `room:update` emitido por backend despues de update.

Fallback implementado en frontend:

- Si el socket cae, se activa polling automatico (`loadRooms`) cada ~2.5s.
- Al reconectar socket, el fallback se detiene.

Esto evita tener que refrescar manualmente para ver cambios en otros dispositivos.

## 10) Endpoints principales

- `GET /api/time`
- `GET /api/modules`
- `GET /api/rooms?modulo_id=...`
- `POST /api/room/update`
- `GET /api/users`
- `POST /api/login`
- `POST /api/users/create`
- `POST /api/enviar-inspeccion`

## 11) Notas operativas

- La salud `GET /health` y `GET /api/health` responde estado del servicio, no una prueba profunda de DB en cada request.
- El backend hace chequeo DB fuerte al arranque (`SELECT 1`).
- Ante error de DB, las operaciones de escritura deben fallar con 500 y no guardan cambios.

## 12) Recomendacion de mantenimiento

- Si cambias permisos o estados, actualizar primero backend y luego frontend.
- Mantener este archivo sincronizado con `server/server.js` y `app.js` para evitar desviaciones.

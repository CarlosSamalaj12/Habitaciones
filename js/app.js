/* =============================================
   app.js - Main entry point
   Este archivo carga todos los modulos en orden
   ============================================= */

// Cargar modulos en orden de dependencias
// 1. Config basico (sin dependencias)
document.write('<script src="js/app.config.js"></script>');

// 2. Auth (depende de config)
document.write('<script src="js/app.auth.js"></script>');

// 3. API y Time (dependen de config y auth)
document.write('<script src="js/app.api.js"></script>');
document.write('<script src="js/app.time.js"></script>');

// 4. Socket (depende de api y time)
document.write('<script src="js/app.socket.js"></script>');

// 5. Data y normalize (depende de config, auth, api, time)
document.write('<script src="js/app.data.js"></script>');

// 6. Notificaciones core (depende de data y auth)
document.write('<script src="js/app.notif.core.js"></script>');

// 7. Notificaciones UI (depende de notif core)
document.write('<script src="js/app.notif.ui.js"></script>');

// 8. Auth UI - Login (depende de auth, api, notif, data, etc)
document.write('<script src="js/app.auth.ui.js"></script>');

// 9. UI Modules (depende de auth, data)
document.write('<script src="js/app.ui.modules.js"></script>');

// 10. UI Modal y Update Room (depende de auth, api, data, ui modules)
document.write('<script src="js/app.ui.modal.js"></script>');

// 11. UI Layout (depende de ui modules)
document.write('<script src="js/app.ui.layout.js"></script>');

// 12. Rooms Search y Timers (depende de data)
document.write('<script src="js/app.rooms.search.js"></script>');

// 13. Rooms Render (depende de todo lo anterior)
document.write('<script src="js/app.rooms.render.js"></script>');

// 14. Boot e Init (depende de todo)
document.write('<script src="js/app.boot.js"></script>');

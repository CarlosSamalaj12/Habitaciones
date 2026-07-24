const CACHE_NAME = "hk-cache-v1.1.8";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./app.webmanifest",
  "./Oficial_JDL_blanco.png",
  "./cronografo.png",
  "./Admin.html",
  "./EditarRegistros.html",
  "./Reportes.html",
  "./Decorada.html",
  "./Inspeccion.html",
  "./server/check_table.js"
];

// Pagina offline generada inline
function offlinePageHTML() {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexion - Habitaciones</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#070A12;color:#EAF0FF;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .card{text-align:center;padding:30px 20px;max-width:340px}
  .icon{font-size:48px;margin-bottom:16px}
  h1{font-size:20px;font-weight:800;margin:0 0 8px}
  p{font-size:14px;color:#A9B3D0;margin:0 0 20px;line-height:1.5}
  .btn{border:1px solid rgba(255,255,255,.16);background:linear-gradient(135deg,rgba(59,130,246,.28),rgba(124,58,237,.28));color:#EAF0FF;padding:12px 24px;border-radius:14px;cursor:pointer;font-weight:800;font-size:14px;box-shadow:0 12px 26px rgba(0,0,0,.35)}
</style>
</head>
<body>
<div class="card">
  <div class="icon">📡</div>
  <h1>Sin conexion</h1>
  <p>No hay conexion a internet. Revisa tu red y vuelve a intentar.</p>
  <button class="btn" onclick="location.reload()">Reintentar</button>
</div>
</body>
</html>`;
}

// Instalacion: cachear assets estaticos
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn("[SW] Error cacheando algunos assets:", err);
      });
    })
  );
  self.skipWaiting();
});

// Mensajes desde la pagina: forzar SKIP_WAITING cuando el usuario acepta la actualizacion
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Activacion: limpiar caches viejos
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Estrategia: Network First con fallback a cache
self.addEventListener("fetch", (e) => {
  // Solo interceptar GET
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // No cachear llamadas API
  if (url.pathname.includes("/api/")) {
    e.respondWith(fetch(e.request).catch(() => {
      return new Response(JSON.stringify({ ok: false, error: "offline" }), {
        headers: { "Content-Type": "application/json" }
      });
    }));
    return;
  }

  // No cachear socket.io
  if (url.pathname.includes("socket.io")) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Estrategia: Network First con fallback a cache
  e.respondWith(
    fetch(e.request).then((response) => {
      // Cachear respuestas exitosas
      if (response.ok || response.type === "opaqueredirect") {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
      }
      return response;
    }).catch(async () => {
      // Intentar servir desde cache
      const cached = await caches.match(e.request);
      if (cached) return cached;

      // Si es una navegacion (pagina HTML), mostrar pagina offline
      if (e.request.mode === "navigate") {
        return new Response(offlinePageHTML(), {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      }

      // Para imagenes, devolver un placeholder transparente
      if (e.request.destination === "image") {
        return new Response(null, { status: 204 });
      }

      return new Response("Offline", { status: 503 });
    })
  );
});

// Notificaciones Push (para cuando la app este en HTTPS)
self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch (err) {
    data = { title: "Habitaciones", body: e.data?.text() || "" };
  }

  const title = data.title || "Gestion de Habitaciones";
  const options = {
    body: data.body || "",
    icon: "./Oficial_JDL_blanco.png",
    badge: "./Oficial_JDL_blanco.png",
    vibrate: [200, 100, 200, 100, 200],
    data: { url: data.url || "./index.html" },
    requireInteraction: true
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

// Click en notificacion: abrir la app
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "./index.html";
  e.waitUntil(
    clients.matchAll({ type: "window" }).then((windowClients) => {
      const existing = windowClients.find((c) => c.url.includes(url));
      if (existing) {
        existing.focus();
      } else {
        clients.openWindow(url);
      }
    })
  );
});

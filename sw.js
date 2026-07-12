const CACHE_NAME = "hk-cache-v9";
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

  // No cachear llamadas API
  if (e.request.url.includes("/api/")) {
    e.respondWith(fetch(e.request).catch(() => {
      return new Response(JSON.stringify({ ok: false, error: "offline" }), {
        headers: { "Content-Type": "application/json" }
      });
    }));
    return;
  }

  // No cachear socket.io
  if (e.request.url.includes("socket.io")) {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Cachear respuestas exitosas
        if (response.ok || response.type === "opaqueredirect") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
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

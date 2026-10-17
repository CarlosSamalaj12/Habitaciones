// server.js - Punto de entrada modular (Node.js + Express + MariaDB + Socket.IO)
const path = require("path");
const os = require("os");
const http = require("http");
const express = require("express");
const cors = require("cors");

console.log("🔥 SERVER NUEVO MODULAR CARGADO:", __filename);

// 1. Configuracion y control de versiones
const { autoIncrementVersion } = require("./config/version");
autoIncrementVersion();

const { PORT, HOST, corsOptions } = require("./config/env");
const { initSocket } = require("./config/socket");
const { runStartupMigrations } = require("./services/migration.service");
const { errorHandler } = require("./middlewares/error.middleware");
const apiRoutes = require("./routes");

// 2. Inicializar Express y HTTP Server
const app = express();
const server = http.createServer(app);

// 3. Inicializar Socket.IO
initSocket(server);

// 4. Middlewares globales
app.use(express.json({ limit: "2mb" }));
app.use(cors(corsOptions));

// Servir archivos estaticos del frontend (index.html, app.js, styles.css, etc.)
app.use(express.static(path.join(__dirname, ".."), {
  maxAge: '7d',
  immutable: true,
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    const name = path.basename(filePath);
    if (name.endsWith('.html') || name === 'sw.js' || name === 'app.webmanifest') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// 5. Rutas API
app.get("/", (req, res) => res.send("OK. Backend Habitaciones. Usa /health o /api/modules"));
app.get("/health", (req, res) => res.json({ ok: true, service: "hk-sync", port: PORT }));
app.use("/api", apiRoutes);

// 6. Manejo global de errores
app.use(errorHandler);

// 7. Arranque del servidor tras verificar base de datos
runStartupMigrations().then(() => {
  console.log("initDB completed, starting server.listen...");
  server.listen(PORT, HOST, () => {
    let lanIp = "127.0.0.1";
    try {
      const ifaces = os.networkInterfaces();
      Object.keys(ifaces).forEach(name => {
        (ifaces[name] || []).forEach(iface => {
          if (iface.family === "IPv4" && !iface.internal) {
            lanIp = iface.address;
          }
        });
      });
    } catch (e) {}

    console.log("-----------------------------------------");
    console.log("🚀 Backend Habitaciones listo (Arquitectura Modular)");
    console.log(`📍 Local: http://localhost:${PORT}`);
    console.log(`🌐 LAN:   http://${lanIp}:${PORT}`);
    console.log("-----------------------------------------");
  });
}).catch(e => {
  console.error("❌ No conectó DB:", e.message);
  process.exit(1);
});

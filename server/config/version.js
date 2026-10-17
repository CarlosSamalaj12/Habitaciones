const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const APP_BUILD_TIME = new Date().toISOString();

function autoIncrementVersion() {
  // Solo auto-incrementar en tu máquina de desarrollo (Windows).
  // En el VPS (Linux) no se autoincrementa, así Git no detectará cambios locales en producción.
  if (process.platform !== "win32") {
    console.log("ℹ️ Entorno de producción (VPS Linux) detectado. Omitiendo auto-incremento de versión.");
    return;
  }
  const forceBump = process.env.BUMP_VERSION === "1";

  try {
    const jsonPath = path.join(__dirname, "../../version.json");
    const swPath = path.join(__dirname, "../../sw.js");
    const indexPath = path.join(__dirname, "../../index.html");
    const hashPath = path.join(__dirname, "../../.versionhash");

    const trackedFiles = [
      "../../sw.js",
      "../../app.js",
      "../../styles.css",
      "../../index.html",
      "../../app.webmanifest",
      "../../Admin.html",
      "../../EditarRegistros.html",
      "../../Reportes.html",
      "../../Inspeccion.html",
      "../../Decorada.html"
    ];

    const currentHash = crypto.createHash("sha256");
    for (const rel of trackedFiles) {
      const p = path.join(__dirname, rel);
      if (fs.existsSync(p)) {
        currentHash.update(fs.readFileSync(p));
      }
    }
    const currentHashHex = currentHash.digest("hex");

    let lastHash = "";
    if (fs.existsSync(hashPath)) {
      try { lastHash = fs.readFileSync(hashPath, "utf8").trim(); } catch {}
    }

    if (!forceBump && lastHash && lastHash === currentHashHex && fs.existsSync(jsonPath)) {
      console.log("ℹ️ Sin cambios de código desde el último bump. No se incrementa la versión.");
      return;
    }

    let major = 1;
    let minor = 3;
    let build = 6;

    if (fs.existsSync(jsonPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
        major = data.major !== undefined ? data.major : major;
        minor = data.minor !== undefined ? data.minor : minor;
        build = data.build !== undefined ? Number(data.build) + 1 : build;
      } catch (e) {
        console.warn("⚠️ Error parseando version.json, usando defaults:", e);
      }
    }

    fs.writeFileSync(jsonPath, JSON.stringify({ major, minor, build }, null, 2), "utf8");
    fs.writeFileSync(hashPath, currentHashHex, "utf8");
    const vStr = `${major}.${minor}.${build}`;
    console.log(`📦 VERSION AUTO-INCREMENTADA A: v${vStr}${forceBump ? " (forzado por BUMP_VERSION=1)" : ""}`);

    if (fs.existsSync(swPath)) {
      let swContent = fs.readFileSync(swPath, "utf8");
      swContent = swContent.replace(/const CACHE_NAME = "[^"]+";/g, `const CACHE_NAME = "hk-cache-v${vStr}";`);
      fs.writeFileSync(swPath, swContent, "utf8");
      console.log(`✅ sw.js actualizado con CACHE_NAME "hk-cache-v${vStr}"`);
    }

    if (fs.existsSync(indexPath)) {
      let indexContent = fs.readFileSync(indexPath, "utf8");
      indexContent = indexContent.replace(/app\.js\?v=[a-zA-Z0-9\._-]+/g, `app.js?v=${vStr}`);
      indexContent = indexContent.replace(/styles\.css\?v=[a-zA-Z0-9\._-]+/g, `styles.css?v=${vStr}`);
      indexContent = indexContent.replace(/v[0-9]+\.[0-9]+\.[0-9]+ \| Created By - Carlos S/g, `v${vStr} | Created By - Carlos S`);
      fs.writeFileSync(indexPath, indexContent, "utf8");
      console.log(`✅ index.html actualizado con versión "v${vStr}"`);
    }

    const appPath = path.join(__dirname, "../../app.js");
    if (fs.existsSync(appPath)) {
      let appContent = fs.readFileSync(appPath, "utf8");
      appContent = appContent.replace(/window\.APP_VERSION = "[^"]+";/g, `window.APP_VERSION = "${vStr}";`);
      fs.writeFileSync(appPath, appContent, "utf8");
      console.log(`✅ app.js actualizado con window.APP_VERSION "${vStr}"`);
    }
  } catch (err) {
    console.error("❌ Error en auto-incremento de versiones:", err);
  }
}

function getAppVersion() {
  let version = "1.0.0";
  try {
    const verData = JSON.parse(fs.readFileSync(path.join(__dirname, "../../version.json"), "utf8"));
    version = `${verData.major}.${verData.minor}.${verData.build}`;
  } catch (err) {}
  return { version, buildTime: APP_BUILD_TIME };
}

module.exports = {
  autoIncrementVersion,
  getAppVersion,
  APP_BUILD_TIME
};

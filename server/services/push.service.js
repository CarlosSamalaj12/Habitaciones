const webpush = require("web-push");
const pool = require("../config/db");
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = require("../config/env");
const { normalizeRole } = require("../middlewares/auth.middleware");

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

/** Enviar push notification a todos los usuarios suscritos */
async function sendPushToAll(title, body, url) {
  try {
    console.log(`-> [PUSH ALL] Iniciando envío de push. Título: "${title}", Cuerpo: "${body}"`);
    const [rows] = await pool.query("SELECT id, endpoint, auth, p256dh FROM push_subscriptions");
    console.log(`-> [PUSH ALL] Suscripciones totales encontradas en BD: ${rows.length}`);
    if (!rows.length) return;

    const payload = JSON.stringify({ title, body, url: url || "./index.html" });

    await Promise.allSettled(rows.map(async (sub) => {
      try {
        console.log(`   - Enviando push a ID ${sub.id}...`);
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } }, payload);
        console.log(`   - Push enviada con éxito a ID ${sub.id}`);
      } catch (err) {
        console.warn(`   - Error enviando a ID ${sub.id}:`, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`   - Eliminando suscripción inválida/vencida ID ${sub.id}`);
          await pool.query("DELETE FROM push_subscriptions WHERE id=?", [sub.id]);
        }
      }
    }));
  } catch (e) {
    console.warn("Error enviando push:", e.message);
  }
}

/** Enviar push notification solo a usuarios con ciertos roles */
async function sendPushToRoles(title, body, url, targetRoles) {
  try {
    const targets = (targetRoles || []).map(r => String(r).trim().toUpperCase());
    console.log("-> [PUSH] Enviando push por roles. Destinos permitidos:", targets);

    const [rows] = await pool.query(
      `SELECT id, endpoint, auth, p256dh, usuario_dept FROM push_subscriptions`
    );
    console.log(`-> [PUSH] Suscripciones totales encontradas en BD: ${rows.length}`);

    const filteredRows = rows.filter(sub => {
      const normalized = normalizeRole(sub.usuario_dept);
      console.log(`   - Suscripción ID ${sub.id}: departamento crudo "${sub.usuario_dept}" -> rol normalizado "${normalized}"`);
      return targets.includes(normalized);
    });

    console.log(`-> [PUSH] Suscripciones filtradas que recibirán la push: ${filteredRows.length}`);
    if (!filteredRows.length) return;

    const payload = JSON.stringify({ title, body, url: url || "./index.html" });

    await Promise.allSettled(filteredRows.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } }, payload);
        console.log(`-> [PUSH] Push enviada con éxito a suscripción ID ${sub.id}`);
      } catch (err) {
        console.warn(`-> [PUSH] Error enviando a suscripción ID ${sub.id}:`, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`-> [PUSH] Eliminando suscripción inactiva ID ${sub.id}`);
          await pool.query("DELETE FROM push_subscriptions WHERE id=?", [sub.id]);
        }
      }
    }));
  } catch (e) {
    console.warn("Error enviando push por roles:", e.message);
  }
}

/** Enviar push notification de cambio de estado de habitacion */
async function sendRoomPushNotification(updatedRow) {
  const { modulo_id, etiqueta, estado } = updatedRow;
  if (!modulo_id || !etiqueta || !estado) return;

  const estadoLabels = {
    "libre": "LIBRE",
    "ocupado": "OCUPADO",
    "ocupada limpia": "OCUPADA LIMPIA",
    "lista": "LISTA PARA LIMPIEZA",
    "limpieza": "EN LIMPIEZA",
    "inspeccion": "INSPECCION",
    "mantenimiento": "MANTENIMIENTO",
    "repaso": "REPASO"
  };

  const label = estadoLabels[estado] || estado.toUpperCase();
  await sendPushToAll(
    modulo_id + " - " + etiqueta,
    "Estado: " + label,
    "./index.html"
  );
}

module.exports = {
  sendPushToAll,
  sendPushToRoles,
  sendRoomPushNotification
};

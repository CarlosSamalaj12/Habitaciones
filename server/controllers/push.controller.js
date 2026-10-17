const pool = require("../config/db");
const { VAPID_PUBLIC_KEY } = require("../config/env");

function getVapidKey(req, res) {
  res.json({ ok: true, publicKey: VAPID_PUBLIC_KEY });
}

async function subscribe(req, res) {
  try {
    const { usuario_nombre, usuario_dept, subscription } = req.body;
    if (!usuario_nombre || !subscription?.endpoint || !subscription?.keys?.auth || !subscription?.keys?.p256dh) {
      return res.status(400).json({ ok: false, error: "Faltan datos de suscripcion" });
    }

    // Eliminar suscripcion anterior por si cambio
    await pool.query("DELETE FROM push_subscriptions WHERE endpoint=?", [subscription.endpoint]);

    await pool.query(
      "INSERT INTO push_subscriptions (usuario_nombre, usuario_dept, endpoint, auth, p256dh, user_agent) VALUES (?,?,?,?,?,?)",
      [usuario_nombre, usuario_dept || null, subscription.endpoint, subscription.keys.auth, subscription.keys.p256dh, req.headers['user-agent'] || null]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("Error guardando suscripcion push:", e);
    res.status(500).json({ ok: false, error: "Error interno" });
  }
}

async function unsubscribe(req, res) {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ ok: false, error: "Falta endpoint" });
    await pool.query("DELETE FROM push_subscriptions WHERE endpoint=?", [endpoint]);
    res.json({ ok: true });
  } catch (e) {
    console.error("Error eliminando suscripcion:", e);
    res.status(500).json({ ok: false, error: "Error interno" });
  }
}

module.exports = {
  getVapidKey,
  subscribe,
  unsubscribe
};

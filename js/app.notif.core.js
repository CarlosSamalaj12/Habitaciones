/* =========================
   TOAST
========================= */
function toast(type, title, msg) {
  const stack = $("toastStack");
  const item = document.createElement("div");
  item.className = `toastItem ${type}`;
  item.innerHTML = `
    <div class="toastIcon">${type === "ok" ? "OK" : type === "warn" ? "!" : "X"}</div>
    <div>
      <div class="toastTitle">${title}</div>
      <div class="toastMsg">${msg}</div>
    </div>
  `;
  stack.appendChild(item);
  setTimeout(() => { item.style.opacity = "0"; item.style.transform = "translateY(-6px)"; }, 3200);
  setTimeout(() => item.remove(), 3600);
}

/* =========================
   PWA INSTALL PROMPT
========================= */
let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = $("btnInstall");
  if (btn) btn.classList.remove("hidden");
});

$("btnInstall")?.addEventListener("click", async () => {
  if (!deferredPrompt) {
    toast("ok", "Ya instalada", "La app ya esta instalada en tu dispositivo.");
    return;
  }
  deferredPrompt.prompt();
  const result = await deferredPrompt.userChoice;
  if (result.outcome === "accepted") {
    toast("ok", "Instalada", "App agregada a tu pantalla de inicio.");
    const btn = $("btnInstall");
    if (btn) btn.classList.add("hidden");
  }
  deferredPrompt = null;
});

if (window.matchMedia("(display-mode: standalone)").matches) {
  const btn = $("btnInstall");
  if (btn) btn.classList.add("hidden");
}

if (window.navigator.standalone === true) {
  const btn = $("btnInstall");
  if (btn) btn.classList.add("hidden");
}

/* =========================
   NOTIFICACIONES (Desktop + Push)
========================= */
let notifPermission = "Notification" in window ? Notification.permission : "denied";
let pushSubscription = null;
let audioCtx = null;
let notifAudioUnlocked = false;

/** Desuscribir push (al hacer logout/bloquear) */
function unsubscribeFromPush() {
  if (!pushSubscription) return;
  const endpoint = pushSubscription.endpoint;
  fetch(API_BASE + "/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint })
  }).catch(() => {});
  pushSubscription.unsubscribe().catch(() => {});
  pushSubscription = null;
}

function showRoomNotification(title, body, tag) {
  if (!("Notification" in window && notifPermission === "granted")) return;
  playNotificationSound();
  try {
    const n = new Notification(title, {
      body: body,
      icon: "./Oficial_JDL_blanco.png",
      badge: "./Oficial_JDL_blanco.png",
      tag: tag || "room-update",
      silent: false
    });
    setTimeout(function() { n.close(); }, 5000);
  } catch(e) {
    console.warn("Notificacion fallo:", e);
  }
}

function unlockNotifAudio() {
  if (notifAudioUnlocked) return;
  try {
    if (typeof AudioContext !== "undefined" || typeof webkitAudioContext !== "undefined") {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      notifAudioUnlocked = true;
    }
  } catch (e) {}
}

["click", "touchstart", "keydown"].forEach(ev => {
  document.addEventListener(ev, unlockNotifAudio, { once: true });
});

function playNotificationSound() {
  try {
    if (!audioCtx || audioCtx.state !== "running") return;
    [800, 1000].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.start(audioCtx.currentTime + i * 0.15);
      osc.stop(audioCtx.currentTime + i * 0.15 + 0.25);
    });
  } catch (e) {}
}

async function requestNotifPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") return;
  if (Notification.permission === "denied") return;
  const perm = await Notification.requestPermission();
  notifPermission = perm;
  if (perm === "granted") {
    await subscribePush();
  }
}

async function subscribePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array("BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U")
    });
    pushSubscription = sub;
    const json = sub.toJSON();
    await apiPOST("/api/push/subscribe", {
      endpoint: json.endpoint,
      keys: json.keys
    });
  } catch (e) {
    console.warn("Push subscribe failed:", e);
  }
}

function urlBase64ToUint8Array(base64) {
  const pad = base64.length % 4;
  if (pad) base64 += "=".repeat(4 - pad);
  const raw = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function showNotification(etiqueta, estado) {
  if (notifPermission !== "granted") return;
  if (document.hasFocus()) return;
  playNotificationSound();
  try {
    const title = `Hab ${etiqueta}`;
    const body = ESTADO_LABELS[estado] || estado;
    const n = new Notification(title, {
      body,
      icon: "./icon-192x192.png?v=1",
      badge: "./icon-192x192.png?v=1",
      tag: `room-${etiqueta}`,
      silent: false
    });
    setTimeout(function() { n.close(); }, 5000);
  } catch(e) {
    console.warn("Notificacion fallo:", e);
  }
}

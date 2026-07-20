/* =========================
   CONFIG
========================= */
window.APP_BASE = window.location.pathname
  .replace(/\/[^/]*$/, "/")
  .replace(/\/+$/, "");
window.API_BASE = `${window.location.origin}${APP_BASE}`;
window.LS_SESSION = "hk_session_v3";
window.LS_LAST_ACTIVITY = "hk_last_activity_ms";
window.LS_FORCE_LOGIN = "hk_force_login";
window.LS_ACTOR_CACHE = "hk_actor_cache_v1";
window.LS_LEGACY_USER_NAME = "hk_logged_user_name";
window.LS_LEGACY_USER_DEPT = "hk_logged_user_dept";
window.AUTOLOCK_MS = 60 * 60 * 1000;
window.TIME_OFFSET_MS = 0;

/* =========================
   HELPERS
========================= */
const $ = (id) => document.getElementById(id);

/* =========================
   DATE / TIME UTILITIES
========================= */
function nowLocalMySQL() {
  return new Date().toISOString();
}

function parseAnyDate(value){
  if(!value) return null;
  if (value instanceof Date) return value;
  const s = String(value).trim();
  if(!s) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    const [datePart, timePart] = s.split(" ");
    const [Y,M,D] = datePart.split("-").map(Number);
    const [h,m,sec] = timePart.split(":").map(Number);
    return new Date(Date.UTC(Y, M-1, D, h + 6, m, sec));
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function msSince(value){
  const d = parseAnyDate(value);
  if(!d) return 0;
  return Math.max(0, nowServerMs() - d.getTime());
}

function fmtDur(ms) {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}h ${String(mm).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`;
  return `${mm}m ${String(ss).padStart(2, "0")}s`;
}

/* =========================
   ACTIVITY TRACKING
========================= */
let _lastActivityWrite = 0;
function setActivity() {
  const now = Date.now();
  if (now - _lastActivityWrite < 10000) return;
  _lastActivityWrite = now;
  localStorage.setItem(LS_LAST_ACTIVITY, String(now));
}
["click", "keydown", "touchstart"].forEach(ev => {
  window.addEventListener(ev, () => setActivity(), { passive: true });
});
/* =========================
   SESSION MANAGEMENT
========================= */
function getSession() {
  try { return JSON.parse(localStorage.getItem(LS_SESSION) || "null"); }
  catch { return null; }
}
function setSession(sess) {
  localStorage.setItem(LS_SESSION, JSON.stringify(sess));
  if (sess?.name) {
    localStorage.setItem(LS_ACTOR_CACHE, JSON.stringify({
      id: sess.id || null,
      name: sess.name,
      dept: sess.dept || ""
    }));
    localStorage.setItem(LS_LEGACY_USER_NAME, sess.name);
    localStorage.setItem(LS_LEGACY_USER_DEPT, sess.dept || "");
  }
}
function clearSession() {
  localStorage.removeItem(LS_SESSION);
  localStorage.removeItem(LS_LAST_ACTIVITY);
  localStorage.removeItem(LS_ACTOR_CACHE);
  localStorage.removeItem(LS_LEGACY_USER_NAME);
  localStorage.removeItem(LS_LEGACY_USER_DEPT);
}
function normalizeDept(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/* =========================
   ROLES & PERMISSIONS
========================= */
function roleOf(sess) {
  const d = normalizeDept(sess?.dept);
  if (d === "administrador" || d === "admin") return "ADMIN";
  if (d.includes("gerencia")) return "GERENCIA";
  if (d.includes("reportes")) return "REPORTES";
  if (d.includes("ama") || d.includes("camar")) return "AMA_LLAVES";
  return "RECEPCION";
}
function canReception(role) {
  return role === "RECEPCION" || role === "ADMIN";
}
function canUseMantenimiento(role) {
  return canReception(role) || role === "AMA_LLAVES";
}
function canUseLiberar(role) {
  return canReception(role) || role === "AMA_LLAVES";
}
function canUseDecorada(role) {
  return role === "AMA_LLAVES" || role === "ADMIN";
}
function canViewReports(role) {
  return role === "ADMIN" || role === "GERENCIA" || role === "REPORTES";
}
function isAdmin(role) {
  return role === "ADMIN";
}
function isLocked() {
  const sess = getSession();
  if (!sess) return true;
  const last = Number(localStorage.getItem(LS_LAST_ACTIVITY) || "0");
  if (last && (Date.now() - last) > AUTOLOCK_MS) return true;
  return false;
}

/* =========================
   UI UPDATES
========================= */
function updateDecoradaUI() {
  const btn = $("btnDecorada");
  if (!btn) return;
  const sess = getSession();
  const role = roleOf(sess);
  if (sess?.name && canUseDecorada(role)) btn.classList.remove("hidden");
  else btn.classList.add("hidden");
}

function renderActiveUser() {
  const el = $("activeUserLabel");
  if (!el) return;
  const sess = getSession();
  if (!sess?.name) {
    el.textContent = "Usuario: -";
    updateAdminUI();
    updateDecoradaUI();
    return;
  }
  el.textContent = `Usuario: ${sess.name}${sess.dept ? " - " + sess.dept : ""}`;
  updateAdminUI();
  updateDecoradaUI();
}

function openAdminPanel() {
  if (isLocked()) { showLogin(); return; }
  const role = roleOf(getSession());
  if (!isAdmin(role)) {
    toast("err", "Restringido", "Solo administrador puede acceder.");
    return;
  }
  window.location.href = "./Admin.html";
}

function openReportes() {
  if (isLocked()) { showLogin(); return; }
  window.location.href = "./Reportes.html";
}

function openEditarRegistros() {
  if (isLocked()) { showLogin(); return; }
  window.location.href = "./EditarRegistros.html";
}

function updateAdminUI() {
  const btnAdmin = $("btnAdmin");
  const btnReportes = $("btnReportes");
  const btnEditarReg = $("btnEditarReg");
  const sess = getSession();
  const role = roleOf(sess);
  const visible = sess?.name && isAdmin(role);
  if (btnAdmin) {
    if (visible) btnAdmin.classList.remove("hidden");
    else btnAdmin.classList.add("hidden");
  }
  if (btnReportes) {
    if (sess?.name && canViewReports(role)) btnReportes.classList.remove("hidden");
    else btnReportes.classList.add("hidden");
  }
  if (btnEditarReg) {
    if (sess?.name && canViewReports(role)) btnEditarReg.classList.remove("hidden");
    else btnEditarReg.classList.add("hidden");
  }
}

$("btnAdmin")?.addEventListener("click", openAdminPanel);
$("btnReportes")?.addEventListener("click", openReportes);
$("btnEditarReg")?.addEventListener("click", openEditarRegistros);
/* =========================
   API HELPERS
========================= */
function requireOnline() {
  if (!navigator.onLine) {
    toast("err", "Sin conexion", "No hay conexion a internet. Verifica tu senal y vuelve a intentar.");
    return false;
  }
  return true;
}

async function apiGET(path) {
  if (!navigator.onLine) throw new Error("Sin conexion a internet. Verifica tu senal.");
  const r = await fetch(`${API_BASE}${path}`, { method: "GET" });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error(j?.error || `GET ${path} failed`);
  if (j.ok === false) throw new Error(j.error || `GET ${path} failed`);
  return j;
}

async function apiPOST(path, body) {
  if (!navigator.onLine) throw new Error("Sin conexion a internet. Verifica tu senal.");
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error(j?.error || `POST ${path} failed`);
  if (j.ok === false) throw new Error(j.error || `POST ${path} failed`);
  return j;
}

/* =========================
   ACTOR / AUDIT
========================= */
function getActor() {
  const sess = getSession();
  if (sess?.name) return { id: sess.id || null, name: sess.name, dept: sess.dept || "" };
  try {
    const cached = JSON.parse(localStorage.getItem(LS_ACTOR_CACHE) || "null");
    if (cached?.name) return cached;
  } catch {}
  try {
    const name = String(localStorage.getItem(LS_LEGACY_USER_NAME) || "").trim();
    const dept = String(localStorage.getItem(LS_LEGACY_USER_DEPT) || "").trim();
    if (name) return { id: null, name, dept };
  } catch {}
  return null;
}

function actorDisplay() {
  const a = getActor();
  if (!a?.name) return "Sistema";
  return a.dept ? `${a.name} - ${a.dept}` : a.name;
}

const FMT_STAMP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Guatemala",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: false
});

function appendActionObs(prev, action) {
  const parts = FMT_STAMP.formatToParts(new Date());
  const get = (type) => parts.find(p => p.type === type)?.value || "00";
  const stamp = `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
  const line = `[${stamp}] ${action} por ${actorDisplay()}`;
  const base = String(prev || "").trim();
  return base ? `${base}\n${line}` : line;
}
/* =========================
   TIME SYNC
========================= */
function nowServerMs() {
  return Date.now() + TIME_OFFSET_MS;
}

async function syncServerTime() {
  try {
    const r = await fetch(`${API_BASE}/api/time`, { method: "GET", cache: "no-store" });
    const j = await r.json().catch(() => null);
    const serverMs = Number(j?.serverMs);
    if (Number.isFinite(serverMs)) {
      TIME_OFFSET_MS = serverMs - Date.now();
    }
  } catch (e) {
    // no bloquear la app si falla el sync
  }
}
/* =========================
   SOCKET (tiempo real)
========================= */
let socket = null;
let fallbackSyncTimer = null;

function startFallbackSync(intervalMs = 4000) {
  if (fallbackSyncTimer) return;
  fallbackSyncTimer = setInterval(async () => {
    try {
      if (!activeModuleId) return;
      if (isLoginVisible()) return;
      if (socket?.connected) return;
      const resp = await apiGET(`/api/rooms?modulo_id=${encodeURIComponent(String(activeModuleId))}`);
      if (socket?.connected) return;
      const rows = (resp.data || []).map(normalizeRoom);
      roomsCache.set(String(activeModuleId), rows);
      scheduleRenderRooms();
      updateSummaryCounts();
    } catch {}
  }, intervalMs);
}

function stopFallbackSync() {
  if (!fallbackSyncTimer) return;
  clearInterval(fallbackSyncTimer);
  fallbackSyncTimer = null;
}

function initSocket() {
  const ioUrl = API_BASE.replace(/^http/, "ws");
  try {
    socket = new window.io(ioUrl, {
      transports: ["websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
  } catch (e) {
    console.warn("Socket.io no disponible:", e);
    startFallbackSync();
    return;
  }

  socket.on("connect", () => {
    stopFallbackSync();
    if (activeModuleId) {
      socket.emit("join", { modulo_id: String(activeModuleId) });
    }
  });

  socket.on("disconnect", () => {
    startFallbackSync();
  });

  socket.on("room_update", (data) => {
    if (!data || !data.modulo_id) return;
    if (String(data.modulo_id) !== String(activeModuleId)) return;
    const updated = normalizeRoom(data);
    const arr = roomsCache.get(String(data.modulo_id));
    if (!arr) return;
    const idx = arr.findIndex(x => String(x.etiqueta).toUpperCase() === String(updated.etiqueta).toUpperCase());
    if (idx >= 0) {
      const oldEstado = arr[idx].estado;
      const newEstado = updated.estado;
      arr[idx] = updated;
      addRecentNotification(data.modulo_id, updated.etiqueta, oldEstado, newEstado);
      renderRooms();
      updateSummaryCounts();
    } else {
      arr.push(updated);
      renderRooms();
      updateSummaryCounts();
    }
  });

  socket.on("connect_error", () => {
    startFallbackSync();
  });
}
/* =========================
   DATA (desde BD)
========================= */
let MODULES = [];
let activeModuleId = null;

const roomsCache = new Map();
let renderRoomsQueued = false;

function scheduleRenderRooms() {
  if (renderRoomsQueued) return;
  renderRoomsQueued = true;

  const flush = () => {
    renderRoomsQueued = false;
    renderRooms();
  };

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(flush);
  } else {
    setTimeout(flush, 16);
  }
}

function roomKey(modulo_id, etiqueta) {
  return `${String(modulo_id)}::${String(etiqueta).toUpperCase()}`;
}

/* =========================
   ROOM NORMALIZATION
========================= */
const ESTADO_LABELS = {
  "libre": "LIBRE",
  "ocupado": "OCUPADO",
  "ocupada limpia": "OCUPADA LIMPIA",
  "lista": "LISTA PARA LIMPIEZA",
  "limpieza": "EN LIMPIEZA",
  "inspeccion": "INSPECCION",
  "mantenimiento": "MANTENIMIENTO",
  "repaso": "REPASO"
};

function normalizeRoom(r) {
  return {
    id: r.id,
    modulo_id: String(r.modulo_id ?? r.modulo ?? ""),
    etiqueta: String(r.etiqueta ?? r.num ?? ""),
    estado: String(r.estado ?? "libre"),
    desde: r.desde || null,
    adultos: Number(r.adultos ?? 0),
    ninos: Number(r.ninos ?? 0),
    obs: r.observaciones || r.obs || "",
    observaciones: r.observaciones || r.obs || "",
    inicio_limpieza: r.inicio_limpieza || null,
    fin_limpieza: r.fin_limpieza || null,
    inicio_repaso: r.inicio_repaso || null,
   fin_repaso: r.fin_repaso || null,
    estado_limpieza: r.estado_limpieza || null,
    obs_limpieza: r.obs_limpieza || "",
    inspected_by: r.inspected_by || null,
    camarera_asignada: r.camarera_asignada || null,
    tipo_limpieza: r.tipo_limpieza || null,
    inspector_asignado: r.inspector_asignado || null,
    ts_mod: r.ts_mod || null
  };
}

function applyRoomUpdate(updatedRow) {
  const updated = normalizeRoom(updatedRow);
  const modId = String(updated.modulo_id);

  const arr = roomsCache.get(modId);
  if (arr) {
    const idx = arr.findIndex(x => String(x.etiqueta).toUpperCase() === String(updated.etiqueta).toUpperCase());
    if (idx >= 0) {
      const oldEstado = arr[idx].estado;
      const newEstado = updated.estado;
      arr[idx] = updated;
      if (oldEstado !== newEstado) {
        addRecentNotification(modId, updated.etiqueta, oldEstado, newEstado);
      }
      scheduleRenderRooms();
      updateSummaryCounts();
      showNotification(updated.etiqueta, newEstado);
      return;
    }
  }
  if (!roomsCache.has(modId)) {
    roomsCache.set(modId, []);
  }
  roomsCache.get(modId).push(updated);
  scheduleRenderRooms();
  updateSummaryCounts();
}

/* =========================
   UPDATE ROOM (DB)
========================= */
async function updateRoom(modulo_id, etiqueta, patch, source = "app") {
  const resp = await apiPOST("/api/room/update", { modulo_id, etiqueta, patch, actor: getActor(), source });
  applyRoomUpdate(resp.data);
  return resp.data;
}
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
/* =========================
   PANEL DE NOTIFICACIONES RECIENTES (UI)
========================= */
let notifPanelOpen = false;

function renderNotifPanel() {
  const body = $("notifPanelBody");
  const panel = $("notifPanel");
  if (!body || !panel) return;

  if (!recentNotifications.length) {
    body.innerHTML = '<div class="notifEmpty">Sin cambios recientes</div>';
    return;
  }

  const estadoIconMap = {
    "ocupado": "ðŸ”´",
    "ocupada limpia": "ðŸ”´",
    "lista": "ðŸŸ¡",
    "limpieza": "ðŸ”µ",
    "inspeccion": "ðŸŸ¢",
    "libre": "ðŸŸ¢",
    "mantenimiento": "ðŸŸ£",
    "repaso": "ðŸŸ¤"
  };

  let html = "";
  recentNotifications.forEach(n => {
    const icon = estadoIconMap[n.newEstado] || "ðŸ””";
    const changeDir = n.oldEstado !== n.newEstado
      ? `<span style="color:var(--muted);font-size:10px">${n.oldLabel} â†’ </span><span style="font-weight:700">${n.newLabel}</span>`
      : `<span style="font-weight:700">${n.newLabel}</span>`;

    html += `<div class="notifItem" data-notif-id="${n.id}">
      <div class="notifItemIcon ${n.newEstado}">${icon}</div>
      <div class="notifItemContent">
        <div class="notifItemRoom">${n.modulo} - ${n.etiqueta}</div>
        <div class="notifItemChange">${changeDir}</div>
        <div class="notifItemTime">${n.time}</div>
      </div>
      <button class="notifItemClose" data-notif-close="${n.id}" title="Descartar">X</button>
    </div>`;
  });

  body.innerHTML = html;

  body.querySelectorAll("[data-notif-close]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.notifClose;
      const idx = recentNotifications.findIndex(n => n.id === id);
      if (idx >= 0) recentNotifications.splice(idx, 1);
      renderNotifPanel();
      updateBellDot();
    });
  });
}

$("btnNotifBell")?.addEventListener("click", () => {
  notifPanelOpen = !notifPanelOpen;
  const panel = $("notifPanel");
  if (!panel) return;
  if (notifPanelOpen) {
    panel.classList.remove("hidden");
    renderNotifPanel();
    updateBellDot();
  } else {
    panel.classList.add("hidden");
  }
});

$("notifPanelClose")?.addEventListener("click", () => {
  notifPanelOpen = false;
  const panel = $("notifPanel");
  if (panel) panel.classList.add("hidden");
  updateBellDot();
});

document.addEventListener("click", (e) => {
  if (!notifPanelOpen) return;
  const panel = $("notifPanel");
  const bell = $("btnNotifBell");
  if (!panel || !bell) return;
  if (!panel.contains(e.target) && !bell.contains(e.target)) {
    notifPanelOpen = false;
    panel.classList.add("hidden");
    updateBellDot();
  }
});
/* =========================
   LOGIN (BD)
========================= */
function showLogin() {
  const overlay = $("loginOverlay");
  if (!overlay) return;
  if (!overlay.classList.contains("hidden")) {
    return;
  }
  overlay.classList.remove("hidden");
  $("loginErr").classList.add("hidden");
  $("loginPass").value = "";
  localStorage.setItem(LS_FORCE_LOGIN, "1");
  loadLoginUsers();
  $("loginUser").focus();
}

function hideLogin() {
  $("loginOverlay").classList.add("hidden");
  localStorage.removeItem(LS_FORCE_LOGIN);
}

function isLoginVisible() {
  const overlay = $("loginOverlay");
  return !!overlay && !overlay.classList.contains("hidden");
}

let LOGIN_USERS_LOADING = false;

async function loadLoginUsers(){
  if (LOGIN_USERS_LOADING) return;
  LOGIN_USERS_LOADING = true;
  try{
    const sel = $("loginUser");
    const btn = $("btnLogin");
    sel.disabled = true;
    sel.innerHTML = `<option value="">Cargando usuarios...</option>`;
    if (btn) btn.disabled = true;

    const resp = await apiGET("/api/users");
    const raw = Array.isArray(resp?.data) ? resp.data : (Array.isArray(resp) ? resp : []);
    const users = raw.map(u => ({
      name: String(u?.nombre || u?.name || ""),
      dept: String(u?.departamento || u?.dept || "")
    }));

    sel.innerHTML = `<option value="">Seleccionar...</option>`;
    if (!users.length) {
      sel.innerHTML = `<option value="">Sin usuarios</option>`;
      toast("err", "Error", "No hay usuarios disponibles");
      return;
    }

    users.forEach(u => {
      if (!u.name) return;
      const opt = document.createElement("option");
      opt.value = u.name;
      opt.textContent = u.dept ? `${u.name} - ${u.dept}` : u.name;
      sel.appendChild(opt);
    });
    console.log("Usuarios cargados:", users.length);
  }catch(e){
    console.warn("No se pudo cargar usuarios:", e);
    const sel = $("loginUser");
    sel.innerHTML = `<option value="">Error cargando</option>`;
    toast("err", "Error", "No se pudieron cargar usuarios");
  }finally{
    const sel = $("loginUser");
    sel.disabled = false;
    const btn = $("btnLogin");
    if (btn) btn.disabled = false;
    LOGIN_USERS_LOADING = false;
  }
}

$("btnLogin").addEventListener("click", async () => {
  try {
    const selEl = $("loginUser");
    if (!selEl || selEl.options.length <= 1) {
      $("loginErr").classList.remove("hidden");
      toast("err", "Error", "Usuarios no cargados");
      return;
    }

    const selName = String(selEl.value || "").trim();
    if (!selName) {
      $("loginErr").classList.remove("hidden");
      toast("err", "Error", "Selecciona tu usuario");
      selEl.focus();
      return;
    }
    const clave = String($("loginPass").value || "").trim();
    if (!clave) {
      $("loginErr").classList.remove("hidden");
      toast("err", "Error", "Ingresa tu contrasena");
      $("loginPass").focus();
      return;
    }
    if (!requireOnline()) return;

    const btn = $("btnLogin");
    btn.disabled = true;
    const resp = await apiPOST("/api/login", { nombre: selName, clave });
    const u = resp.user;
    if (String(u.name) !== selName) {
      $("loginErr").classList.remove("hidden");
      toast("err", "Error", "La contrasena no corresponde al usuario seleccionado");
      $("loginPass").focus();
      return;
    }

    setSession({ id: u.id, name: u.name, dept: u.dept, token: resp.token, at: Date.now() });
    setActivity();
    hideLogin();
    requestNotifPermission();
    toast("ok", "Bienvenido", `${u.name} - ${u.dept}`);

    await bootData();
    renderAll();
    renderActiveUser();
    adjustMobileLayout();
  } catch (e) {
    $("loginErr").classList.remove("hidden");
    toast("err", "Error", e.message || "Contrasena incorrecta");
    $("loginPass").focus();
  } finally {
    $("btnLogin").disabled = false;
  }
});

$("loginPass").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("btnLogin").click();
});

$("btnLock").addEventListener("click", () => {
  unsubscribeFromPush();
  showLogin();
});
/* =========================
   UI MODULES
========================= */
let selectedRoomKey = null;
let selectedRoomEl = null;

const CLEANED_KEY = "hk_cleaned_rooms_v1";
function loadCleanedMap() {
  try { return JSON.parse(localStorage.getItem(CLEANED_KEY) || "{}"); } catch { return {}; }
}
function saveCleanedMap(map) {
  try { localStorage.setItem(CLEANED_KEY, JSON.stringify(map)); } catch {}
}

function renderModules() {
  const row = $("modulesRow");
  row.innerHTML = "";

  MODULES.forEach(m => {
    const b = document.createElement("button");
    b.className = "btnModule" + (String(m.id) === String(activeModuleId) ? " active" : "");
    b.textContent = m.descripcion;

    b.addEventListener("click", async () => {
      activeModuleId = String(m.id);
      $("selModule").textContent = m.descripcion;

      if (!roomsCache.get(activeModuleId)) {
        await loadRooms(activeModuleId);
      }

      renderModules();
      renderRooms();
    });

    row.appendChild(b);
  });

  const cur = MODULES.find(x => String(x.id) === String(activeModuleId));
  $("selModule").textContent = cur?.descripcion || "-";
}

function openInspeccion(modulo_id, etiqueta) {
  const sess = getSession() || {};
  const url = new URL("./Inspeccion.html", window.location.href);
  url.searchParams.set("m", String(modulo_id));
  url.searchParams.set("r", String(etiqueta));
  const modName = MODULES.find(x => String(x.id) === String(modulo_id))?.descripcion || "";
  if (modName) url.searchParams.set("mn", modName);
  url.searchParams.set("u", sess.name || "");
  url.searchParams.set("d", sess.dept || "");
  window.location.href = url.toString();
}

function openDecoradaForm(modulo_id) {
  const sess = getSession() || {};
  const url = new URL("./Decorada.html", window.location.href);
  if (modulo_id != null) url.searchParams.set("m", String(modulo_id));
  const modName = MODULES.find(x => String(x.id) === String(modulo_id))?.descripcion || "";
  if (modName) url.searchParams.set("mn", modName);
  url.searchParams.set("u", sess.name || "");
  url.searchParams.set("d", sess.dept || "");
  window.location.href = url.toString();
}
/* =========================
   MODAL OCUPACION
========================= */
let modalRoom = null;

const modalOverlay = $("modalOverlay");
const modalSub = $("modalSub");
const adultsInput = $("adultsInput");
const kidsInput = $("kidsInput");
const adultsMinus = $("adultsMinus");
const adultsPlus = $("adultsPlus");
const kidsMinus = $("kidsMinus");
const kidsPlus = $("kidsPlus");
const modalClose = $("modalClose");
const modalCancel = $("modalCancel");
const modalSave = $("modalSave");
const obsInput = $("obsInput");
const confirmOverlay = $("confirmOverlay");
const confirmMsg = $("confirmMsg");
const confirmCancel = $("confirmCancel");
const confirmOk = $("confirmOk");
const obsOverlay = $("obsOverlay");
const obsRoomSub = $("obsRoomSub");
const obsTextBody = $("obsTextBody");
const obsClose = $("obsClose");
const obsOk = $("obsOk");

function openConfirm(message) {
  if (confirmMsg) confirmMsg.textContent = message;
  if (confirmOverlay) confirmOverlay.classList.remove("hidden");
}
function closeConfirm() {
  if (confirmOverlay) confirmOverlay.classList.add("hidden");
}
function confirmDialog(message) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      closeConfirm();
      resolve(val);
    };
    openConfirm(message);
    const onCancel = () => finish(false);
    const onOk = () => finish(true);
    const onOverlay = (e) => { if (e.target === confirmOverlay) finish(false); };

    confirmCancel?.addEventListener("click", onCancel, { once: true });
    confirmOk?.addEventListener("click", onOk, { once: true });
    confirmOverlay?.addEventListener("click", onOverlay, { once: true });
  });
}

function openObsModal(room){
  if (!obsOverlay || !obsRoomSub || !obsTextBody) return;
  obsRoomSub.textContent = `Habitacion: ${room?.etiqueta || "-"}`;
  const txt = String(room?.observaciones || "").trim();
  const camarera = String(room?.camarera_asignada || "").trim();
  const lines = [];
  if (camarera) lines.push(`Camarera asignada: ${camarera}`);
  if (txt) lines.push(txt);
  obsTextBody.textContent = lines.join("\n\n") || "Sin observaciones";
  obsOverlay.classList.remove("hidden");
}
function closeObsModal(){
  if (!obsOverlay) return;
  obsOverlay.classList.add("hidden");
}
obsClose?.addEventListener("click", closeObsModal);
obsOk?.addEventListener("click", closeObsModal);
obsOverlay?.addEventListener("click", (e) => { if (e.target === obsOverlay) closeObsModal(); });

function clampNonNegInt(v) {
  const n = parseInt(String(v || "0").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
function openOccModal(room) {
  modalRoom = room;
  modalSub.textContent = `Habitacion: ${room.etiqueta}`;
  adultsInput.value = String(room.adultos ?? 0);
  kidsInput.value = String(room.ninos ?? 0);
  obsInput.value = room.observaciones || "";
  modalOverlay.classList.remove("hidden");
}
function closeOccModal() {
  modalOverlay.classList.add("hidden");
  modalRoom = null;
}

adultsMinus.addEventListener("click", () => adultsInput.value = String(Math.max(0, clampNonNegInt(adultsInput.value) - 1)));
adultsPlus.addEventListener("click", () => adultsInput.value = String(clampNonNegInt(adultsInput.value) + 1));
kidsMinus.addEventListener("click", () => kidsInput.value = String(Math.max(0, clampNonNegInt(kidsInput.value) - 1)));
kidsPlus.addEventListener("click", () => kidsInput.value = String(clampNonNegInt(kidsInput.value) + 1));

modalClose.addEventListener("click", closeOccModal);
modalCancel.addEventListener("click", closeOccModal);
modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeOccModal(); });

/* =========================
   UPDATE ROOM (DB)
========================= */
async function updateRoom(modulo_id, etiqueta, patch, source = "app") {
  const resp = await apiPOST("/api/room/update", { modulo_id, etiqueta, patch, actor: getActor(), source });
  applyRoomUpdate(resp.data);
  return resp.data;
}
/* =========================
   MOBILE LAYOUT ADJUST
========================= */
function adjustMobileLayout() {
  const isMobile = window.innerWidth <= 767;
  const $summary = $('#summaryBar');
  const $progAll = $('#summaryProgressAll');
  const $modulesBar = document.querySelector('.modulesBar');
  const $logoBox = document.querySelector('.logoBox');
  const $brand = document.querySelector('.brand');

  if (!$summary || !$progAll || !$modulesBar) return;

  const alreadyMobile = $summary.dataset.mobilePlaced === '1';

  if (isMobile && !alreadyMobile) {
    const $row = document.createElement('div');
    $row.className = 'summaryRow';
    $modulesBar.after($row);

    const $pillsRow = document.createElement('div');
    $pillsRow.className = 'pillsRow';
    $pillsRow.appendChild($summary);
    $row.appendChild($pillsRow);

    const $bottomRow = document.createElement('div');
    $bottomRow.className = 'summaryBottomRow';
    $bottomRow.appendChild($progAll);
    if ($logoBox) {
      $logoBox.classList.add('logo-moved');
      $bottomRow.appendChild($logoBox);
    }
    $row.appendChild($bottomRow);

    $summary.dataset.mobilePlaced = '1';
    $progAll.dataset.mobilePlaced = '1';
    document.body.classList.add('layout-mobile');
  } else if (!isMobile && alreadyMobile) {
    const $userLabel = $('#activeUserLabel');
    const $row = document.querySelector('.summaryRow');
    if ($row) {
      if ($brand && $logoBox) {
        $brand.prepend($logoBox);
        $logoBox.classList.remove('logo-moved');
      }
      if ($userLabel) {
        $userLabel.before($progAll);
        $userLabel.before($summary);
      }
      $row.remove();
    }
    delete $summary.dataset.mobilePlaced;
    delete $progAll.dataset.mobilePlaced;
    document.body.classList.remove('layout-mobile');
  }
}
/* =========================
   TIMERS LIVE
========================= */
function updateTimersLive() {
  const rooms = roomsCache.get(String(activeModuleId)) || [];
  const map = new Map();
  rooms.forEach(r => map.set(roomKey(r.modulo_id, r.etiqueta), r));

  document.querySelectorAll("[data-timer-roomkey]").forEach(el => {
    const k = el.getAttribute("data-timer-roomkey");
    const type = el.getAttribute("data-timer-type");
    const r = map.get(k);
    if (!r) { el.textContent = "0m 00s"; return; }

    let iso = null;
    if (type === "lista") iso = r.desde;
    if (type === "limpieza") iso = r.inicio_limpieza;
    if (type === "inspeccion") iso = r.fin_limpieza;
    if (type === "repaso") iso = r.inicio_repaso;

    el.textContent = iso ? fmtDur(msSince(iso)) : "0m 00s";
  });
}

/* =========================
   BUSCADOR DE HABITACIONES
========================= */
let roomSearchQuery = "";

$("roomSearch")?.addEventListener("input", (e) => {
  roomSearchQuery = String(e.target.value || "").trim().toLowerCase();
  scheduleRenderRooms();
});
/* =========================
   ROOMS RENDER
========================= */
const ROOM_CLASSES = {
  ocupado: { cls: "ocupado", badge: "OCUPADO" },
  "ocupada limpia": { cls: "ocupado", badge: "OCUPADO" },
  lista: { cls: "lista", badge: "LISTA PARA LIMPIEZA" },
  limpieza: { cls: "limpieza cleaning", badge: "LIMPIEZA" },
  inspeccion: { cls: "inspeccion", badge: "INSPECCION" },
  mantenimiento: { cls: "mantenimiento", badge: "MANT" },
  repaso: { cls: "repaso", badge: "REPASO" },
};
const ROOM_CLASS_DEFAULT = { cls: "libre", badge: "LIBRE" };
function roomClassByEstado(estado) {
  return ROOM_CLASSES[estado] || ROOM_CLASS_DEFAULT;
}
const ICONS = {
  ocupado: `<svg class="raIcon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="6" r="4"/><path d="M4 22c0-3.3 2.7-6 6-6h4c3.3 0 6 2.7 6 6z"/></svg>`,
  limpieza: `<svg class="raIcon" viewBox="0 0 24 24" aria-hidden="true"><rect x="14" y="3" width="3" height="12" rx="1.5"/><path d="M7 15h11l-2 8H9l-2-8z"/></svg>`,
  mant: `<svg class="raIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4.5l-3.5 3.5 2 2-7 7a1.5 1.5 0 0 0 2.1 2.1l7-7 2 2 3.5-3.5-4.1-4.1z"/></svg>`,
  repaso: `<svg class="raIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1 9 9 1-9 1-1 9-1-9-9-1 9-1z"/></svg>`,
  liberar: `<svg class="raIcon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="12" width="16" height="10" rx="2"/><path d="M8 12V7a4 4 0 0 1 8 0h-2a2 2 0 0 0-4 0v5H8z"/><circle cx="12" cy="17" r="1.5"/></svg>`,
  prio: `<svg class="raIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l-1 12h2l-1-12z"/><circle cx="12" cy="20" r="2"/></svg>`
};

const STATUS_COUNT_KEY = {
  ocupado: "sucias",
  limpieza: "limpieza",
  inspeccion: "inspeccion",
  lista: "lista",
  mantenimiento: "mantenimiento",
  repaso: "repaso",
  libre: "limpias",
};

function calcCounts(rooms) {
  const counts = { sucias: 0, limpieza: 0, inspeccion: 0, lista: 0, limpias: 0, limpiadas: 0, mantenimiento: 0, prioridad: 0, repaso: 0 };

  rooms.forEach(r => {
    const key = STATUS_COUNT_KEY[r.estado];
    if (key) counts[key]++;
    if (String(r.prioridad_limpieza || "").toLowerCase() === "alta") counts.prioridad++;
    if (r.estado === "libre" || r.estado === "ocupada limpia" ||
        (r.estado === "ocupado" && String(r.tipo_limpieza || "").toLowerCase() === "estadia" && r.fin_limpieza)) {
      counts.limpiadas++;
    }
  });

  return counts;
}

function setSummary(counts, total) {
  const set = (key, val) => { const el = $(key); if (el) el.textContent = String(val); };

  set("sumSucias", counts.sucias);
  set("sumLimpieza", counts.limpieza);
  set("sumInspeccion", counts.inspeccion);
  set("sumLista", counts.lista);
  set("sumLimpiadas", counts.limpiadas);
  set("sumLimpias", counts.limpias);
  set("sumMant", counts.mantenimiento);
  set("sumRepaso", counts.repaso);
  set("sumPrio", counts.prioridad);
}

function setProgressAll(counts, total) {
  const pct = total ? Math.round((counts.sucias / total) * 100) : 0;
  const progText = $("sumProgTextAll");
  if (progText) progText.textContent = `${counts.sucias}/${total} (${pct}%)`;
  const progFill = $("sumProgFillAll");
  if (progFill) progFill.style.width = `${pct}%`;
}

function updateSummaryCounts() {
  const rooms = roomsCache.get(String(activeModuleId)) || [];
  const counts = calcCounts(rooms);
  setSummary(counts, rooms.length || 0);

  const allRooms = [];
  roomsCache.forEach(arr => { if (Array.isArray(arr)) allRooms.push(...arr); });
  const allCounts = calcCounts(allRooms);
  setProgressAll(allCounts, allRooms.length || 0);
}

function renderRooms() {
  const grid = $("roomsGrid");
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();

  const sess = getSession();
  const role = roleOf(sess);

  const rooms = roomsCache.get(String(activeModuleId)) || [];
  if (!rooms.length) {
    grid.innerHTML = '<div class="emptyRooms">No hay habitaciones en este modulo.</div>';
    return;
  }

  let filteredRooms = rooms;
  if (roomSearchQuery) {
    filteredRooms = rooms.filter(r => {
      const etiqueta = String(r.etiqueta).toLowerCase();
      return etiqueta.includes(roomSearchQuery);
    });
    if (!filteredRooms.length) {
      grid.innerHTML = '<div class="emptyRooms">Sin resultados para "' + roomSearchQuery + '"</div>';
      updateSummaryCounts();
      return;
    }
  }

  const moduleName = MODULES.find(m => String(m.id) === String(activeModuleId))?.descripcion || "";

  const cleanedMap = loadCleanedMap();
  let cleanedDirty = false;
  const sorted = [...filteredRooms].sort((a, b) => String(a.etiqueta).localeCompare(String(b.etiqueta), "es", { numeric: true }));

  sorted.forEach(room => {
    const k = roomKey(room.modulo_id, room.etiqueta);
    const { cls, badge } = roomClassByEstado(room.estado);

    let cleanedAt = cleanedMap[k] || null;
    if (room.estado !== "libre" && cleanedAt) {
      delete cleanedMap[k];
      cleanedDirty = true;
      cleanedAt = null;
    }
    const cleanTagHTML =
      (room.estado === "libre" && cleanedAt) ? `<div class="cleanTag">LIMPIADA</div>` :
      (room.estado === "ocupada limpia") ? `<div class="cleanTag occupiedClean">OCUPADA LIMPIA</div>` :
      (room.estado === "ocupado" && String(room.tipo_limpieza || "").toLowerCase() === "estadia" && room.fin_limpieza)
        ? `<div class="cleanTag occupiedClean">OCUPADA LIMPIA</div>`
        : "";
    const decoradaTagHTML = Number(room.decorada) === 1
      ? `<div class="decoradaTag" title="Habitacion decorada"><span class="decoradaEmoji" aria-hidden="true">*</span><span class="decoradaText">DECORADA</span></div>`
      : "";
    const prioHigh = String(room.prioridad_limpieza || "").toLowerCase() === "alta";
    const badgeText = (prioHigh && (room.estado === "libre" || room.estado === "lista")) ? "PRIORIDAD" : badge;
    const prioTagHTML = "";

    const btn = document.createElement("button");
    btn.className = `roomBtn ${cls}${prioHigh ? " prioHigh" : ""}`;
    btn.type = "button";

    const obsChips = (room.observaciones && room.observaciones.trim())
      ? `<div class="obsBar"><span class="obsChip">Observaciones</span><button class="obsPeekBtn" type="button" title="Ver observaciones">Ver</button></div>`
      : "";

    let timerHTML = "";
    const prioIconHTML = prioHigh ? `<div class="prioIcon">&#9889;</div>` : "";
    if (room.estado === "lista" && parseAnyDate(room.desde)) {
      timerHTML = `
        <div class="timerBadge">
          <img class="timerIcon" src="./cronografo.png" alt="" />
          ${prioIconHTML}
          <div class="timerText" data-timer-roomkey="${k}" data-timer-type="lista">${fmtDur(msSince(room.desde))}</div>
        </div>`;
    }
    if (room.estado === "limpieza" && parseAnyDate(room.inicio_limpieza)) {
      timerHTML = `
        <div class="timerBadge">
          <img class="timerIcon" src="./cronografo.png" alt="" />
          ${prioIconHTML}
          <div class="timerText" data-timer-roomkey="${k}" data-timer-type="limpieza">${fmtDur(msSince(room.inicio_limpieza))}</div>
        </div>`;
    }
    if (room.estado === "inspeccion" && parseAnyDate(room.fin_limpieza)) {
      timerHTML = `
        <div class="timerBadge">
          <img class="timerIcon" src="./cronografo.png" alt="" />
          ${prioIconHTML}
          <div class="timerText" data-timer-roomkey="${k}" data-timer-type="inspeccion">${fmtDur(msSince(room.fin_limpieza))}</div>
        </div>`;
    }
    if (room.estado === "repaso" && parseAnyDate(room.inicio_repaso)) {
      timerHTML = `
        <div class="timerBadge">
          <img class="timerIcon" src="./cronografo.png" alt="" />
          ${prioIconHTML}
          <div class="timerText" data-timer-roomkey="${k}" data-timer-type="repaso">${fmtDur(msSince(room.inicio_repaso))}</div>
        </div>`;
    }

    const prioTopHTML = "";
    const showOccupied = room.estado === "ocupado" || room.estado === "ocupada limpia" || room.estado === "lista";
    const precioStr = "";
    btn.dataset.roomKey = k;
    btn.innerHTML = `
      ${timerHTML}
      ${prioTopHTML}
      <div class="badge">${badgeText}</div>
      ${cleanTagHTML}
      ${decoradaTagHTML}
      <div class="roomNum">${room.etiqueta}</div>
      <div class="roomState">${moduleName}</div>
      <div class="roomOcc">${(showOccupied) && (room.adultos > 0 || room.ninos > 0) ? `&#128101; ${room.adultos || 0} / ${room.ninos || 0}` : ""}</div>
      ${precioStr}
      ${obsChips}

      <div class="roomDetails">
        <div class="detailBlock">
          <div class="detailBlockTitle">Observaciones</div>
          <ul class="detailList">
            <li>Estado: ${badgeText}</li>
            <li>${room.camarera_asignada ? `Camarera: ${room.camarera_asignada}` : "-"}</li>
          </ul>
          ${room.observaciones ? `<div class="detailObs">${room.observaciones}</div>` : `<div class="detailObs empty">Sin observaciones</div>`}
        </div>
      </div>

      <div class="roomActions">
        <button class="raBtn ocupado" data-action="ocupado" title="Ocupado">${ICONS.ocupado}</button>
        <button class="raBtn limpieza" data-action="limpieza" title="Lista / Iniciar limpieza">${ICONS.limpieza}</button>
        <button class="raBtn mant" data-action="mant" title="Mantenimiento">${ICONS.mant}</button>
        <button class="raBtn liberar" data-action="liberar" title="Liberar habitacion">${ICONS.liberar}</button>
        <button class="raBtn prio" data-action="prio" title="Prioridad limpieza">${ICONS.prio}</button>
        <button class="raBtn repaso" data-action="repaso" title="Repaso">${ICONS.repaso}</button>
      </div>
    `;

    btn.addEventListener("click", (e) => {
      if (e.target.closest("[data-action]") || e.target.closest(".obsPeekBtn")) return;
      const wasSelected = selectedRoomKey === k;
      if (selectedRoomEl) selectedRoomEl.classList.remove("selected");
      selectedRoomEl = wasSelected ? null : btn;
      selectedRoomKey = wasSelected ? null : k;
      if (!wasSelected) btn.classList.add("selected");
    });
    if (selectedRoomKey === k) { selectedRoomEl = btn; btn.classList.add("selected"); }

    const bObsPeek = btn.querySelector(".obsPeekBtn");
    bObsPeek?.addEventListener("click", (e) => {
      e.stopPropagation();
      openObsModal(room);
    });

    const [bOcc, bLimp, bMant, bFree, bPrio, bRep] = btn.querySelectorAll(".raBtn");
    const isReadOnlyRole = role === "GERENCIA" || role === "REPORTES";
    if (isReadOnlyRole) {
      bOcc.disabled = true;
      bLimp.disabled = true;
      bMant.disabled = true;
      bFree.disabled = true;
      bPrio.disabled = true;
      bRep.disabled = true;
      bOcc.title = "Solo lectura";
      bLimp.title = "Solo lectura";
      bMant.title = "Solo lectura";
      bFree.title = "Solo lectura";
      bPrio.title = "Solo lectura";
      bRep.title = "Solo lectura";
    }
    if (!canUseLiberar(role)) bFree.classList.add("hidden");
    if (!canReception(role)) {
      bPrio.classList.add("hidden");
      bRep.classList.add("hidden");
    }
    bOcc.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isLocked()) { showLogin(); return; }
      if (role === "GERENCIA") {
        toast("err", "Restringido", "Gerencia solo puede visualizar.");
        return;
      }

      if (!canReception(role)) {
        toast("err", "Restringido", "Solo Recepcion puede poner OCUPADO.");
        return;
      }
      openOccModal(room);
    });
    bLimp.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (isLocked()) { showLogin(); return; }
      if (role === "GERENCIA") {
        toast("err", "Restringido", "Gerencia solo puede visualizar.");
        return;
      }

      const current = normalizeRoom(room);
      const sess2 = getSession();
      const role2 = roleOf(sess2);

      if (canReception(role2)) {
        if (current.estado !== "ocupado" && current.estado !== "ocupada limpia") {
          toast("err", "No permitido", "Solo podes poner LISTA cuando estaba OCUPADO.");
          return;
        }
        if (!requireOnline()) return;

        bLimp.disabled = true;
        try {
          await updateRoom(current.modulo_id, current.etiqueta, {
            estado: "lista",
            desde: nowLocalMySQL(),
            inicio_limpieza: null,
            fin_limpieza: null,
            camarera_asignada: null,
            tipo_limpieza: null,
            inspector_asignado: null,
            adultos: Number.isFinite(current.adultos) ? current.adultos : 0,
            ninos: Number.isFinite(current.ninos) ? current.ninos : 0,
            observaciones: appendActionObs(current.observaciones || "", "LISTA PARA LIMPIEZA")
          });

          toast("warn", "Lista para limpieza", `Habitacion ${current.etiqueta} lista.`);
        } catch (err) {
          toast("err", "Error", err.message || "No se pudo cambiar a LISTA");
        } finally {
          bLimp.disabled = false;
        }
      }
      if (role2 === "AMA_LLAVES") {
        if (current.estado === "repaso") {
          const ok = await confirmDialog(`Seguro de liberar la habitacion ${current.etiqueta}?`);
          if (!ok) return;
          if (!requireOnline()) return;
          bLimp.disabled = true;
          try {
            await updateRoom(current.modulo_id, current.etiqueta, {
              estado: "libre",
              repaso: null,
              inicio_repaso: null,
              desde: null,
              inicio_limpieza: null,
              fin_limpieza: null,
              camarera_asignada: null
            });
            toast("ok", "Habitacion liberada", `${current.etiqueta} -> LIBRE`);
          } catch (err) {
            toast("err", "Error", err.message || "No se pudo liberar");
          } finally {
            bLimp.disabled = false;
          }
          return;
        }

        if (current.estado !== "lista" && current.estado !== "limpieza" && current.estado !== "inspeccion") {
          toast("err", "No disponible", "Recepcion debe poner LISTA primero.");
          return;
        }
        try {
          openInspeccion(current.modulo_id, current.etiqueta);
        } catch (err) {
          toast("err", "Error", err.message || "No se pudo iniciar limpieza");
        }
      }
    });
    bMant.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (isLocked()) { showLogin(); return; }
      if (role === "GERENCIA") {
        toast("err", "Restringido", "Gerencia solo puede visualizar.");
        return;
      }

      if (!canUseMantenimiento(role)) {
        toast("err", "Restringido", "Solo Recepcion o Ama de llaves puede poner MANTENIMIENTO.");
        return;
      }

      if (room.estado === "ocupado" || room.estado === "ocupada limpia") {
        toast("err", "No permitido", "No podes poner MANTENIMIENTO si esta OCUPADO.");
        return;
      }
      if (!requireOnline()) return;

      const confirmado = await confirmDialog(`¿Estás seguro de poner la habitacion ${room.etiqueta} en MANTENIMIENTO?`);
      if (!confirmado) return;

      bMant.disabled = true;
      try {
        await updateRoom(room.modulo_id, room.etiqueta, {
          estado: "mantenimiento",
          camarera_asignada: null,
          adultos: Number.isFinite(room.adultos) ? room.adultos : 0,
          ninos: Number.isFinite(room.ninos) ? room.ninos : 0,
          observaciones: appendActionObs(room.observaciones || "", "MANTENIMIENTO")
        });

        toast("warn", "Mantenimiento", `Habitacion ${room.etiqueta} en mantenimiento.`);
      } catch (err) {
        toast("err", "Error", err.message || "No se pudo poner mantenimiento");
      } finally {
        bMant.disabled = false;
      }
    });
    bRep.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (isLocked()) { showLogin(); return; }
      if (role === "GERENCIA") {
        toast("err", "Restringido", "Gerencia solo puede visualizar.");
        return;
      }
      if (!canReception(role)) {
        toast("err", "Restringido", "Solo Recepcion puede poner REPASO.");
        return;
      }
      if (room.estado !== "libre") {
        toast("err", "No permitido", "Solo se puede poner REPASO si esta LIBRE.");
        return;
      }
      if (!requireOnline()) return;

      bRep.disabled = true;
      try {
        await updateRoom(room.modulo_id, room.etiqueta, {
          estado: "repaso",
          repaso: "si",
          inicio_repaso: nowLocalMySQL(),
          observaciones: appendActionObs(room.observaciones || "", "REPASO")
        });
        toast("warn", "Repaso", `Habitacion ${room.etiqueta} en repaso.`);
      } catch (err) {
        toast("err", "Error", err.message || "No se pudo poner repaso");
      } finally {
        bRep.disabled = false;
      }
    });
    bFree.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (isLocked()) { showLogin(); return; }
      if (role === "GERENCIA") {
        toast("err", "Restringido", "Gerencia solo puede visualizar.");
        return;
      }

      const current = normalizeRoom(room);
      const st = String(current.estado || "").toLowerCase();
      const isAdminRole = role === "ADMIN";
      const isReceptionRole = role === "RECEPCION";
      const isAmaLlavesRole = role === "AMA_LLAVES";

      if (st === "limpieza" && !isAdminRole) {
        toast("err", "No permitido", "Solo Administrador puede liberar si esta en LIMPIEZA.");
        return;
      }
      if (st === "inspeccion" && !isAdminRole && !isAmaLlavesRole) {
        toast("err", "No permitido", "Solo Administrador o Ama de llaves puede liberar desde INSPECCION.");
        return;
      }
      if (isAmaLlavesRole && st !== "mantenimiento" && st !== "inspeccion") {
        toast("err", "No permitido", "Ama de llaves solo puede liberar si esta en MANTENIMIENTO o INSPECCION.");
        return;
      }
      if (isReceptionRole && !["ocupado", "ocupada limpia", "mantenimiento", "lista"].includes(st)) {
        toast("err", "No permitido", "Recepcion solo puede liberar si esta OCUPADA, en MANTENIMIENTO o LISTA.");
        return;
      }
      if (isAdminRole && !["ocupado", "ocupada limpia", "mantenimiento", "lista", "limpieza", "inspeccion"].includes(st)) {
        toast("err", "No permitido", "Administrador solo puede liberar estados permitidos.");
        return;
      }
      if (!isAdminRole && !isReceptionRole && !isAmaLlavesRole) {
        toast("err", "Restringido", "No tenes permiso para liberar habitaciones.");
        return;
      }

      const ok = await confirmDialog(`Seguro de liberar la habitacion ${current.etiqueta}?`);
      if (!ok) return;
      if (!requireOnline()) return;

      bFree.disabled = true;
      try {
        await updateRoom(current.modulo_id, current.etiqueta, {
          estado: "libre",
          adultos: 0,
          ninos: 0,
          camarera_asignada: null,
          desde: null,
          inicio_limpieza: null,
          fin_limpieza: null,
          observaciones: ""
        });
        toast("ok", "Habitacion liberada", `${current.etiqueta} -> LIBRE`);
      } catch (err) {
        toast("err", "Error", err.message || "No se pudo liberar");
      } finally {
        bFree.disabled = false;
      }
    });
    bPrio.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (isLocked()) { showLogin(); return; }
      if (role === "GERENCIA") {
        toast("err", "Restringido", "Gerencia solo puede visualizar.");
        return;
      }
      if (!canReception(role)) {
        toast("err", "Restringido", "Solo Recepcion puede marcar prioridad.");
        return;
      }
      const cur = normalizeRoom(room);
      if (cur.estado === "ocupado" || cur.estado === "ocupada limpia") {
        toast("err", "No permitido", "Debe iniciar limpieza antes de darle Prioridad");
        return;
      }
      const next = (String(cur.prioridad_limpieza || "").toLowerCase() === "alta") ? "baja" : "alta";
      if (!requireOnline()) return;

      bPrio.disabled = true;
      try {
        await updateRoom(cur.modulo_id, cur.etiqueta, {
          prioridad_limpieza: next,
          estado: cur.estado,
          desde: cur.desde,
          inicio_limpieza: cur.inicio_limpieza,
          fin_limpieza: cur.fin_limpieza,
          observaciones: appendActionObs(cur.observaciones || "", `PRIORIDAD ${String(next || "").toUpperCase()}`)
        });
        if (next) toast("warn", "Prioridad", `Habitacion ${cur.etiqueta} con prioridad.`);
        else toast("ok", "Prioridad", `Habitacion ${cur.etiqueta} sin prioridad.`);
      } catch (err) {
        toast("err", "Error", err.message || "No se pudo cambiar prioridad");
      } finally {
        bPrio.disabled = false;
      }
    });

    frag.appendChild(btn);
  });

  grid.appendChild(frag);

  const roomIndex = document.getElementById('roomIndex');
  if (roomIndex) {
    roomIndex.innerHTML = '';
    sorted.forEach(room => {
      const idxBtn = document.createElement('button');
      const { cls } = roomClassByEstado(room.estado);
      idxBtn.className = `roomIndexBtn ${cls}`;
      idxBtn.textContent = room.etiqueta;
      idxBtn.addEventListener('click', () => {
        const card = grid.querySelector(`[data-room-key="${roomKey(room.modulo_id, room.etiqueta)}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.style.transition = 'box-shadow .2s';
          card.style.boxShadow = '0 0 0 3px rgba(124,58,237,.6), 0 20px 60px rgba(0,0,0,.5)';
          setTimeout(() => { card.style.boxShadow = ''; }, 800);
        }
      });
      roomIndex.appendChild(idxBtn);
    });
  }

  if (cleanedDirty) saveCleanedMap(cleanedMap);

  updateSummaryCounts();
  updateTimersLive();
}

const roomsGrid = $("roomsGrid");
if (roomsGrid) {
  roomsGrid.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".roomBtn")) return;
    selectedRoomKey = null;
    document.querySelectorAll(".roomBtn.selected").forEach(x => x.classList.remove("selected"));
  });
}

const btnDecorada = $("btnDecorada");
if (btnDecorada) {
  btnDecorada.addEventListener("click", () => {
    if (isLocked()) { showLogin(); return; }
    const sess = getSession();
    const role = roleOf(sess);
    if (!canUseDecorada(role)) {
      toast("err", "Restringido", "Solo Ama de llaves o Administrador puede usar Decorada.");
      return;
    }
    openDecoradaForm(activeModuleId);
  });
}
/* =========================
   BOOT (cargar datos BD)
========================= */
async function loadModules() {
  const resp = await apiGET("/api/modules");
  MODULES = (resp.data || []).map(x => ({ id: String(x.id), descripcion: String(x.descripcion) }));
  if (!MODULES.length) throw new Error("No hay modulos en BD");
  if (!activeModuleId) activeModuleId = String(MODULES[0].id);
}

async function loadRooms(modulo_id) {
  const resp = await apiGET(`/api/rooms?modulo_id=${encodeURIComponent(String(modulo_id))}`);
  const rows = (resp.data || []).map(normalizeRoom);
  roomsCache.set(String(modulo_id), rows);
  return rows;
}

async function bootData() {
  await loadModules();
  const moduleIds = MODULES.map(m => String(m.id));
  await Promise.all(moduleIds.map(id => loadRooms(id)));
}

/* =========================
   RENDER ALL
========================= */
function renderAll() {
  renderModules();
  renderRooms();
}

/* =========================
   MODAL SAVE HANDLER
========================= */
modalSave.onclick = async () => {
  try {
    if (!modalRoom) return;
    if (isLocked()) { showLogin(); return; }
    if (!requireOnline()) return;

    const sess2 = getSession();
    if (!canReception(roleOf(sess2))) {
      toast("err", "Restringido", "Solo Recepcion puede poner OCUPADO.");
      return;
    }

    const adultsVal = clampNonNegInt(adultsInput.value);
    if (adultsVal < 1) {
      toast("err", "Falta adulto", "Debe haber al menos 1 adulto para ocupar.");
      adultsInput.focus();
      return;
    }

    modalSave.disabled = true;
    try {
      await updateRoom(modalRoom.modulo_id, modalRoom.etiqueta, {
        estado: "ocupado",
        adultos: adultsVal,
        ninos: clampNonNegInt(kidsInput.value),
        observaciones: appendActionObs(String(obsInput.value || "").trim(), "OCUPADO"),
        camarera_asignada: null
      });

      toast("ok", "Actualizado", `${modalRoom.etiqueta} -> OCUPADO`);
      closeOccModal();
    } finally {
      modalSave.disabled = false;
    }
  } catch (err) {
    toast("err", "Error", err.message || "No se pudo guardar");
  }
};

/* =========================
   INTERVALS & EVENTS
========================= */
setInterval(() => {
  if (isLocked() && !isLoginVisible()) {
    unsubscribeFromPush();
    showLogin();
  }
}, 8000);

setInterval(updateTimersLive, 1000);

async function refreshOnResume() {
  if (isLoginVisible()) return;
  if (!activeModuleId) return;
  try {
    await loadRooms(activeModuleId);
    renderRooms();
    updateSummaryCounts();
  } catch {}
}

document.addEventListener("visibilitychange", refreshOnResume);
window.addEventListener("focus", refreshOnResume);
window.addEventListener("pageshow", refreshOnResume);
window.addEventListener("online", refreshOnResume);
setInterval(syncServerTime, 5 * 60 * 1000);

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(adjustMobileLayout, 200);
});

/* =========================
   INIT
========================= */
(async function init() {
  initSocket();

  await syncServerTime();
  if (localStorage.getItem(LS_FORCE_LOGIN) === "1" || isLocked()) {
    showLogin();
    return;
  }

  try {
    await bootData();
    renderAll();
    renderActiveUser();
    adjustMobileLayout();
    requestNotifPermission();
  } catch (e) {
    console.error(e);
    toast("err", "Error", e.message || "No cargo data");
    showLogin();
  }
})();

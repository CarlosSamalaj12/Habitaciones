/* ==========================================================================
   WEB PUSH & NOTIFICATIONS COMPONENT
   ========================================================================== */

import { API_BASE, state, getSession } from "../state/store.js";
import { apiPOST } from "../api/client.js";
import { toast } from "./toast.js";
import { playNotificationSound } from "./sound.js";
import { urlBase64ToUint8Array, isDuplicate, $ } from "../utils/helpers.js";
import { ESTADO_LABELS } from "../utils/normalize.js";

let notifPermission = typeof window !== "undefined" && "Notification" in window ? Notification.permission : "denied";
let pushSubscription = null;

const NOTIF_ICON_MAP = {
  "ocupado": "🔴",
  "ocupada limpia": "🔴",
  "lista": "🟡",
  "limpieza": "🔵",
  "inspeccion": "🟢",
  "libre": "🟢",
  "mantenimiento": "🟣",
  "repaso": "🟤",
  "prioridad_alta": "⚡",
  "prioridad_normal": "🔔"
};

export function unsubscribeFromPush() {
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

export async function showRoomNotification(title, body, tag) {
  if (!("Notification" in window && notifPermission === "granted")) return;
  playNotificationSound();
  try {
    const options = {
      body: body,
      icon: "./Oficial_JDL_blanco.png",
      badge: "./Oficial_JDL_blanco.png",
      tag: tag || "room-update",
      silent: false
    };
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
    } else {
      const n = new Notification(title, options);
      setTimeout(function() { n.close(); }, 5000);
    }
  } catch (e) {
    console.warn("Notificacion fallo:", e);
  }
}

export async function subscribePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const existingSub = await registration.pushManager.getSubscription();
    if (existingSub) {
      await existingSub.unsubscribe().catch(() => {});
    }

    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array("BBNU_k9XBvfFRjyb-J6o4pWRtkBjT4jIeecqU9XoNPk5-fzEhlK_wC-d0AlUr8gBoTZ2wQQ4O57mjZ8idcB5yFI")
    });
    pushSubscription = sub;
    const json = sub.toJSON();
    const ses = getSession();
    await apiPOST("/api/push/subscribe", {
      usuario_nombre: ses?.name || "Desconocido",
      usuario_dept: ses?.dept || null,
      subscription: {
        endpoint: json.endpoint,
        keys: json.keys
      }
    });
    return true;
  } catch (e) {
    console.warn("Push subscribe failed:", e);
    const msg = String(e.message || "");
    if (msg.includes("push service error")) {
      toast("err", "Error de notificaciones", "El servicio de notificaciones de tu navegador está desactivado. Actívalo en la configuración de tu navegador.");
    } else {
      toast("err", "Error", "No se pudo registrar el servicio de notificaciones en el navegador.");
    }
    throw e;
  }
}

export async function requestNotifPermission() {
  if (localStorage.getItem("hk_notif_enabled") === "0") return;
  if (!("Notification" in window)) return;
  if (Notification.permission === "denied") return;
  
  if (Notification.permission === "granted") {
    notifPermission = "granted";
    await subscribePush();
    return;
  }
  
  const perm = await Notification.requestPermission();
  notifPermission = perm;
  if (perm === "granted") {
    localStorage.setItem("hk_notif_enabled", "1");
    await subscribePush();
  }
}

export async function showNotification(etiqueta, estado, oldPrio, newPrio) {
  if (notifPermission !== "granted") return;
  
  const prioCambio = String(oldPrio || "").toLowerCase() !== String(newPrio || "").toLowerCase();
  const tienePrio = String(newPrio || "").toLowerCase() === "alta";
  const isPrioOnly = prioCambio && (oldPrio !== newPrio);

  const dedupKey = isPrioOnly
    ? `notif:${etiqueta}:prio:${newPrio}`
    : `notif:${etiqueta}:${estado}`;
    
  if (isDuplicate(dedupKey, 2000)) return;
  playNotificationSound();
  try {
    const title = `Hab ${etiqueta}`;
    let body = ESTADO_LABELS[estado] || estado;
    
    if (isPrioOnly) {
      body = tienePrio ? "🔴 PRIORIDAD ALTA" : "Prioridad removida";
    }
    
    const options = {
      body,
      icon: "./icon-192x192.png?v=1",
      badge: "./icon-192x192.png?v=1",
      tag: isPrioOnly ? `room-prio-${etiqueta}` : `room-${etiqueta}-${estado}`,
      silent: false
    };

    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
    } else {
      const n = new Notification(title, options);
      setTimeout(function() { n.close(); }, 5000);
    }
  } catch (e) {
    console.warn("Notificacion fallo:", e);
  }
}

export function notifItemHTML(n) {
  const icon = NOTIF_ICON_MAP[n.newEstado] || "🔔";
  const changeDir = n.oldEstado !== n.newEstado
    ? `<span style="color:var(--muted);font-size:10px">${n.oldLabel} → </span><span style="font-weight:700">${n.newLabel}</span>`
    : `<span style="font-weight:700">${n.newLabel}</span>`;
  return `<div class="notifItem" data-notif-id="${n.id}">
    <div class="notifItemIcon ${n.newEstado}">${icon}</div>
    <div class="notifItemContent">
      <div class="notifItemRoom">${n.modulo} - ${n.etiqueta}</div>
      <div class="notifItemChange">${changeDir}</div>
      <div class="notifItemTime">${n.time}</div>
    </div>
    <button class="notifItemClose" data-notif-close="${n.id}" title="Descartar">X</button>
  </div>`;
}

export function updateBellDot() {
  const dot = $("bellDot");
  if (!dot) return;
  dot.style.display = state.recentNotifications.length > 0 ? "block" : "none";
}

export function renderNotifPanel() {
  const body = $("notifPanelBody");
  const panel = $("notifPanel");
  if (!body || !panel) return;

  if (!state.recentNotifications.length) {
    body.innerHTML = '<div class="notifEmpty">Sin cambios recientes</div>';
    return;
  }

  let html = "";
  for (let i = 0; i < state.recentNotifications.length; i++) {
    html += notifItemHTML(state.recentNotifications[i]);
  }
  body.innerHTML = html;
}

export function addRecentNotification(modulo_id, etiqueta, oldEstado, newEstado, oldPrio, newPrio) {
  const prioCambio = String(oldPrio || "").toLowerCase() !== String(newPrio || "").toLowerCase();
  const tienePrio = String(newPrio || "").toLowerCase() === "alta";

  const dedupKey = prioCambio && oldEstado === newEstado
    ? `${modulo_id}:${etiqueta}:prio:${newPrio}`
    : `${modulo_id}:${etiqueta}:${newEstado}`;
    
  if (isDuplicate(dedupKey, 2000)) return;

  const mod = state.MODULES.find(m => String(m.id) === String(modulo_id));
  const moduloNombre = mod?.descripcion || mod?.nombre || modulo_id || "?";
  
  let oldLabel = ESTADO_LABELS[oldEstado] || oldEstado || "?";
  let newLabel = ESTADO_LABELS[newEstado] || newEstado || "?";
  
  if (prioCambio && oldEstado === newEstado) {
    oldLabel = "Prioridad";
    newLabel = tienePrio ? "⭐ PRIORIDAD ALTA" : "Normal";
  }

  const time = new Date().toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });
  state.recentNotifications.unshift({
    id: Date.now() + Math.random(),
    modulo: moduloNombre,
    etiqueta: etiqueta,
    oldEstado: oldEstado,
    newEstado: prioCambio && oldEstado === newEstado ? (tienePrio ? "prioridad_alta" : "prioridad_normal") : newEstado,
    oldLabel: oldLabel,
    newLabel: newLabel,
    time: time
  });
  if (state.recentNotifications.length > 50) state.recentNotifications.splice(50);

  if (state.notifPanelOpen) {
    const body = $("notifPanelBody");
    if (body) {
      const empty = body.querySelector(".notifEmpty");
      if (empty) empty.remove();
      const item = notifItemHTML(state.recentNotifications[0]);
      body.insertAdjacentHTML("afterbegin", item);
    }
  }

  updateBellDot();
}

export async function updateNotifSwitchState() {
  const switchEl = $("notifToggleSwitch");
  if (!switchEl) return;
  try {
    const swReg = window.__swReg || (await navigator.serviceWorker.ready.catch(() => null));
    if (!swReg || !("pushManager" in swReg)) {
      switchEl.checked = false;
      switchEl.disabled = true;
      return;
    }

    if (Notification.permission === "denied") {
      switchEl.checked = false;
      switchEl.disabled = true;
      localStorage.setItem("hk_notif_enabled", "0");
      return;
    }

    const enabledPref = localStorage.getItem("hk_notif_enabled") !== "0";
    const sub = await swReg.pushManager.getSubscription();
    pushSubscription = sub;

    if (enabledPref && !sub && Notification.permission === "granted") {
      try {
        await subscribePush();
      } catch (err) {
        console.warn("Re-suscripcion automatica fallo:", err);
      }
    }

    switchEl.checked = enabledPref;
    switchEl.disabled = false;
  } catch (err) {
    console.warn("Error leyendo suscripcion push:", err);
    switchEl.checked = false;
  }
}

export function setupNotifPanelDelegation() {
  const body = $("notifPanelBody");
  if (body && !body._delegated) {
    body._delegated = true;
    body.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-notif-close]");
      if (!btn) return;
      e.stopPropagation();
      const id = btn.dataset.notifClose;
      const idx = state.recentNotifications.findIndex(n => String(n.id) === String(id));
      if (idx >= 0) state.recentNotifications.splice(idx, 1);
      renderNotifPanel();
      updateBellDot();
    });
  }

  const bell = $("btnNotifBell");
  const panel = $("notifPanel");
  const panelClose = $("notifPanelClose");
  const switchEl = $("notifToggleSwitch");

  bell?.addEventListener("click", () => {
    state.notifPanelOpen = !state.notifPanelOpen;
    if (!panel) return;
    if (state.notifPanelOpen) {
      panel.classList.remove("hidden");
      renderNotifPanel();
      updateBellDot();
      updateNotifSwitchState();
    } else {
      panel.classList.add("hidden");
    }
  });

  panelClose?.addEventListener("click", () => {
    state.notifPanelOpen = false;
    if (panel) panel.classList.add("hidden");
    updateBellDot();
  });

  document.addEventListener("click", (e) => {
    if (!state.notifPanelOpen || !panel || !bell) return;
    if (!panel.contains(e.target) && !bell.contains(e.target)) {
      state.notifPanelOpen = false;
      panel.classList.add("hidden");
      updateBellDot();
    }
  });

  switchEl?.addEventListener("change", async (e) => {
    const checked = e.target.checked;
    if (checked) {
      if (!("Notification" in window)) {
        toast("err", "No soportado", "Las notificaciones no están soportadas en este dispositivo.");
        e.target.checked = false;
        return;
      }
      const currentPermission = Notification.permission;
      if (currentPermission === "denied") {
        toast("err", "Permiso denegado", "Por favor habilita los permisos de notificaciones en tu navegador.");
        e.target.checked = false;
        return;
      }
      localStorage.setItem("hk_notif_enabled", "1");
      try {
        const perm = await Notification.requestPermission();
        notifPermission = perm;
        if (perm === "granted") {
          await subscribePush();
          toast("ok", "Notificaciones activadas", "Recibirás alertas push en este dispositivo.");
        } else {
          toast("err", "Permiso denegado", "No se pudieron activar las notificaciones.");
          e.target.checked = false;
        }
      } catch (err) {
        e.target.checked = false;
        localStorage.setItem("hk_notif_enabled", "0");
      }
    } else {
      localStorage.setItem("hk_notif_enabled", "0");
      unsubscribeFromPush();
      toast("ok", "Notificaciones silenciadas", "Ya no recibirás alertas push en este dispositivo.");
    }
  });
}

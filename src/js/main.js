/* ==========================================================================
   MAIN FRONTEND ENTRY POINT (MODULAR ARCHITECTURE)
   ========================================================================== */

import {
  APP_BASE, API_BASE, LS_SESSION, LS_LAST_ACTIVITY, LS_FORCE_LOGIN,
  LS_ACTOR_CACHE, LS_LEGACY_USER_NAME, LS_LEGACY_USER_DEPT, AUTOLOCK_MS,
  LS_SW_UPDATE_DISMISSED, state, getSession, setActivity, initActivityListeners,
  isLocked, roleOf, canReception, canUseDecorada, getActor
} from "./state/store.js";

import { appendActionObs } from "./utils/date.js";
import { $, clampNonNegInt } from "./utils/helpers.js";
import { toast } from "./notifications/toast.js";
import { initAudioUnlockListeners } from "./notifications/sound.js";
import {
  requestNotifPermission, unsubscribeFromPush, setupNotifPanelDelegation
} from "./notifications/push.js";

import {
  syncServerTime, bootData, loadRooms, requireOnline
} from "./api/client.js";

import { initSocket } from "./socket/socket.js";
import { updateTimersLive } from "./components/timers.js";
import {
  setupModalEvents, closeOccModal
} from "./components/modals.js";

import {
  showLogin, isLoginVisible, renderActiveUser, setupLoginEvents
} from "./components/login.js";

import {
  renderModules, renderMenuModules, setupModuleDelegation,
  setupRoomIndexDelegation, openDecoradaForm
} from "./components/modules.js";

import {
  renderRooms, updateSummaryCounts, setupGridDelegation,
  setupRoomSearch, updateRoom
} from "./components/rooms.js";

/* =========================
   VERSION CONTROL & WINDOW EXPORTS
   ========================= */
window.APP_BASE = APP_BASE;
window.API_BASE = API_BASE;
window.APP_VERSION = "1.3.42";
window.LS_SESSION = LS_SESSION;
window.LS_LAST_ACTIVITY = LS_LAST_ACTIVITY;
window.LS_FORCE_LOGIN = LS_FORCE_LOGIN;
window.LS_ACTOR_CACHE = LS_ACTOR_CACHE;
window.LS_LEGACY_USER_NAME = LS_LEGACY_USER_NAME;
window.LS_LEGACY_USER_DEPT = LS_LEGACY_USER_DEPT;
window.AUTOLOCK_MS = AUTOLOCK_MS;
window.LS_SW_UPDATE_DISMISSED = LS_SW_UPDATE_DISMISSED;
window.__swReg = null;
window.__updateChecked = false;

window.triggerSwUpdate = function () {
  try {
    var reg = window.__swReg;
    if (reg && reg.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    } else {
      window.location.reload();
    }
  } catch (e) {
    console.warn("[Update] triggerSwUpdate fallback error:", e);
    window.location.reload();
  }
};

window.dismissSwUpdateToast = function (reason) {
  try {
    var el = document.getElementById("swUpdateToast");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  } catch {}
  try {
    localStorage.setItem(LS_SW_UPDATE_DISMISSED, String(window.APP_VERSION || ""));
  } catch {}
};

window.update = async function () {
  if (window.__updateChecked) return;
  window.__updateChecked = true;

  try {
    var reg = window.__swReg;
    if (reg && typeof reg.update === "function") {
      try { reg.update(); } catch {}
    }

    var resp = await fetch(API_BASE + "/api/version", { cache: "no-cache" });
    if (!resp.ok) return;
    var ct = resp.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return;
    var data = await resp.json();

    if (!data.ok || data.version === window.APP_VERSION) return;

    if (!reg || !reg.waiting) {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) return;
    }

    var dismissed = "";
    try { dismissed = localStorage.getItem(LS_SW_UPDATE_DISMISSED) || ""; } catch {}
    if (dismissed && dismissed === String(window.APP_VERSION)) return;

    var existing = document.getElementById("swUpdateToast");
    if (existing) return;
    var t = document.createElement("div");
    t.id = "swUpdateToast";
    t.className = "swUpdateToast";
    t.innerHTML =
      '<span class="swUpdateIcon">🔄</span>' +
      '<span class="swUpdateText">Nueva version ' + data.version + ' disponible.</span>' +
      '<button class="swUpdateBtn" id="swUpdateBtnApply" type="button">Actualizar</button>' +
      '<button class="swUpdateClose" id="swUpdateBtnClose" type="button" aria-label="Cerrar">✕</button>';
    document.body.appendChild(t);

    var applyBtn = document.getElementById("swUpdateBtnApply");
    var closeBtn = document.getElementById("swUpdateBtnClose");
    if (applyBtn) applyBtn.addEventListener("click", function () { window.triggerSwUpdate(); });
    if (closeBtn) closeBtn.addEventListener("click", function () { window.dismissSwUpdateToast("user"); });
  } catch (e) {
    console.warn("[Update] No se pudo verificar version:", e);
  }
};

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
  $("btnInstall")?.classList.add("hidden");
}
if (window.navigator.standalone === true) {
  $("btnInstall")?.classList.add("hidden");
}

/* =========================
   RESPONSIVE & MOBILE LAYOUT
   ========================= */
export function adjustMobileLayout() {
  const isMobile = window.innerWidth <= 767;
  const $summary = $("#summaryBar");
  const $progAll = $("#summaryProgressAll");
  const $modulesBar = document.querySelector(".modulesBar");
  const $logoBox = document.querySelector(".logoBox");

  if (!$summary || !$progAll || !$modulesBar) return;

  const alreadyMobile = $summary.dataset.mobilePlaced === "1";

  if (isMobile && !alreadyMobile) {
    const $row = document.createElement("div");
    $row.className = "summaryRow";
    $modulesBar.after($row);

    const $pillsRow = document.createElement("div");
    $pillsRow.className = "pillsRow";
    $pillsRow.appendChild($summary);
    $row.appendChild($pillsRow);

    const $bottomRow = document.createElement("div");
    $bottomRow.className = "summaryBottomRow";
    $bottomRow.appendChild($progAll);
    if ($logoBox) {
      $logoBox.classList.add("logo-moved");
      $bottomRow.appendChild($logoBox);
    }
    $row.appendChild($bottomRow);

    $summary.dataset.mobilePlaced = "1";
    $progAll.dataset.mobilePlaced = "1";
    document.body.classList.add("layout-mobile");
  } else if (!isMobile && alreadyMobile) {
    const $userLabel = $("#activeUserLabel");
    const $subtitle = document.querySelector(".brandText > .t2:not(#activeUserLabel)");
    const $row = document.querySelector(".summaryRow");
    if ($row) {
      if ($summary && $logoBox) {
        $summary.appendChild($logoBox);
        $logoBox.classList.remove("logo-moved");
      }
      if ($subtitle) {
        $subtitle.after($summary);
        $summary.after($progAll);
      } else if ($userLabel) {
        $userLabel.closest(".titleRow").after($summary);
        $summary.after($progAll);
      }
      $row.remove();
    }
    delete $summary.dataset.mobilePlaced;
    delete $progAll.dataset.mobilePlaced;
    document.body.classList.remove("layout-mobile");
  }
}

let _pillLabelOriginals = null;
export function adjustSummaryLabels() {
  const isMobile = window.innerWidth <= 767;
  const pills = document.querySelectorAll("#summaryBar .summaryPill span");
  if (!_pillLabelOriginals) {
    _pillLabelOriginals = new Map();
    pills.forEach((el) => {
      _pillLabelOriginals.set(el, el.textContent);
    });
  }
  pills.forEach((el) => {
    const full = _pillLabelOriginals.get(el);
    if (isMobile) {
      const short = el.getAttribute("data-short");
      if (short) el.textContent = short;
    } else {
      if (full) el.textContent = full;
    }
  });
}

export function setupRoomIndexAutoHide() {
  const idx = document.getElementById("roomIndex");
  if (!idx) return;
  idx.classList.remove("roomIndexHidden");
}

export function renderAll() {
  renderModules();
  renderRooms();
}

async function handleModalSaveOcc() {
  try {
    if (!state.modalRoom) return;
    if (isLocked()) { showLogin(); return; }
    if (!requireOnline()) return;

    const sess2 = getSession();
    if (!canReception(roleOf(sess2))) {
      toast("err", "Restringido", "Solo Recepcion puede poner OCUPADO.");
      return;
    }

    const adultsInput = $("adultsInput");
    const kidsInput = $("kidsInput");
    const obsInput = $("obsInput");
    const modalSave = $("modalSave");

    const adultsVal = clampNonNegInt(adultsInput.value);
    if (adultsVal < 1) {
      toast("err", "Falta adulto", "Debe haber al menos 1 adulto para ocupar.");
      adultsInput.focus();
      return;
    }

    modalSave.disabled = true;
    try {
      await updateRoom(state.modalRoom.modulo_id, state.modalRoom.etiqueta, {
        estado: "ocupado",
        adultos: adultsVal,
        ninos: clampNonNegInt(kidsInput.value),
        observaciones: appendActionObs(String(obsInput.value || "").trim(), "OCUPADO", getActor()?.name || "Sistema"),
        camarera_asignada: null
      });

      toast("ok", "Actualizado", `${state.modalRoom.etiqueta} -> OCUPADO`);
      closeOccModal();
    } finally {
      modalSave.disabled = false;
    }
  } catch (err) {
    toast("err", "Error", err.message || "No se pudo guardar");
  }
}

async function refreshOnResume() {
  if (isLoginVisible()) return;
  if (!state.activeModuleId) return;
  try {
    await loadRooms(state.activeModuleId);
    renderRooms();
    updateSummaryCounts();
  } catch {}
}

/* =========================
   INITIALIZATION
   ========================= */
(async function init() {
  initActivityListeners();
  initAudioUnlockListeners();
  setupGridDelegation();
  setupRoomIndexDelegation();
  setupModuleDelegation(renderRooms);
  setupNotifPanelDelegation();
  setupRoomSearch();
  setupModalEvents(handleModalSaveOcc);
  setupLoginEvents(async () => {
    await bootData();
    renderAll();
    renderActiveUser();
    adjustMobileLayout();
    adjustSummaryLabels();
  }, renderMenuModules);

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
      openDecoradaForm(state.activeModuleId);
    });
  }

  setInterval(() => {
    if (isLocked() && !isLoginVisible()) {
      unsubscribeFromPush();
      showLogin();
    }
  }, 8000);

  setInterval(updateTimersLive, 1000);
  setInterval(syncServerTime, 5 * 60 * 1000);

  document.addEventListener("visibilitychange", refreshOnResume);
  window.addEventListener("focus", refreshOnResume);
  window.addEventListener("pageshow", refreshOnResume);
  window.addEventListener("online", refreshOnResume);

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      adjustMobileLayout();
      adjustSummaryLabels();
    }, 200);
  });

  initSocket();
  await syncServerTime();

  if (typeof window.update === "function") window.update();

  if (localStorage.getItem(LS_FORCE_LOGIN) === "1" || isLocked()) {
    showLogin();
    return;
  }

  try {
    await bootData();
    renderAll();
    renderActiveUser();
    adjustMobileLayout();
    adjustSummaryLabels();
    setupRoomIndexAutoHide();
    requestNotifPermission();
  } catch (e) {
    console.error(e);
    toast("err", "Error", e.message || "No cargo data");
    showLogin();
  }
})();

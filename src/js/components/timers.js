/* ==========================================================================
   TIMERS LIVE COMPONENT
   ========================================================================== */

import { state } from "../state/store.js";
import { fmtDur, msSince } from "../utils/date.js";
import { roomKey } from "../utils/normalize.js";
import { nowServerMs } from "../api/client.js";
import { $ } from "../utils/helpers.js";

let _cachedTimerEls = null;
let _cachedTimerMap = null;

function isLoginVisible() {
  const overlay = $("loginOverlay");
  return !!overlay && !overlay.classList.contains("hidden");
}

export function updateTimersLive() {
  if (document.hidden) return;
  if (isLoginVisible()) return;
  if (_cachedTimerEls && _cachedTimerEls.length === 0) return;

  if (!_cachedTimerEls) {
    _cachedTimerEls = document.querySelectorAll("[data-timer-roomkey]");
    _cachedTimerMap = new Map();
    state.roomsCache.forEach(arr => {
      if (Array.isArray(arr)) {
        arr.forEach(r => _cachedTimerMap.set(roomKey(r.modulo_id, r.etiqueta), r));
      }
    });
  }

  const els = _cachedTimerEls;
  const data = _cachedTimerMap;
  const currentServerMs = nowServerMs();

  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    const k = el.getAttribute("data-timer-roomkey");
    const type = el.getAttribute("data-timer-type");
    const r = data.get(k);
    let iso = null;
    if (r) {
      if (type === "lista") iso = r.desde;
      else if (type === "limpieza") iso = r.inicio_limpieza;
      else if (type === "inspeccion") iso = r.fin_limpieza;
      else if (type === "repaso") iso = r.inicio_repaso;
    }
    const next = iso ? fmtDur(msSince(iso, currentServerMs)) : "0m 00s";
    if (el._lastText !== next) {
      el.textContent = next;
      el._lastText = next;
    }
  }
}

export function invalidateTimerCache() {
  _cachedTimerEls = null;
  _cachedTimerMap = null;
}

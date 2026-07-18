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
   VERSION CONTROL
   ========================= */
window.APP_VERSION = "1.0.0";
window.__swReg = null;
window.__updateChecked = false;

window.update = async function () {
  if (window.__updateChecked) return;
  window.__updateChecked = true;

  try {
    var reg = window.__swReg;
    if (reg && typeof reg.update === 'function') {
      reg.update();
    }

    var resp = await fetch(API_BASE + 'api/version', { cache: 'no-cache' });
    if (!resp.ok) return; // SW devuelve 503 "Offline" cuando no hay red
    var ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return;
    var data = await resp.json();

    if (data.ok && data.version !== APP_VERSION) {
      var existing = document.getElementById('swUpdateToast');
      if (existing) return;
      var toast = document.createElement('div');
      toast.id = 'swUpdateToast';
      toast.className = 'swUpdateToast';
      toast.innerHTML = '<span class="swUpdateIcon">🔄</span><span class="swUpdateText">Nueva version ' + data.version + ' disponible.</span><button class="swUpdateBtn" onclick="location.reload()">Actualizar</button>';
      document.body.appendChild(toast);
    }
  } catch (e) {
    console.warn('[Update] No se pudo verificar version:', e);
  }
};

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

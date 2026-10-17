/* ==========================================================================
   GLOBAL STATE & STORE MANAGEMENT
   ========================================================================== */

export const APP_BASE = window.location.pathname
  .replace(/\/[^/]*$/, "/")
  .replace(/\/+$/, "");

export const API_BASE = `${window.location.origin}${APP_BASE}`;
export const LS_SESSION = "hk_session_v3";
export const LS_LAST_ACTIVITY = "hk_last_activity_ms";
export const LS_FORCE_LOGIN = "hk_force_login";
export const LS_ACTOR_CACHE = "hk_actor_cache_v1";
export const LS_LEGACY_USER_NAME = "hk_logged_user_name";
export const LS_LEGACY_USER_DEPT = "hk_logged_user_dept";
export const AUTOLOCK_MS = 3 * 60 * 60 * 1000;
export const LS_ACTIVE_MODULE = "hk_active_module_v1";
export const CLEANED_KEY = "hk_cleaned_rooms_v1";
export const LS_SW_UPDATE_DISMISSED = "hk_sw_update_dismissed_v1";

// Contenedor mutable para el estado global de la aplicación
export const state = {
  timeOffsetMs: 0,
  MODULES: [],
  modulesById: new Map(),
  activeModuleId: null,
  recentNotifications: [],
  roomsCache: new Map(),
  roomDataMap: new Map(),
  roomBtnMap: new Map(),
  selectedRoomKey: null,
  selectedRoomEl: null,
  roomSearchQuery: "",
  notifPanelOpen: false,
  menuOpen: false,
  modalRoom: null
};

export function rebuildModulesIndex() {
  state.modulesById = new Map();
  for (const m of state.MODULES) {
    state.modulesById.set(String(m.id), m);
  }
}

export function persistActiveModule(id) {
  try {
    if (id) localStorage.setItem(LS_ACTIVE_MODULE, String(id));
  } catch {}
}

export function loadPersistedActiveModule() {
  try {
    return localStorage.getItem(LS_ACTIVE_MODULE);
  } catch {
    return null;
  }
}

export function loadCleanedMap() {
  try {
    return JSON.parse(localStorage.getItem(CLEANED_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveCleanedMap(map) {
  try {
    localStorage.setItem(CLEANED_KEY, JSON.stringify(map));
  } catch {}
}

/* =========================
   ACTIVITY TRACKING
   ========================= */
let _lastActivityWrite = 0;
let _lastActivityCache = 0;

export function _readLastActivityFromStorage() {
  const v = Number(localStorage.getItem(LS_LAST_ACTIVITY) || "0");
  _lastActivityCache = v;
  return v;
}

export function setActivity() {
  const now = Date.now();
  if (now - _lastActivityWrite < 10000) return;
  _lastActivityWrite = now;
  localStorage.setItem(LS_LAST_ACTIVITY, String(now));
  _lastActivityCache = now;
}

export function initActivityListeners() {
  ["click", "keydown", "touchstart"].forEach(ev => {
    window.addEventListener(ev, () => setActivity(), { passive: true });
  });
}

/* =========================
   SESSION & ACTOR
   ========================= */
export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(LS_SESSION) || "null");
  } catch {
    return null;
  }
}

export function setSession(sess) {
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

export function clearSession() {
  localStorage.removeItem(LS_SESSION);
  localStorage.removeItem(LS_LAST_ACTIVITY);
  localStorage.removeItem(LS_ACTOR_CACHE);
  localStorage.removeItem(LS_LEGACY_USER_NAME);
  localStorage.removeItem(LS_LEGACY_USER_DEPT);
  _lastActivityCache = 0;
}

export function getActor() {
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

export function actorDisplay() {
  const a = getActor();
  if (!a?.name) return "Sistema";
  return a.dept ? `${a.name} - ${a.dept}` : a.name;
}

/* =========================
   ROLES & PERMISSIONS
   ========================= */
export function normalizeDept(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function roleOf(sess) {
  const d = normalizeDept(sess?.dept);
  if (d === "administrador" || d === "admin") return "ADMIN";
  if (d.includes("gerencia")) return "GERENCIA";
  if (d.includes("reportes")) return "REPORTES";
  if (d.includes("ama") || d.includes("camar") || d.includes("limp") || d.includes("housekeeping")) return "AMA_LLAVES";
  return "RECEPCION";
}

export function canReception(role) {
  return role === "RECEPCION" || role === "ADMIN";
}

export function canUseMantenimiento(role) {
  return canReception(role) || role === "AMA_LLAVES";
}

export function canUseLiberar(role) {
  return canReception(role) || role === "AMA_LLAVES";
}

export function canUseDecorada(role) {
  return role === "AMA_LLAVES" || role === "ADMIN";
}

export function canViewReports(role) {
  return role === "ADMIN" || role === "GERENCIA" || role === "REPORTES";
}

export function isReadOnlyRole(role) {
  return role === "GERENCIA" || role === "REPORTES";
}

export function isAdmin(role) {
  return role === "ADMIN";
}

export function isLocked() {
  const sess = getSession();
  if (!sess) return true;
  if (!_lastActivityCache) _readLastActivityFromStorage();
  if (_lastActivityCache && (Date.now() - _lastActivityCache) > AUTOLOCK_MS) return true;
  return false;
}

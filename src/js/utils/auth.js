/* ==========================================================================
   AUTHENTICATION & SESSION UTILITIES (UNIFIED ACROSS ALL VIEWS)
   ========================================================================== */

export const LS_SESSION = "hk_session_v3";
export const LS_ACTOR_CACHE = "hk_actor_cache_v1";
export const LS_LEGACY_USER_NAME = "hk_logged_user_name";
export const LS_LEGACY_USER_DEPT = "hk_logged_user_dept";

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
  localStorage.removeItem(LS_ACTOR_CACHE);
  localStorage.removeItem(LS_LEGACY_USER_NAME);
  localStorage.removeItem(LS_LEGACY_USER_DEPT);
}

export function getAuthToken() {
  const sess = getSession();
  return sess?.token || null;
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

export function isReadOnlyRole(roleOrDept) {
  const s = String(roleOrDept || "").toLowerCase();
  return s === "gerencia" || s === "reportes" || s.includes("gerencia") || s.includes("reportes");
}

export function isAdmin(role) {
  return role === "ADMIN";
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

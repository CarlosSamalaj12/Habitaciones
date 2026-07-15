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

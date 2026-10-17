/* ==========================================================================
   LOGIN, USER SESSION & HEADER MENU COMPONENT
   ========================================================================== */

import {
  state, getSession, setSession, setActivity, isLocked, roleOf,
  isAdmin, canUseDecorada, canViewReports, LS_FORCE_LOGIN
} from "../state/store.js";
import { loadLoginUsers, apiPOST, requireOnline } from "../api/client.js";
import { toast } from "../notifications/toast.js";
import { unsubscribeFromPush, requestNotifPermission } from "../notifications/push.js";
import { $ } from "../utils/helpers.js";
import { renderIcon } from "./icons.js";

export function showLogin() {
  const overlay = $("loginOverlay");
  if (!overlay) return;
  if (!overlay.classList.contains("hidden")) {
    return;
  }
  overlay.classList.remove("hidden");
  $("loginErr")?.classList.add("hidden");
  const pass = $("loginPass");
  if (pass) pass.value = "";
  localStorage.setItem(LS_FORCE_LOGIN, "1");
  loadLoginUsers();
  $("loginUser")?.focus();
}

export function hideLogin() {
  $("loginOverlay")?.classList.add("hidden");
  localStorage.removeItem(LS_FORCE_LOGIN);
}

export function isLoginVisible() {
  const overlay = $("loginOverlay");
  return !!overlay && !overlay.classList.contains("hidden");
}

export function updateDecoradaUI() {
  const btn = $("btnDecorada");
  if (!btn) return;
  const sess = getSession();
  const role = roleOf(sess);
  if (sess?.name && canUseDecorada(role)) btn.classList.remove("hidden");
  else btn.classList.add("hidden");
}

export function updateAdminUI() {
  const btnAdmin = $("btnAdmin");
  const btnReportes = $("btnReportes");
  const btnEditarReg = $("btnEditarReg");
  const menuBtnReportes = $("menuBtnReportes");
  const menuBtnEditarReg = $("menuBtnEditarReg");
  const menuBtnAdmin = $("menuBtnAdmin");
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
  if (menuBtnReportes) {
    if (sess?.name && canViewReports(role)) menuBtnReportes.classList.remove("hidden");
    else menuBtnReportes.classList.add("hidden");
  }
  if (menuBtnEditarReg) {
    if (sess?.name && canViewReports(role)) menuBtnEditarReg.classList.remove("hidden");
    else menuBtnEditarReg.classList.add("hidden");
  }
  if (menuBtnAdmin) {
    if (visible) menuBtnAdmin.classList.remove("hidden");
    else menuBtnAdmin.classList.add("hidden");
  }
}

export function renderActiveUser() {
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

export function openAdminPanel() {
  if (isLocked()) { showLogin(); return; }
  const role = roleOf(getSession());
  if (!isAdmin(role)) {
    toast("err", "Restringido", "Solo administrador puede acceder.");
    return;
  }
  window.location.href = "./Admin.html";
}

export function openReportes() {
  if (isLocked()) { showLogin(); return; }
  window.location.href = "./Reportes.html";
}

export function openEditarRegistros() {
  if (isLocked()) { showLogin(); return; }
  window.location.href = "./EditarRegistros.html";
}

export function updateMenuUser() {
  const nameEl = $("menuUserName");
  const roleEl = $("menuUserRole");
  const avatarEl = $("menuUserAvatar");
  if (!nameEl) return;
  const sess = getSession();
  if (sess?.name) {
    nameEl.textContent = sess.name;
    const role = roleOf(sess);
    const roleLabels = { ADMIN: "Administrador", GERENCIA: "Gerencia", REPORTES: "Reportes", AMA_LLAVES: "Ama de Llaves", RECEPCION: "Recepcion" };
    roleEl.textContent = roleLabels[role] || role;
    const avatars = {
      ADMIN: renderIcon("settings", { size: 22, color: "#94A3B8" }),
      GERENCIA: renderIcon("clipboard", { size: 22, color: "#FBBF24" }),
      REPORTES: renderIcon("chart", { size: 22, color: "#38BDF8" }),
      AMA_LLAVES: renderIcon("broom", { size: 22, color: "#C084FC" }),
      RECEPCION: renderIcon("key", { size: 22, color: "#34D399" })
    };
    if (avatarEl) avatarEl.innerHTML = avatars[role] || renderIcon("user", { size: 22, color: "#F472B6" });
  } else {
    nameEl.textContent = "Sin sesion";
    roleEl.textContent = "-";
    if (avatarEl) avatarEl.innerHTML = renderIcon("user", { size: 22, color: "#94A3B8" });
  }
}

export function toggleMenu(renderMenuModulesFn) {
  state.menuOpen = !state.menuOpen;
  const dropdown = $("menuDropdown");
  const btn = $("btnMenu");
  if (!dropdown || !btn) return;
  if (state.menuOpen) {
    dropdown.classList.remove("hidden");
    btn.classList.add("open");
    if (window.innerWidth <= 767) {
      const rect = btn.getBoundingClientRect();
      const ddWidth = dropdown.offsetWidth || 320;
      const viewportW = window.innerWidth;
      let left = rect.left;
      if (left + ddWidth > viewportW - 8) {
        left = Math.max(8, rect.right - ddWidth);
      }
      dropdown.style.top = (rect.bottom + 6) + "px";
      dropdown.style.left = left + "px";
      dropdown.style.right = "auto";
    } else {
      dropdown.style.top = "";
      dropdown.style.right = "";
      dropdown.style.left = "";
    }
    if (typeof renderMenuModulesFn === "function") renderMenuModulesFn();
  } else {
    dropdown.classList.add("hidden");
    btn.classList.remove("open");
  }
}

export function closeMenu() {
  if (!state.menuOpen) return;
  state.menuOpen = false;
  const dropdown = $("menuDropdown");
  const btn = $("btnMenu");
  if (dropdown) dropdown.classList.add("hidden");
  if (btn) btn.classList.remove("open");
}

export function setupLoginEvents(onLoginSuccess, renderMenuModulesFn) {
  const btnLogin = $("btnLogin");
  const loginPass = $("loginPass");
  const btnLock = $("btnLock");
  const btnAdmin = $("btnAdmin");
  const btnReportes = $("btnReportes");
  const btnEditarReg = $("btnEditarReg");
  const btnMenu = $("btnMenu");
  const menuBtnLock = $("menuBtnLock");
  const menuBtnReportes = $("menuBtnReportes");
  const menuBtnEditarReg = $("menuBtnEditarReg");
  const menuBtnAdmin = $("menuBtnAdmin");
  const dropdown = $("menuDropdown");

  btnAdmin?.addEventListener("click", openAdminPanel);
  btnReportes?.addEventListener("click", openReportes);
  btnEditarReg?.addEventListener("click", openEditarRegistros);

  btnMenu?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu(renderMenuModulesFn);
  });

  document.addEventListener("click", (e) => {
    if (!state.menuOpen) return;
    if (!dropdown || !btnMenu) return;
    if (!dropdown.contains(e.target) && !btnMenu.contains(e.target)) {
      closeMenu();
    }
  });

  menuBtnLock?.addEventListener("click", () => {
    closeMenu();
    unsubscribeFromPush();
    showLogin();
  });
  menuBtnReportes?.addEventListener("click", () => {
    closeMenu();
    openReportes();
  });
  menuBtnEditarReg?.addEventListener("click", () => {
    closeMenu();
    openEditarRegistros();
  });
  menuBtnAdmin?.addEventListener("click", () => {
    closeMenu();
    openAdminPanel();
  });

  btnLock?.addEventListener("click", () => {
    unsubscribeFromPush();
    showLogin();
  });

  btnLogin?.addEventListener("click", async () => {
    try {
      const selEl = $("loginUser");
      if (!selEl || selEl.options.length <= 1) {
        $("loginErr")?.classList.remove("hidden");
        toast("err", "Error", "Usuarios no cargados");
        return;
      }

      const selName = String(selEl.value || "").trim();
      if (!selName) {
        $("loginErr")?.classList.remove("hidden");
        toast("err", "Error", "Selecciona tu usuario");
        selEl.focus();
        return;
      }
      const clave = String(loginPass?.value || "").trim();
      if (!clave) {
        $("loginErr")?.classList.remove("hidden");
        toast("err", "Error", "Ingresa tu contrasena");
        loginPass?.focus();
        return;
      }
      if (!requireOnline()) return;

      btnLogin.disabled = true;
      const resp = await apiPOST("/api/login", { nombre: selName, clave });
      const u = resp.user;
      if (String(u.name) !== selName) {
        $("loginErr")?.classList.remove("hidden");
        toast("err", "Error", "La contrasena no corresponde al usuario seleccionado");
        loginPass?.focus();
        return;
      }

      setSession({ id: u.id, name: u.name, dept: u.dept, token: resp.token, at: Date.now() });
      setActivity();
      hideLogin();
      requestNotifPermission();
      toast("ok", "Bienvenido", `${u.name} - ${u.dept}`);

      if (typeof onLoginSuccess === "function") {
        await onLoginSuccess();
      }
    } catch (e) {
      $("loginErr")?.classList.remove("hidden");
      toast("err", "Error", e.message || "Contrasena incorrecta");
      loginPass?.focus();
    } finally {
      btnLogin.disabled = false;
    }
  });

  loginPass?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnLogin?.click();
  });
}

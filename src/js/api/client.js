/* ==========================================================================
   API HTTP CLIENT & SERVER COMMUNICATIONS
   ========================================================================== */

import { API_BASE, state, rebuildModulesIndex, loadPersistedActiveModule } from "../state/store.js";
import { normalizeRoom } from "../utils/normalize.js";
import { toast } from "../notifications/toast.js";
import { $ } from "../utils/helpers.js";

export function requireOnline() {
  if (!navigator.onLine) {
    toast("err", "Sin conexion", "No hay conexion a internet. Verifica tu senal y vuelve a intentar.");
    return false;
  }
  return true;
}

export async function apiGET(path) {
  if (!navigator.onLine) throw new Error("Sin conexion a internet. Verifica tu senal.");
  const r = await fetch(`${API_BASE}${path}`, { method: "GET" });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error(j?.error || `GET ${path} failed`);
  if (j.ok === false) throw new Error(j.error || `GET ${path} failed`);
  return j;
}

export async function apiPOST(path, body) {
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

export function nowServerMs() {
  return Date.now() + state.timeOffsetMs;
}

export async function syncServerTime() {
  try {
    const r = await fetch(`${API_BASE}/api/time`, { method: "GET", cache: "no-store" });
    const j = await r.json().catch(() => null);
    const serverMs = Number(j?.serverMs);
    if (Number.isFinite(serverMs)) {
      state.timeOffsetMs = serverMs - Date.now();
    }
  } catch (e) {
    // no bloquear la app si falla el sync
  }
}

export async function loadModules() {
  const resp = await apiGET("/api/modules");
  state.MODULES = (resp.data || []).map(x => ({ id: String(x.id), descripcion: String(x.descripcion) }));
  rebuildModulesIndex();
  if (!state.MODULES.length) throw new Error("No hay modulos en BD");
  if (!state.activeModuleId) {
    const persisted = loadPersistedActiveModule();
    if (persisted && state.MODULES.some(m => String(m.id) === String(persisted))) {
      state.activeModuleId = String(persisted);
    } else {
      state.activeModuleId = String(state.MODULES[0].id);
    }
  }
}

export async function loadRooms(modulo_id) {
  const resp = await apiGET(`/api/rooms?modulo_id=${encodeURIComponent(String(modulo_id))}`);
  const rows = (resp.data || []).map(normalizeRoom);
  state.roomsCache.set(String(modulo_id), rows);
  return rows;
}

export async function bootData() {
  await loadModules();
  const moduleIds = state.MODULES.map(m => String(m.id));
  await Promise.all(moduleIds.map(id => loadRooms(id)));
}

let LOGIN_USERS_LOADING = false;

export async function loadLoginUsers() {
  if (LOGIN_USERS_LOADING) return;
  LOGIN_USERS_LOADING = true;
  try {
    const sel = $("loginUser");
    const btn = $("btnLogin");
    if (!sel) return;
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
  } catch (e) {
    console.warn("No se pudo cargar usuarios:", e);
    const sel = $("loginUser");
    if (sel) sel.innerHTML = `<option value="">Error cargando</option>`;
    toast("err", "Error", "No se pudieron cargar usuarios");
  } finally {
    const sel = $("loginUser");
    if (sel) sel.disabled = false;
    const btn = $("btnLogin");
    if (btn) btn.disabled = false;
    LOGIN_USERS_LOADING = false;
  }
}

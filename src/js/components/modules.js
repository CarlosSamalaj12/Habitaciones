/* ==========================================================================
   HOTEL MODULES & ROOM INDEX COMPONENT
   ========================================================================== */

import { state, getSession, persistActiveModule } from "../state/store.js";
import { loadRooms } from "../api/client.js";
import { updateMenuUser, closeMenu } from "./login.js";
import { $ } from "../utils/helpers.js";

export function renderMenuModules() {
  updateMenuUser();
  const container = $("menuModules");
  if (!container) return;
  container.innerHTML = "";
  state.MODULES.forEach(m => {
    const b = document.createElement("button");
    b.className = "menuModuleItem" + (String(m.id) === String(state.activeModuleId) ? " active" : "");
    b.innerHTML = `<span class="menuModDot"></span>${m.descripcion}`;
    b.dataset.moduloId = String(m.id);
    container.appendChild(b);
  });
}

export function renderModules() {
  const row = $("modulesRow");
  if (!row) return;
  row.innerHTML = "";

  state.MODULES.forEach(m => {
    const b = document.createElement("button");
    b.className = "btnModule" + (String(m.id) === String(state.activeModuleId) ? " active" : "");
    b.textContent = m.descripcion;
    b.dataset.moduloId = String(m.id);
    row.appendChild(b);
  });

  const cur = state.modulesById.get(String(state.activeModuleId));
  const selMod = $("selModule");
  if (selMod) selMod.textContent = cur?.descripcion || "-";
}

export async function selectModule(id, opts = {}, renderRoomsFn) {
  state.activeModuleId = String(id);
  persistActiveModule(state.activeModuleId);
  const cur = state.modulesById.get(state.activeModuleId);
  const selMod = $("selModule");
  if (selMod) selMod.textContent = cur?.descripcion || "-";
  if (!state.roomsCache.get(state.activeModuleId)) {
    await loadRooms(state.activeModuleId);
  }
  renderModules();
  renderMenuModules();
  if (typeof renderRoomsFn === "function") {
    renderRoomsFn();
  }
  if (opts.closeMenu) closeMenu();
}

export function scrollToRoomCard(k) {
  const card = state.roomBtnMap.get(k);
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.style.transition = "box-shadow .2s";
  card.style.boxShadow = "0 0 0 3px rgba(124,58,237,.6), 0 20px 60px rgba(0,0,0,.5)";
  setTimeout(() => { card.style.boxShadow = ""; }, 800);
}

export function setupRoomIndexDelegation() {
  const roomIndex = document.getElementById("roomIndex");
  if (!roomIndex || roomIndex._delegated) return;
  roomIndex._delegated = true;
  roomIndex.addEventListener("click", (e) => {
    const btn = e.target.closest(".roomIndexBtn");
    if (!btn) return;
    const k = btn.dataset.roomKey;
    if (k) scrollToRoomCard(k);
  });
}

export function setupModuleDelegation(renderRoomsFn) {
  const menu = $("menuModules");
  if (menu && !menu._delegated) {
    menu._delegated = true;
    menu.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-modulo-id]");
      if (!btn) return;
      selectModule(btn.dataset.moduloId, { closeMenu: true }, renderRoomsFn);
    });
  }
  const row = $("modulesRow");
  if (row && !row._delegated) {
    row._delegated = true;
    row.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-modulo-id]");
      if (!btn) return;
      selectModule(btn.dataset.moduloId, {}, renderRoomsFn);
    });
  }
}

export function openInspeccion(modulo_id, etiqueta) {
  const sess = getSession() || {};
  const url = new URL("./Inspeccion.html", window.location.href);
  url.searchParams.set("m", String(modulo_id));
  url.searchParams.set("r", String(etiqueta));
  const modName = state.MODULES.find(x => String(x.id) === String(modulo_id))?.descripcion || "";
  if (modName) url.searchParams.set("mn", modName);
  url.searchParams.set("u", sess.name || "");
  url.searchParams.set("d", sess.dept || "");
  window.location.href = url.toString();
}

export function openDecoradaForm(modulo_id) {
  const sess = getSession() || {};
  const url = new URL("./Decorada.html", window.location.href);
  if (modulo_id != null) url.searchParams.set("m", String(modulo_id));
  const modName = state.MODULES.find(x => String(x.id) === String(modulo_id))?.descripcion || "";
  if (modName) url.searchParams.set("mn", modName);
  url.searchParams.set("u", sess.name || "");
  url.searchParams.set("d", sess.dept || "");
  window.location.href = url.toString();
}

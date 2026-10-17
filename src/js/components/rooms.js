/* ==========================================================================
   ROOMS COMPONENT (RENDER, ACTIONS, SUMMARY, SEARCH)
   ========================================================================== */

import {
  state, getSession, roleOf, isReadOnlyRole, canReception,
  canUseMantenimiento, canUseLiberar, isLocked, getActor,
  loadCleanedMap, saveCleanedMap
} from "../state/store.js";
import { nowLocalMySQL, parseAnyDate, msSince, fmtDur, appendActionObs } from "../utils/date.js";
import { normalizeRoom, roomKey } from "../utils/normalize.js";
import { toast } from "../notifications/toast.js";
import { playNotificationSound } from "../notifications/sound.js";
import { addRecentNotification, showNotification } from "../notifications/push.js";
import { openOccModal, openObsModal, confirmDialog } from "./modals.js";
import { openInspeccion } from "./modules.js";
import { showLogin } from "./login.js";
import { invalidateTimerCache, updateTimersLive } from "./timers.js";
import { apiPOST, loadRooms, requireOnline } from "../api/client.js";
import { isDuplicate, $ } from "../utils/helpers.js";

const ROOM_CLASSES = {
  ocupado: { cls: "ocupado", badge: "OCUPADO" },
  "ocupada limpia": { cls: "ocupado", badge: "OCUPADO" },
  lista: { cls: "lista", badge: "LISTA PARA LIMPIEZA" },
  limpieza: { cls: "limpieza cleaning", badge: "LIMPIEZA" },
  inspeccion: { cls: "inspeccion", badge: "INSPECCION" },
  mantenimiento: { cls: "mantenimiento", badge: "MANT" },
  repaso: { cls: "repaso", badge: "REPASO" },
};
const ROOM_CLASS_DEFAULT = { cls: "libre", badge: "LIBRE" };

export function roomClassByEstado(estado) {
  return ROOM_CLASSES[estado] || ROOM_CLASS_DEFAULT;
}

const ICONS = {
  ocupado: `<svg class="raIcon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="6" r="4"/><path d="M4 22c0-3.3 2.7-6 6-6h4c3.3 0 6 2.7 6 6z"/></svg>`,
  limpieza: `<svg class="raIcon" viewBox="0 0 24 24" aria-hidden="true"><rect x="14" y="3" width="3" height="12" rx="1.5"/><path d="M7 15h11l-2 8H9l-2-8z"/></svg>`,
  mant: `<svg class="raIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4.5l-3.5 3.5 2 2-7 7a1.5 1.5 0 0 0 2.1 2.1l7-7 2 2 3.5-3.5-4.1-4.1z"/></svg>`,
  repaso: `<svg class="raIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1 9 9 1-9 1-1 9-1-9-9-1 9-1z"/></svg>`,
  liberar: `<svg class="raIcon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="12" width="16" height="10" rx="2"/><path d="M8 12V7a4 4 0 0 1 8 0h-2a2 2 0 0 0-4 0v5H8z"/><circle cx="12" cy="17" r="1.5"/></svg>`,
  prio: `<svg class="raIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l-1 12h2l-1-12z"/><circle cx="12" cy="20" r="2"/></svg>`
};

const STATUS_COUNT_KEY = {
  ocupado: "sucias",
  limpieza: "limpieza",
  inspeccion: "inspeccion",
  lista: "lista",
  mantenimiento: "mantenimiento",
  repaso: "repaso",
  libre: "limpias",
};

export function calcCounts(rooms) {
  const counts = { sucias: 0, limpieza: 0, inspeccion: 0, lista: 0, limpias: 0, limpiadas: 0, mantenimiento: 0, prioridad: 0, repaso: 0 };
  rooms.forEach(r => {
    const key = STATUS_COUNT_KEY[r.estado];
    if (key) counts[key]++;
    if (r.prioAlta) counts.prioridad++;
    if (r.estado === "libre" || r.estado === "ocupada limpia" ||
        (r.estado === "ocupado" && String(r.tipo_limpieza || "").toLowerCase() === "estadia" && r.fin_limpieza)) {
      counts.limpiadas++;
    }
  });
  return counts;
}

export function setSummary(counts, total) {
  const set = (key, val) => { const el = $(key); if (el) el.textContent = String(val); };
  set("sumSucias", counts.sucias);
  set("sumLimpieza", counts.limpieza);
  set("sumInspeccion", counts.inspeccion);
  set("sumLista", counts.lista);
  set("sumLimpiadas", counts.limpiadas);
  set("sumLimpias", counts.limpias);
  set("sumMant", counts.mantenimiento);
  set("sumRepaso", counts.repaso);
  set("sumPrio", counts.prioridad);
}

export function setProgressAll(counts, total) {
  const pct = total ? Math.round((counts.sucias / total) * 100) : 0;
  const progText = $("sumProgTextAll");
  if (progText) progText.textContent = `${counts.sucias}/${total} (${pct}%)`;
  const progFill = $("sumProgFillAll");
  if (progFill) progFill.style.width = `${pct}%`;
}

function _flushSummaryCounts() {
  const rooms = state.roomsCache.get(String(state.activeModuleId)) || [];
  const counts = calcCounts(rooms);
  setSummary(counts, rooms.length || 0);

  const allRooms = [];
  state.roomsCache.forEach(arr => { if (Array.isArray(arr)) allRooms.push(...arr); });
  const allCounts = calcCounts(allRooms);
  setProgressAll(allCounts, allRooms.length || 0);
}

let _summaryRafQueued = false;
export function updateSummaryCounts() {
  if (_summaryRafQueued) return;
  _summaryRafQueued = true;
  const flush = () => {
    _summaryRafQueued = false;
    _flushSummaryCounts();
  };
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(flush);
  } else {
    setTimeout(flush, 16);
  }
}

let renderRoomsQueued = false;
export function scheduleRenderRooms() {
  if (renderRoomsQueued) return;
  renderRoomsQueued = true;
  const flush = () => {
    renderRoomsQueued = false;
    renderRooms();
  };
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(flush);
  } else {
    setTimeout(flush, 16);
  }
}

export function renderRooms() {
  const grid = $("roomsGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();

  const sess = getSession();
  const role = roleOf(sess);

  const isGlobalSearch = !!state.roomSearchQuery;
  let rooms;
  if (isGlobalSearch) {
    rooms = [];
    state.roomsCache.forEach(arr => { if (Array.isArray(arr)) rooms.push(...arr); });
  } else {
    rooms = state.roomsCache.get(String(state.activeModuleId)) || [];
    if (!rooms.length) {
      grid.innerHTML = '<div class="emptyRooms">No hay habitaciones en este modulo.</div>';
      return;
    }
  }

  let filteredRooms = rooms;
  if (state.roomSearchQuery) {
    filteredRooms = rooms.filter(r => {
      const etiqueta = String(r.etiqueta).toLowerCase();
      return etiqueta.includes(state.roomSearchQuery);
    });
    if (!filteredRooms.length) {
      grid.innerHTML = '<div class="emptyRooms">Sin resultados para "' + state.roomSearchQuery + '" en ningun modulo</div>';
      updateSummaryCounts();
      return;
    }
  }

  const cleanedMap = loadCleanedMap();
  let cleanedDirty = false;
  const sorted = [...filteredRooms].sort((a, b) => String(a.etiqueta).localeCompare(String(b.etiqueta), "es", { numeric: true }));

  state.roomDataMap.clear();
  state.roomBtnMap.clear();
  for (const r of sorted) {
    state.roomDataMap.set(roomKey(r.modulo_id, r.etiqueta), normalizeRoom(r));
  }

  sorted.forEach(room => {
    const k = roomKey(room.modulo_id, room.etiqueta);
    const { cls, badge } = roomClassByEstado(room.estado);
    const roomModuleName = state.modulesById.get(String(room.modulo_id))?.descripcion || "";

    let cleanedAt = cleanedMap[k] || null;
    if (room.estado !== "libre" && cleanedAt) {
      delete cleanedMap[k];
      cleanedDirty = true;
      cleanedAt = null;
    }
    const cleanTagHTML =
      (room.estado === "libre" && cleanedAt) ? `<div class="cleanTag">LIMPIADA</div>` :
      (room.estado === "ocupada limpia") ? `<div class="cleanTag occupiedClean">OCUPADA LIMPIA</div>` :
      (room.estado === "ocupado" && String(room.tipo_limpieza || "").toLowerCase() === "estadia" && room.fin_limpieza)
        ? `<div class="cleanTag occupiedClean">OCUPADA LIMPIA</div>`
        : "";
    const decoradaTagHTML = Number(room.decorada) === 1
      ? `<div class="decoradaTag" title="Habitacion decorada"><span class="decoradaEmoji" aria-hidden="true">*</span><span class="decoradaText">DECORADA</span></div>`
      : "";
    const prioHigh = !!room.prioAlta;
    const badgeText = (prioHigh && (room.estado === "libre" || room.estado === "lista")) ? "PRIORIDAD" : badge;

    const btn = document.createElement("button");
    btn.className = `roomBtn ${cls}${prioHigh ? " prioHigh" : ""}`;
    btn.type = "button";

    const obsChips = (room.observaciones && room.observaciones.trim())
      ? `<div class="obsBar"><span class="obsChip">Observaciones</span><button class="obsPeekBtn" type="button" title="Ver observaciones">Ver</button></div>`
      : "";

    let timerHTML = "";
    const prioIconHTML = prioHigh ? `<div class="prioIcon">&#9889;</div>` : "";
    const desdeDate = parseAnyDate(room.desde);
    const inicioLimpDate = parseAnyDate(room.inicio_limpieza);
    const finLimpDate = parseAnyDate(room.fin_limpieza);
    const inicioRepasoDate = parseAnyDate(room.inicio_repaso);

    if (room.estado === "lista" && desdeDate) {
      timerHTML = `
        <div class="timerBadge">
          <img class="timerIcon" src="./cronografo.png" alt="" />
          ${prioIconHTML}
          <div class="timerText" data-timer-roomkey="${k}" data-timer-type="lista">${fmtDur(msSince(desdeDate))}</div>
        </div>`;
    }
    if (room.estado === "limpieza" && inicioLimpDate) {
      timerHTML = `
        <div class="timerBadge">
          <img class="timerIcon" src="./cronografo.png" alt="" />
          ${prioIconHTML}
          <div class="timerText" data-timer-roomkey="${k}" data-timer-type="limpieza">${fmtDur(msSince(inicioLimpDate))}</div>
        </div>`;
    }
    if (room.estado === "inspeccion" && finLimpDate) {
      timerHTML = `
        <div class="timerBadge">
          <img class="timerIcon" src="./cronografo.png" alt="" />
          ${prioIconHTML}
          <div class="timerText" data-timer-roomkey="${k}" data-timer-type="inspeccion">${fmtDur(msSince(finLimpDate))}</div>
        </div>`;
    }
    if (room.estado === "repaso" && inicioRepasoDate) {
      timerHTML = `
        <div class="timerBadge">
          <img class="timerIcon" src="./cronografo.png" alt="" />
          ${prioIconHTML}
          <div class="timerText" data-timer-roomkey="${k}" data-timer-type="repaso">${fmtDur(msSince(inicioRepasoDate))}</div>
        </div>`;
    }

    const showOccupied = room.estado === "ocupado" || room.estado === "ocupada limpia" || room.estado === "lista";
    btn.dataset.roomKey = k;
    state.roomBtnMap.set(k, btn);
    btn.innerHTML = `
      ${timerHTML}
      <div class="badge">${badgeText}</div>
      ${cleanTagHTML}
      ${decoradaTagHTML}
      <div class="roomNum">${room.etiqueta}</div>
      <div class="roomState">${roomModuleName}</div>
      <div class="roomOcc">${(showOccupied) && (room.adultos > 0 || room.ninos > 0) ? `&#128101; ${room.adultos || 0} / ${room.ninos || 0}` : ""}</div>
      ${obsChips}

      <div class="roomDetails">
        <div class="detailBlock">
          <div class="detailBlockTitle">Observaciones</div>
          <ul class="detailList">
            <li>Estado: ${badgeText}</li>
            <li>${room.camarera_asignada ? `Camarera: ${room.camarera_asignada}` : "-"}</li>
          </ul>
          ${room.observaciones ? `<div class="detailObs">${room.observaciones}</div>` : `<div class="detailObs empty">Sin observaciones</div>`}
        </div>
      </div>

      <div class="roomActions">
        <button class="raBtn ocupado" data-action="ocupado" data-room-key="${k}" data-mobile-label="OCUP" aria-label="Ocupado">${ICONS.ocupado}</button>
        <button class="raBtn limpieza" data-action="limpieza" data-room-key="${k}" data-mobile-label="LIMP" aria-label="Lista / Iniciar limpieza">${ICONS.limpieza}</button>
        <button class="raBtn mant" data-action="mant" data-room-key="${k}" data-mobile-label="MANT" aria-label="Mantenimiento">${ICONS.mant}</button>
        <button class="raBtn liberar" data-action="liberar" data-room-key="${k}" data-mobile-label="LIBRE" aria-label="Liberar habitacion">${ICONS.liberar}</button>
        <button class="raBtn prio" data-action="prio" data-room-key="${k}" data-mobile-label="PRIO" aria-label="Prioridad limpieza">${ICONS.prio}</button>
        <button class="raBtn repaso" data-action="repaso" data-room-key="${k}" data-mobile-label="REP" aria-label="Repaso">${ICONS.repaso}</button>
      </div>
    `;

    if (state.selectedRoomKey === k) {
      state.selectedRoomEl = btn;
      btn.classList.add("selected");
    }

    const raBtns = btn.querySelectorAll(".raBtn");
    if (isReadOnlyRole(role)) {
      raBtns.forEach(b => { b.disabled = true; b.title = "Solo lectura"; });
    }
    if (!canUseLiberar(role)) {
      const bFree = btn.querySelector('[data-action="liberar"]');
      if (bFree) bFree.classList.add("hidden");
    }
    if (!canReception(role)) {
      const bPrio = btn.querySelector('[data-action="prio"]');
      const bRep = btn.querySelector('[data-action="repaso"]');
      if (bPrio) bPrio.classList.add("hidden");
      if (bRep) bRep.classList.add("hidden");
    }

    frag.appendChild(btn);
  });

  grid.appendChild(frag);

  const roomIndex = document.getElementById("roomIndex");
  if (roomIndex) {
    roomIndex.innerHTML = "";
    sorted.forEach(room => {
      const idxBtn = document.createElement("button");
      const { cls } = roomClassByEstado(room.estado);
      idxBtn.className = `roomIndexBtn ${cls}`;
      idxBtn.textContent = room.etiqueta;
      idxBtn.dataset.roomKey = roomKey(room.modulo_id, room.etiqueta);
      roomIndex.appendChild(idxBtn);
    });
  }

  if (cleanedDirty) saveCleanedMap(cleanedMap);

  updateSummaryCounts();
  invalidateTimerCache();
  updateTimersLive();
}

export function applyRoomUpdate(updatedRow, forceOldEstado, forceOldPrio) {
  const updated = normalizeRoom(updatedRow);
  const modId = String(updated.modulo_id);

  const arr = state.roomsCache.get(modId);
  if (arr) {
    const idx = arr.findIndex(x => String(x.etiqueta).toUpperCase() === String(updated.etiqueta).toUpperCase());
    if (idx >= 0) {
      const oldEstado = forceOldEstado !== undefined ? forceOldEstado : arr[idx].estado;
      const newEstado = updated.estado;
      const oldPrio = forceOldPrio !== undefined ? forceOldPrio : arr[idx].prioridad_limpieza;
      const newPrio = updated.prioridad_limpieza;
      
      arr[idx] = updated;
      
      const dedupKey = `socket:${modId}:${updated.etiqueta}:${newEstado}`;
      isDuplicate(dedupKey, 2000);
      
      if (oldEstado !== newEstado || oldPrio !== newPrio) {
        addRecentNotification(modId, updated.etiqueta, oldEstado, newEstado, oldPrio, newPrio);
      }
      
      scheduleRenderRooms();
      updateSummaryCounts();
      showNotification(updated.etiqueta, newEstado, oldPrio, newPrio);
      return;
    }
  }
  if (!state.roomsCache.has(modId)) {
    state.roomsCache.set(modId, []);
  }
  state.roomsCache.get(modId).push(updated);
  scheduleRenderRooms();
  updateSummaryCounts();
}

export async function updateRoom(modulo_id, etiqueta, patch, source = "app") {
  const cacheKey = String(modulo_id);
  const rooms = state.roomsCache.get(cacheKey) || [];
  const localRoom = rooms.find(r => String(r.etiqueta).toUpperCase() === String(etiqueta).toUpperCase());
  const expectedState = localRoom?.estado || null;
  const oldEstado = localRoom?.estado || null;
  const oldPrio = localRoom?.prioridad_limpieza || null;

  const nextEstado = patch.estado || expectedState;
  if (nextEstado) {
    const dedupKey = `socket:${modulo_id}:${etiqueta}:${nextEstado}`;
    isDuplicate(dedupKey, 2000);
  }

  try {
    const resp = await apiPOST("/api/room/update", { modulo_id, etiqueta, patch, expectedState, actor: getActor(), source });
    applyRoomUpdate(resp.data, oldEstado, oldPrio);
    return resp.data;
  } catch (err) {
    if (err.message && err.message.includes("DESACTUALIZADO")) {
      toast("err", "Pantalla desactualizada", `La habitación ${etiqueta} cambió de estado recientemente. Tu pantalla se actualizará.`);
      loadRooms(modulo_id).then(() => {
        renderRooms();
        updateSummaryCounts();
      }).catch(() => {});
    }
    throw err;
  }
}

/* =========================
   ROOM ACTIONS
   ========================= */
export function doOcupado(room, btn) {
  if (isLocked()) { showLogin(); return; }
  const role = roleOf(getSession());
  if (isReadOnlyRole(role)) {
    toast("err", "Restringido", "Este rol solo puede visualizar.");
    return;
  }
  if (!canReception(role)) {
    toast("err", "Restringido", "Solo Recepcion puede poner OCUPADO.");
    return;
  }
  openOccModal(room);
}

export async function doLimpieza(room, btn) {
  if (isLocked()) { showLogin(); return; }
  const role = roleOf(getSession());
  if (isReadOnlyRole(role)) {
    toast("err", "Restringido", "Este rol solo puede visualizar.");
    return;
  }

  const current = normalizeRoom(room);
  const role2 = roleOf(getSession());

  if (canReception(role2)) {
    if (current.estado !== "ocupado" && current.estado !== "ocupada limpia") {
      toast("err", "No permitido", "Solo podes poner LISTA cuando estaba OCUPADO.");
      return;
    }
    if (!requireOnline()) return;

    btn.disabled = true;
    try {
      await updateRoom(current.modulo_id, current.etiqueta, {
        estado: "lista",
        desde: nowLocalMySQL(),
        hora_listo_limpieza: nowLocalMySQL(),
        inicio_limpieza: null,
        fin_limpieza: null,
        camarera_asignada: null,
        tipo_limpieza: null,
        inspector_asignado: null,
        adultos: Number.isFinite(current.adultos) ? current.adultos : 0,
        ninos: Number.isFinite(current.ninos) ? current.ninos : 0,
        observaciones: appendActionObs(current.observaciones || "", "LISTA PARA LIMPIEZA", getActor()?.name || "Sistema")
      });
      toast("warn", "Lista para limpieza", `Habitacion ${current.etiqueta} lista.`);
    } catch (err) {
      toast("err", "Error", err.message || "No se pudo cambiar a LISTA");
    } finally {
      btn.disabled = false;
    }
    return;
  }

  if (role2 === "AMA_LLAVES") {
    if (current.estado === "repaso") {
      const ok = await confirmDialog(`¿Seguro de liberar la habitación ${current.etiqueta}?`, "Sí, liberar", true);
      if (!ok) return;
      if (!requireOnline()) return;
      btn.disabled = true;
      try {
        await updateRoom(current.modulo_id, current.etiqueta, {
          estado: "libre",
          repaso: null,
          inicio_repaso: null,
          desde: null,
          inicio_limpieza: null,
          fin_limpieza: null,
          camarera_asignada: null
        });
        toast("ok", "Habitacion liberada", `${current.etiqueta} -> LIBRE`);
      } catch (err) {
        toast("err", "Error", err.message || "No se pudo liberar");
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (current.estado !== "lista" && current.estado !== "limpieza" && current.estado !== "inspeccion") {
      toast("err", "No disponible", "Recepcion debe poner LISTA primero.");
      return;
    }
    try {
      openInspeccion(current.modulo_id, current.etiqueta);
    } catch (err) {
      toast("err", "Error", err.message || "No se pudo iniciar limpieza");
    }
  }
}

export async function doMant(room, btn) {
  if (isLocked()) { showLogin(); return; }
  const role = roleOf(getSession());
  if (isReadOnlyRole(role)) {
    toast("err", "Restringido", "Este rol solo puede visualizar.");
    return;
  }

  if (!canUseMantenimiento(role)) {
    toast("err", "Restringido", "Solo Recepcion o Ama de llaves puede gestionar MANTENIMIENTO.");
    return;
  }

  if (room.estado === "mantenimiento") {
    const confirmado = await confirmDialog(`¿Estás seguro de quitar la habitación ${room.etiqueta} de MANTENIMIENTO y dejarla LIBRE?`, "Sí, quitar mantenimiento", false);
    if (!confirmado) return;
    if (!requireOnline()) return;

    btn.disabled = true;
    try {
      await updateRoom(room.modulo_id, room.etiqueta, {
        estado: "libre",
        camarera_asignada: null,
        adultos: 0,
        ninos: 0,
        desde: null,
        inicio_limpieza: null,
        fin_limpieza: null,
        prioridad_limpieza: null,
        observaciones: appendActionObs(room.observaciones || "", "FIN MANTENIMIENTO", getActor()?.name || "Sistema")
      });
      toast("ok", "Mantenimiento finalizado", `Habitacion ${room.etiqueta} ahora está LIBRE.`);
    } catch (err) {
      toast("err", "Error", err.message || "No se pudo quitar mantenimiento");
    } finally {
      btn.disabled = false;
    }
    return;
  }

  if (room.estado !== "libre") {
    toast("err", "No permitido", "Solo podés poner MANTENIMIENTO si la habitación está LIBRE.");
    return;
  }
  if (!requireOnline()) return;

  const confirmado = await confirmDialog(`¿Estás seguro de poner la habitación ${room.etiqueta} en MANTENIMIENTO?`, "Sí, poner en mantenimiento", false);
  if (!confirmado) return;

  btn.disabled = true;
  try {
    await updateRoom(room.modulo_id, room.etiqueta, {
      estado: "mantenimiento",
      camarera_asignada: null,
      adultos: Number.isFinite(room.adultos) ? room.adultos : 0,
      ninos: Number.isFinite(room.ninos) ? room.ninos : 0,
      observaciones: appendActionObs(room.observaciones || "", "MANTENIMIENTO", getActor()?.name || "Sistema")
    });
    toast("warn", "Mantenimiento", `Habitacion ${room.etiqueta} en mantenimiento.`);
  } catch (err) {
    toast("err", "Error", err.message || "No se pudo poner mantenimiento");
  } finally {
    btn.disabled = false;
  }
}

export async function doRepaso(room, btn) {
  if (isLocked()) { showLogin(); return; }
  const role = roleOf(getSession());
  if (isReadOnlyRole(role)) {
    toast("err", "Restringido", "Este rol solo puede visualizar.");
    return;
  }
  if (!canReception(role)) {
    toast("err", "Restringido", "Solo Recepcion puede poner REPASO.");
    return;
  }
  if (room.estado !== "libre") {
    toast("err", "No permitido", "Solo se puede poner REPASO si esta LIBRE.");
    return;
  }
  if (!requireOnline()) return;

  btn.disabled = true;
  try {
    await updateRoom(room.modulo_id, room.etiqueta, {
      estado: "repaso",
      repaso: "si",
      inicio_repaso: nowLocalMySQL(),
      observaciones: appendActionObs(room.observaciones || "", "REPASO", getActor()?.name || "Sistema")
    });
    toast("warn", "Repaso", `Habitacion ${room.etiqueta} en repaso.`);
  } catch (err) {
    toast("err", "Error", err.message || "No se pudo poner repaso");
  } finally {
    btn.disabled = false;
  }
}

export async function doLiberar(room, btn) {
  if (isLocked()) { showLogin(); return; }
  const role = roleOf(getSession());
  if (isReadOnlyRole(role)) {
    toast("err", "Restringido", "Este rol solo puede visualizar.");
    return;
  }

  const current = normalizeRoom(room);
  const st = String(current.estado || "").toLowerCase();
  const isAdminRole = role === "ADMIN";
  const isReceptionRole = role === "RECEPCION";
  const isAmaLlavesRole = role === "AMA_LLAVES";

  if (st === "limpieza" && !isAdminRole) {
    toast("err", "No permitido", "Solo Administrador puede liberar si esta en LIMPIEZA.");
    return;
  }
  if (st === "inspeccion" && !isAdminRole && !isAmaLlavesRole) {
    toast("err", "No permitido", "Solo Administrador o Ama de llaves puede liberar desde INSPECCION.");
    return;
  }
  if (isAmaLlavesRole && st !== "mantenimiento" && st !== "inspeccion") {
    toast("err", "No permitido", "Ama de llaves solo puede liberar si esta en MANTENIMIENTO o INSPECCION.");
    return;
  }
  if (isReceptionRole && !["ocupado", "ocupada limpia", "mantenimiento", "lista"].includes(st)) {
    toast("err", "No permitido", "Recepcion solo puede liberar si esta OCUPADA, en MANTENIMIENTO o LISTA.");
    return;
  }
  if (isAdminRole && !["ocupado", "ocupada limpia", "mantenimiento", "lista", "limpieza", "inspeccion"].includes(st)) {
    toast("err", "No permitido", "Administrador solo puede liberar estados permitidos.");
    return;
  }
  if (!isAdminRole && !isReceptionRole && !isAmaLlavesRole) {
    toast("err", "Restringido", "No tenes permiso para liberar habitaciones.");
    return;
  }

  const ok = await confirmDialog(`¿Seguro de liberar la habitación ${current.etiqueta}?`, "Sí, liberar", true);
  if (!ok) return;
  if (!requireOnline()) return;

  btn.disabled = true;
  try {
    await updateRoom(current.modulo_id, current.etiqueta, {
      estado: "libre",
      adultos: 0,
      ninos: 0,
      camarera_asignada: null,
      desde: null,
      inicio_limpieza: null,
      fin_limpieza: null,
      prioridad_limpieza: null,
      observaciones: ""
    });
    toast("ok", "Habitacion liberada", `${current.etiqueta} -> LIBRE`);
  } catch (err) {
    toast("err", "Error", err.message || "No se pudo liberar");
  } finally {
    btn.disabled = false;
  }
}

export async function doPrio(room, btn) {
  if (isLocked()) { showLogin(); return; }
  const role = roleOf(getSession());
  if (isReadOnlyRole(role)) {
    toast("err", "Restringido", "Este rol solo puede visualizar.");
    return;
  }
  if (!canReception(role)) {
    toast("err", "Restringido", "Solo Recepcion puede marcar prioridad.");
    return;
  }
  const cur = normalizeRoom(room);
  if (cur.estado === "ocupado" || cur.estado === "ocupada limpia") {
    toast("err", "No permitido", "Debe iniciar limpieza antes de darle Prioridad");
    return;
  }
  const next = cur.prioAlta ? "baja" : "alta";
  if (!requireOnline()) return;

  btn.disabled = true;
  try {
    await updateRoom(cur.modulo_id, cur.etiqueta, {
      prioridad_limpieza: next,
      _skipEstadoUpdate: true,
      desde: cur.desde,
      inicio_limpieza: cur.inicio_limpieza,
      fin_limpieza: cur.fin_limpieza,
      observaciones: appendActionObs(cur.observaciones || "", `PRIORIDAD ${String(next || "").toUpperCase()}`, getActor()?.name || "Sistema")
    });
    if (next) toast("warn", "Prioridad", `Habitacion ${cur.etiqueta} con prioridad.`);
    else toast("ok", "Prioridad", `Habitacion ${cur.etiqueta} sin prioridad.`);
  } catch (err) {
    toast("err", "Error", err.message || "No se pudo cambiar prioridad");
  } finally {
    btn.disabled = false;
  }
}

const ROOM_ACTION_DISPATCH = {
  ocupado: doOcupado,
  limpieza: doLimpieza,
  mant: doMant,
  repaso: doRepaso,
  liberar: doLiberar,
  prio: doPrio
};

export function dispatchRoomAction(btn, room) {
  const handler = ROOM_ACTION_DISPATCH[btn.dataset.action];
  if (handler) handler(room, btn);
}

export function deselectAllRooms() {
  if (state.selectedRoomKey === null && !state.selectedRoomEl) return;
  state.selectedRoomKey = null;
  state.selectedRoomEl = null;
  document.querySelectorAll(".roomBtn.selected").forEach(x => x.classList.remove("selected"));
}

export function handleGridClick(e) {
  const target = e.target;
  if (!(target instanceof Element)) return;

  const actionBtn = target.closest("[data-action]");
  if (actionBtn) {
    e.stopPropagation();
    const k = actionBtn.dataset.roomKey;
    const room = state.roomDataMap.get(k);
    if (room) dispatchRoomAction(actionBtn, room);
    return;
  }

  const obsBtn = target.closest(".obsPeekBtn");
  if (obsBtn) {
    e.stopPropagation();
    const k = obsBtn.closest(".roomBtn")?.dataset.roomKey;
    const room = state.roomDataMap.get(k);
    if (room) openObsModal(room);
    return;
  }

  const roomBtn = target.closest(".roomBtn");
  if (roomBtn) {
    const k = roomBtn.dataset.roomKey;
    if (state.selectedRoomKey === k && state.selectedRoomEl === roomBtn) {
      state.selectedRoomKey = null;
      state.selectedRoomEl = null;
      roomBtn.classList.remove("selected");
    } else {
      if (state.selectedRoomEl) state.selectedRoomEl.classList.remove("selected");
      state.selectedRoomKey = k;
      state.selectedRoomEl = roomBtn;
      roomBtn.classList.add("selected");
    }
    return;
  }

  deselectAllRooms();
}

export function setupGridDelegation() {
  const roomsGrid = $("roomsGrid");
  if (!roomsGrid || roomsGrid._delegated) return;
  roomsGrid._delegated = true;
  roomsGrid.addEventListener("click", handleGridClick);
}

export function clearRoomSearch() {
  const roomSearchInput = $("roomSearch");
  if (!roomSearchInput) return;
  roomSearchInput.value = "";
  state.roomSearchQuery = "";
  updateRoomSearchClearBtn();
  scheduleRenderRooms();
  roomSearchInput.focus();
}

export function updateRoomSearchClearBtn() {
  const roomSearchInput = $("roomSearch");
  const roomSearchWrap = roomSearchInput?.closest(".searchWrap");
  if (!roomSearchWrap || !roomSearchInput) return;
  roomSearchWrap.classList.toggle("has-value", !!roomSearchInput.value);
}

export function setupRoomSearch() {
  const roomSearchInput = $("roomSearch");
  const roomSearchWrap = roomSearchInput?.closest(".searchWrap");

  roomSearchInput?.addEventListener("input", (e) => {
    state.roomSearchQuery = String(e.target.value || "").trim().toLowerCase();
    updateRoomSearchClearBtn();
    scheduleRenderRooms();
  });

  roomSearchWrap?.addEventListener("click", (e) => {
    const btn = e.target.closest("#roomSearchClear, .searchClearBtn");
    if (btn && roomSearchWrap.contains(btn)) {
      e.preventDefault();
      e.stopPropagation();
      clearRoomSearch();
    }
  });
}

/* =========================
   ROOMS RENDER
========================= */
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
function roomClassByEstado(estado) {
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

function calcCounts(rooms) {
  const counts = { sucias: 0, limpieza: 0, inspeccion: 0, lista: 0, limpias: 0, limpiadas: 0, mantenimiento: 0, prioridad: 0, repaso: 0 };

  rooms.forEach(r => {
    const key = STATUS_COUNT_KEY[r.estado];
    if (key) counts[key]++;
    if (String(r.prioridad_limpieza || "").toLowerCase() === "alta") counts.prioridad++;
    if (r.estado === "libre" || r.estado === "ocupada limpia" ||
        (r.estado === "ocupado" && String(r.tipo_limpieza || "").toLowerCase() === "estadia" && r.fin_limpieza)) {
      counts.limpiadas++;
    }
  });

  return counts;
}

function setSummary(counts, total) {
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

function setProgressAll(counts, total) {
  const pct = total ? Math.round((counts.sucias / total) * 100) : 0;
  const progText = $("sumProgTextAll");
  if (progText) progText.textContent = `${counts.sucias}/${total} (${pct}%)`;
  const progFill = $("sumProgFillAll");
  if (progFill) progFill.style.width = `${pct}%`;
}

function updateSummaryCounts() {
  const rooms = roomsCache.get(String(activeModuleId)) || [];
  const counts = calcCounts(rooms);
  setSummary(counts, rooms.length || 0);

  const allRooms = [];
  roomsCache.forEach(arr => { if (Array.isArray(arr)) allRooms.push(...arr); });
  const allCounts = calcCounts(allRooms);
  setProgressAll(allCounts, allRooms.length || 0);
}

function renderRooms() {
  const grid = $("roomsGrid");
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();

  const sess = getSession();
  const role = roleOf(sess);

  const rooms = roomsCache.get(String(activeModuleId)) || [];
  if (!rooms.length) {
    grid.innerHTML = '<div class="emptyRooms">No hay habitaciones en este modulo.</div>';
    return;
  }

  let filteredRooms = rooms;
  if (roomSearchQuery) {
    filteredRooms = rooms.filter(r => {
      const etiqueta = String(r.etiqueta).toLowerCase();
      return etiqueta.includes(roomSearchQuery);
    });
    if (!filteredRooms.length) {
      grid.innerHTML = '<div class="emptyRooms">Sin resultados para "' + roomSearchQuery + '"</div>';
      updateSummaryCounts();
      return;
    }
  }

  const moduleName = MODULES.find(m => String(m.id) === String(activeModuleId))?.descripcion || "";

  const cleanedMap = loadCleanedMap();
  let cleanedDirty = false;
  const sorted = [...filteredRooms].sort((a, b) => String(a.etiqueta).localeCompare(String(b.etiqueta), "es", { numeric: true }));

  sorted.forEach(room => {
    const k = roomKey(room.modulo_id, room.etiqueta);
    const { cls, badge } = roomClassByEstado(room.estado);

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
    const prioHigh = String(room.prioridad_limpieza || "").toLowerCase() === "alta";
    const badgeText = (prioHigh && (room.estado === "libre" || room.estado === "lista")) ? "PRIORIDAD" : badge;
    const prioTagHTML = "";

    const btn = document.createElement("button");
    btn.className = `roomBtn ${cls}${prioHigh ? " prioHigh" : ""}`;
    btn.type = "button";

    const obsChips = (room.observaciones && room.observaciones.trim())
      ? `<div class="obsBar"><span class="obsChip">Observaciones</span><button class="obsPeekBtn" type="button" title="Ver observaciones">Ver</button></div>`
      : "";

    let timerHTML = "";
    const prioIconHTML = prioHigh ? `<div class="prioIcon">&#9889;</div>` : "";
    if (room.estado === "lista" && parseAnyDate(room.desde)) {
      timerHTML = `
        <div class="timerBadge">
          <img class="timerIcon" src="./cronografo.png" alt="" />
          ${prioIconHTML}
          <div class="timerText" data-timer-roomkey="${k}" data-timer-type="lista">${fmtDur(msSince(room.desde))}</div>
        </div>`;
    }
    if (room.estado === "limpieza" && parseAnyDate(room.inicio_limpieza)) {
      timerHTML = `
        <div class="timerBadge">
          <img class="timerIcon" src="./cronografo.png" alt="" />
          ${prioIconHTML}
          <div class="timerText" data-timer-roomkey="${k}" data-timer-type="limpieza">${fmtDur(msSince(room.inicio_limpieza))}</div>
        </div>`;
    }
    if (room.estado === "inspeccion" && parseAnyDate(room.fin_limpieza)) {
      timerHTML = `
        <div class="timerBadge">
          <img class="timerIcon" src="./cronografo.png" alt="" />
          ${prioIconHTML}
          <div class="timerText" data-timer-roomkey="${k}" data-timer-type="inspeccion">${fmtDur(msSince(room.fin_limpieza))}</div>
        </div>`;
    }
    if (room.estado === "repaso" && parseAnyDate(room.inicio_repaso)) {
      timerHTML = `
        <div class="timerBadge">
          <img class="timerIcon" src="./cronografo.png" alt="" />
          ${prioIconHTML}
          <div class="timerText" data-timer-roomkey="${k}" data-timer-type="repaso">${fmtDur(msSince(room.inicio_repaso))}</div>
        </div>`;
    }

    const prioTopHTML = "";
    const showOccupied = room.estado === "ocupado" || room.estado === "ocupada limpia" || room.estado === "lista";
    const precioStr = "";
    btn.dataset.roomKey = k;
    btn.innerHTML = `
      ${timerHTML}
      ${prioTopHTML}
      <div class="badge">${badgeText}</div>
      ${cleanTagHTML}
      ${decoradaTagHTML}
      <div class="roomNum">${room.etiqueta}</div>
      <div class="roomState">${moduleName}</div>
      <div class="roomOcc">${(showOccupied) && (room.adultos > 0 || room.ninos > 0) ? `&#128101; ${room.adultos || 0} / ${room.ninos || 0}` : ""}</div>
      ${precioStr}
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
        <button class="raBtn ocupado" data-action="ocupado" title="Ocupado">${ICONS.ocupado}</button>
        <button class="raBtn limpieza" data-action="limpieza" title="Lista / Iniciar limpieza">${ICONS.limpieza}</button>
        <button class="raBtn mant" data-action="mant" title="Mantenimiento">${ICONS.mant}</button>
        <button class="raBtn liberar" data-action="liberar" title="Liberar habitacion">${ICONS.liberar}</button>
        <button class="raBtn prio" data-action="prio" title="Prioridad limpieza">${ICONS.prio}</button>
        <button class="raBtn repaso" data-action="repaso" title="Repaso">${ICONS.repaso}</button>
      </div>
    `;

    btn.addEventListener("click", (e) => {
      if (e.target.closest("[data-action]") || e.target.closest(".obsPeekBtn")) return;
      const wasSelected = selectedRoomKey === k;
      if (selectedRoomEl) selectedRoomEl.classList.remove("selected");
      selectedRoomEl = wasSelected ? null : btn;
      selectedRoomKey = wasSelected ? null : k;
      if (!wasSelected) btn.classList.add("selected");
    });
    if (selectedRoomKey === k) { selectedRoomEl = btn; btn.classList.add("selected"); }

    const bObsPeek = btn.querySelector(".obsPeekBtn");
    bObsPeek?.addEventListener("click", (e) => {
      e.stopPropagation();
      openObsModal(room);
    });

    const [bOcc, bLimp, bMant, bFree, bPrio, bRep] = btn.querySelectorAll(".raBtn");
    const isReadOnlyRole = role === "GERENCIA" || role === "REPORTES";
    if (isReadOnlyRole) {
      bOcc.disabled = true;
      bLimp.disabled = true;
      bMant.disabled = true;
      bFree.disabled = true;
      bPrio.disabled = true;
      bRep.disabled = true;
      bOcc.title = "Solo lectura";
      bLimp.title = "Solo lectura";
      bMant.title = "Solo lectura";
      bFree.title = "Solo lectura";
      bPrio.title = "Solo lectura";
      bRep.title = "Solo lectura";
    }
    if (!canUseLiberar(role)) bFree.classList.add("hidden");
    if (!canReception(role)) {
      bPrio.classList.add("hidden");
      bRep.classList.add("hidden");
    }
    bOcc.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isLocked()) { showLogin(); return; }
      if (role === "GERENCIA") {
        toast("err", "Restringido", "Gerencia solo puede visualizar.");
        return;
      }

      if (!canReception(role)) {
        toast("err", "Restringido", "Solo Recepcion puede poner OCUPADO.");
        return;
      }
      openOccModal(room);
    });
    bLimp.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (isLocked()) { showLogin(); return; }
      if (role === "GERENCIA") {
        toast("err", "Restringido", "Gerencia solo puede visualizar.");
        return;
      }

      const current = normalizeRoom(room);
      const sess2 = getSession();
      const role2 = roleOf(sess2);

      if (canReception(role2)) {
        if (current.estado !== "ocupado" && current.estado !== "ocupada limpia") {
          toast("err", "No permitido", "Solo podes poner LISTA cuando estaba OCUPADO.");
          return;
        }
        if (!requireOnline()) return;

        bLimp.disabled = true;
        try {
          await updateRoom(current.modulo_id, current.etiqueta, {
            estado: "lista",
            desde: nowLocalMySQL(),
            inicio_limpieza: null,
            fin_limpieza: null,
            camarera_asignada: null,
            tipo_limpieza: null,
            inspector_asignado: null,
            adultos: Number.isFinite(current.adultos) ? current.adultos : 0,
            ninos: Number.isFinite(current.ninos) ? current.ninos : 0,
            observaciones: appendActionObs(current.observaciones || "", "LISTA PARA LIMPIEZA")
          });

          toast("warn", "Lista para limpieza", `Habitacion ${current.etiqueta} lista.`);
        } catch (err) {
          toast("err", "Error", err.message || "No se pudo cambiar a LISTA");
        } finally {
          bLimp.disabled = false;
        }
      }
      if (role2 === "AMA_LLAVES") {
        if (current.estado === "repaso") {
          const ok = await confirmDialog(`Seguro de liberar la habitacion ${current.etiqueta}?`);
          if (!ok) return;
          if (!requireOnline()) return;
          bLimp.disabled = true;
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
            bLimp.disabled = false;
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
    });
    bMant.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (isLocked()) { showLogin(); return; }
      if (role === "GERENCIA") {
        toast("err", "Restringido", "Gerencia solo puede visualizar.");
        return;
      }

      if (!canUseMantenimiento(role)) {
        toast("err", "Restringido", "Solo Recepcion o Ama de llaves puede poner MANTENIMIENTO.");
        return;
      }

      if (room.estado === "ocupado" || room.estado === "ocupada limpia") {
        toast("err", "No permitido", "No podes poner MANTENIMIENTO si esta OCUPADO.");
        return;
      }
      if (!requireOnline()) return;

      const confirmado = await confirmDialog(`¿Estás seguro de poner la habitacion ${room.etiqueta} en MANTENIMIENTO?`);
      if (!confirmado) return;

      bMant.disabled = true;
      try {
        await updateRoom(room.modulo_id, room.etiqueta, {
          estado: "mantenimiento",
          camarera_asignada: null,
          adultos: Number.isFinite(room.adultos) ? room.adultos : 0,
          ninos: Number.isFinite(room.ninos) ? room.ninos : 0,
          observaciones: appendActionObs(room.observaciones || "", "MANTENIMIENTO")
        });

        toast("warn", "Mantenimiento", `Habitacion ${room.etiqueta} en mantenimiento.`);
      } catch (err) {
        toast("err", "Error", err.message || "No se pudo poner mantenimiento");
      } finally {
        bMant.disabled = false;
      }
    });
    bRep.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (isLocked()) { showLogin(); return; }
      if (role === "GERENCIA") {
        toast("err", "Restringido", "Gerencia solo puede visualizar.");
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

      bRep.disabled = true;
      try {
        await updateRoom(room.modulo_id, room.etiqueta, {
          estado: "repaso",
          repaso: "si",
          inicio_repaso: nowLocalMySQL(),
          observaciones: appendActionObs(room.observaciones || "", "REPASO")
        });
        toast("warn", "Repaso", `Habitacion ${room.etiqueta} en repaso.`);
      } catch (err) {
        toast("err", "Error", err.message || "No se pudo poner repaso");
      } finally {
        bRep.disabled = false;
      }
    });
    bFree.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (isLocked()) { showLogin(); return; }
      if (role === "GERENCIA") {
        toast("err", "Restringido", "Gerencia solo puede visualizar.");
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

      const ok = await confirmDialog(`Seguro de liberar la habitacion ${current.etiqueta}?`);
      if (!ok) return;
      if (!requireOnline()) return;

      bFree.disabled = true;
      try {
        await updateRoom(current.modulo_id, current.etiqueta, {
          estado: "libre",
          adultos: 0,
          ninos: 0,
          camarera_asignada: null,
          desde: null,
          inicio_limpieza: null,
          fin_limpieza: null,
          observaciones: ""
        });
        toast("ok", "Habitacion liberada", `${current.etiqueta} -> LIBRE`);
      } catch (err) {
        toast("err", "Error", err.message || "No se pudo liberar");
      } finally {
        bFree.disabled = false;
      }
    });
    bPrio.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (isLocked()) { showLogin(); return; }
      if (role === "GERENCIA") {
        toast("err", "Restringido", "Gerencia solo puede visualizar.");
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
      const next = (String(cur.prioridad_limpieza || "").toLowerCase() === "alta") ? "baja" : "alta";
      if (!requireOnline()) return;

      bPrio.disabled = true;
      try {
        await updateRoom(cur.modulo_id, cur.etiqueta, {
          prioridad_limpieza: next,
          estado: cur.estado,
          desde: cur.desde,
          inicio_limpieza: cur.inicio_limpieza,
          fin_limpieza: cur.fin_limpieza,
          observaciones: appendActionObs(cur.observaciones || "", `PRIORIDAD ${String(next || "").toUpperCase()}`)
        });
        if (next) toast("warn", "Prioridad", `Habitacion ${cur.etiqueta} con prioridad.`);
        else toast("ok", "Prioridad", `Habitacion ${cur.etiqueta} sin prioridad.`);
      } catch (err) {
        toast("err", "Error", err.message || "No se pudo cambiar prioridad");
      } finally {
        bPrio.disabled = false;
      }
    });

    frag.appendChild(btn);
  });

  grid.appendChild(frag);

  const roomIndex = document.getElementById('roomIndex');
  if (roomIndex) {
    roomIndex.innerHTML = '';
    sorted.forEach(room => {
      const idxBtn = document.createElement('button');
      const { cls } = roomClassByEstado(room.estado);
      idxBtn.className = `roomIndexBtn ${cls}`;
      idxBtn.textContent = room.etiqueta;
      idxBtn.addEventListener('click', () => {
        const card = grid.querySelector(`[data-room-key="${roomKey(room.modulo_id, room.etiqueta)}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.style.transition = 'box-shadow .2s';
          card.style.boxShadow = '0 0 0 3px rgba(124,58,237,.6), 0 20px 60px rgba(0,0,0,.5)';
          setTimeout(() => { card.style.boxShadow = ''; }, 800);
        }
      });
      roomIndex.appendChild(idxBtn);
    });
  }

  if (cleanedDirty) saveCleanedMap(cleanedMap);

  updateSummaryCounts();
  updateTimersLive();
}

const roomsGrid = $("roomsGrid");
if (roomsGrid) {
  roomsGrid.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".roomBtn")) return;
    selectedRoomKey = null;
    document.querySelectorAll(".roomBtn.selected").forEach(x => x.classList.remove("selected"));
  });
}

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
    openDecoradaForm(activeModuleId);
  });
}

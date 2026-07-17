/* =========================
   BOOT (cargar datos BD)
========================= */
async function loadModules() {
  const resp = await apiGET("/api/modules");
  MODULES = (resp.data || []).map(x => ({ id: String(x.id), descripcion: String(x.descripcion) }));
  if (!MODULES.length) throw new Error("No hay modulos en BD");
  if (!activeModuleId) activeModuleId = String(MODULES[0].id);
}

async function loadRooms(modulo_id) {
  const resp = await apiGET(`/api/rooms?modulo_id=${encodeURIComponent(String(modulo_id))}`);
  const rows = (resp.data || []).map(normalizeRoom);
  roomsCache.set(String(modulo_id), rows);
  return rows;
}

async function bootData() {
  await loadModules();
  const moduleIds = MODULES.map(m => String(m.id));
  await Promise.all(moduleIds.map(id => loadRooms(id)));
}

/* =========================
   RENDER ALL
========================= */
function renderAll() {
  renderModules();
  renderRooms();
}

/* =========================
   MODAL SAVE HANDLER
========================= */
modalSave.onclick = async () => {
  try {
    if (!modalRoom) return;
    if (isLocked()) { showLogin(); return; }
    if (!requireOnline()) return;

    const sess2 = getSession();
    if (!canReception(roleOf(sess2))) {
      toast("err", "Restringido", "Solo Recepcion puede poner OCUPADO.");
      return;
    }

    const adultsVal = clampNonNegInt(adultsInput.value);
    if (adultsVal < 1) {
      toast("err", "Falta adulto", "Debe haber al menos 1 adulto para ocupar.");
      adultsInput.focus();
      return;
    }

    modalSave.disabled = true;
    try {
      await updateRoom(modalRoom.modulo_id, modalRoom.etiqueta, {
        estado: "ocupado",
        adultos: adultsVal,
        ninos: clampNonNegInt(kidsInput.value),
        observaciones: appendActionObs(String(obsInput.value || "").trim(), "OCUPADO"),
        camarera_asignada: null
      });

      toast("ok", "Actualizado", `${modalRoom.etiqueta} -> OCUPADO`);
      closeOccModal();
    } finally {
      modalSave.disabled = false;
    }
  } catch (err) {
    toast("err", "Error", err.message || "No se pudo guardar");
  }
};

/* =========================
   INTERVALS & EVENTS
========================= */
setInterval(() => {
  if (isLocked() && !isLoginVisible()) {
    unsubscribeFromPush();
    showLogin();
  }
}, 8000);

setInterval(updateTimersLive, 1000);

async function refreshOnResume() {
  if (isLoginVisible()) return;
  if (!activeModuleId) return;
  try {
    await loadRooms(activeModuleId);
    renderRooms();
    updateSummaryCounts();
  } catch {}
}

document.addEventListener("visibilitychange", refreshOnResume);
window.addEventListener("focus", refreshOnResume);
window.addEventListener("pageshow", refreshOnResume);
window.addEventListener("online", refreshOnResume);
setInterval(syncServerTime, 5 * 60 * 1000);

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(adjustMobileLayout, 200);
});

/* =========================
   INIT
========================= */
(async function init() {
  initSocket();

  await syncServerTime();

  if (typeof update === 'function') update();

  if (localStorage.getItem(LS_FORCE_LOGIN) === "1" || isLocked()) {
    showLogin();
    return;
  }

  try {
    await bootData();
    renderAll();
    renderActiveUser();
    adjustMobileLayout();
    requestNotifPermission();
  } catch (e) {
    console.error(e);
    toast("err", "Error", e.message || "No cargo data");
    showLogin();
  }
})();

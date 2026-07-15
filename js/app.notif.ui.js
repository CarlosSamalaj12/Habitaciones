/* =========================
   PANEL DE NOTIFICACIONES RECIENTES (UI)
========================= */
let notifPanelOpen = false;

function renderNotifPanel() {
  const body = $("notifPanelBody");
  const panel = $("notifPanel");
  if (!body || !panel) return;

  if (!recentNotifications.length) {
    body.innerHTML = '<div class="notifEmpty">Sin cambios recientes</div>';
    return;
  }

  const estadoIconMap = {
    "ocupado": "🔴",
    "ocupada limpia": "🔴",
    "lista": "🟡",
    "limpieza": "🔵",
    "inspeccion": "🟢",
    "libre": "🟢",
    "mantenimiento": "🟣",
    "repaso": "🟤"
  };

  let html = "";
  recentNotifications.forEach(n => {
    const icon = estadoIconMap[n.newEstado] || "🔔";
    const changeDir = n.oldEstado !== n.newEstado
      ? `<span style="color:var(--muted);font-size:10px">${n.oldLabel} → </span><span style="font-weight:700">${n.newLabel}</span>`
      : `<span style="font-weight:700">${n.newLabel}</span>`;

    html += `<div class="notifItem" data-notif-id="${n.id}">
      <div class="notifItemIcon ${n.newEstado}">${icon}</div>
      <div class="notifItemContent">
        <div class="notifItemRoom">${n.modulo} - ${n.etiqueta}</div>
        <div class="notifItemChange">${changeDir}</div>
        <div class="notifItemTime">${n.time}</div>
      </div>
      <button class="notifItemClose" data-notif-close="${n.id}" title="Descartar">X</button>
    </div>`;
  });

  body.innerHTML = html;

  body.querySelectorAll("[data-notif-close]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.notifClose;
      const idx = recentNotifications.findIndex(n => n.id === id);
      if (idx >= 0) recentNotifications.splice(idx, 1);
      renderNotifPanel();
      updateBellDot();
    });
  });
}

$("btnNotifBell")?.addEventListener("click", () => {
  notifPanelOpen = !notifPanelOpen;
  const panel = $("notifPanel");
  if (!panel) return;
  if (notifPanelOpen) {
    panel.classList.remove("hidden");
    renderNotifPanel();
    updateBellDot();
  } else {
    panel.classList.add("hidden");
  }
});

$("notifPanelClose")?.addEventListener("click", () => {
  notifPanelOpen = false;
  const panel = $("notifPanel");
  if (panel) panel.classList.add("hidden");
  updateBellDot();
});

document.addEventListener("click", (e) => {
  if (!notifPanelOpen) return;
  const panel = $("notifPanel");
  const bell = $("btnNotifBell");
  if (!panel || !bell) return;
  if (!panel.contains(e.target) && !bell.contains(e.target)) {
    notifPanelOpen = false;
    panel.classList.add("hidden");
    updateBellDot();
  }
});

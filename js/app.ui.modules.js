/* =========================
   UI MODULES
========================= */
let selectedRoomKey = null;
let selectedRoomEl = null;

const CLEANED_KEY = "hk_cleaned_rooms_v1";
function loadCleanedMap() {
  try { return JSON.parse(localStorage.getItem(CLEANED_KEY) || "{}"); } catch { return {}; }
}
function saveCleanedMap(map) {
  try { localStorage.setItem(CLEANED_KEY, JSON.stringify(map)); } catch {}
}

function renderModules() {
  const row = $("modulesRow");
  row.innerHTML = "";

  MODULES.forEach(m => {
    const b = document.createElement("button");
    b.className = "btnModule" + (String(m.id) === String(activeModuleId) ? " active" : "");
    b.textContent = m.descripcion;

    b.addEventListener("click", async () => {
      activeModuleId = String(m.id);
      $("selModule").textContent = m.descripcion;

      if (!roomsCache.get(activeModuleId)) {
        await loadRooms(activeModuleId);
      }

      renderModules();
      renderRooms();
    });

    row.appendChild(b);
  });

  const cur = MODULES.find(x => String(x.id) === String(activeModuleId));
  $("selModule").textContent = cur?.descripcion || "-";
}

function openInspeccion(modulo_id, etiqueta) {
  const sess = getSession() || {};
  const url = new URL("./Inspeccion.html", window.location.href);
  url.searchParams.set("m", String(modulo_id));
  url.searchParams.set("r", String(etiqueta));
  const modName = MODULES.find(x => String(x.id) === String(modulo_id))?.descripcion || "";
  if (modName) url.searchParams.set("mn", modName);
  url.searchParams.set("u", sess.name || "");
  url.searchParams.set("d", sess.dept || "");
  window.location.href = url.toString();
}

function openDecoradaForm(modulo_id) {
  const sess = getSession() || {};
  const url = new URL("./Decorada.html", window.location.href);
  if (modulo_id != null) url.searchParams.set("m", String(modulo_id));
  const modName = MODULES.find(x => String(x.id) === String(modulo_id))?.descripcion || "";
  if (modName) url.searchParams.set("mn", modName);
  url.searchParams.set("u", sess.name || "");
  url.searchParams.set("d", sess.dept || "");
  window.location.href = url.toString();
}

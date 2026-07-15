/* =========================
   MODAL OCUPACION
========================= */
let modalRoom = null;

const modalOverlay = $("modalOverlay");
const modalSub = $("modalSub");
const adultsInput = $("adultsInput");
const kidsInput = $("kidsInput");
const adultsMinus = $("adultsMinus");
const adultsPlus = $("adultsPlus");
const kidsMinus = $("kidsMinus");
const kidsPlus = $("kidsPlus");
const modalClose = $("modalClose");
const modalCancel = $("modalCancel");
const modalSave = $("modalSave");
const obsInput = $("obsInput");
const confirmOverlay = $("confirmOverlay");
const confirmMsg = $("confirmMsg");
const confirmCancel = $("confirmCancel");
const confirmOk = $("confirmOk");
const obsOverlay = $("obsOverlay");
const obsRoomSub = $("obsRoomSub");
const obsTextBody = $("obsTextBody");
const obsClose = $("obsClose");
const obsOk = $("obsOk");

function openConfirm(message) {
  if (confirmMsg) confirmMsg.textContent = message;
  if (confirmOverlay) confirmOverlay.classList.remove("hidden");
}
function closeConfirm() {
  if (confirmOverlay) confirmOverlay.classList.add("hidden");
}
function confirmDialog(message) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      closeConfirm();
      resolve(val);
    };
    openConfirm(message);
    const onCancel = () => finish(false);
    const onOk = () => finish(true);
    const onOverlay = (e) => { if (e.target === confirmOverlay) finish(false); };

    confirmCancel?.addEventListener("click", onCancel, { once: true });
    confirmOk?.addEventListener("click", onOk, { once: true });
    confirmOverlay?.addEventListener("click", onOverlay, { once: true });
  });
}

function openObsModal(room){
  if (!obsOverlay || !obsRoomSub || !obsTextBody) return;
  obsRoomSub.textContent = `Habitacion: ${room?.etiqueta || "-"}`;
  const txt = String(room?.observaciones || "").trim();
  const camarera = String(room?.camarera_asignada || "").trim();
  const lines = [];
  if (camarera) lines.push(`Camarera asignada: ${camarera}`);
  if (txt) lines.push(txt);
  obsTextBody.textContent = lines.join("\n\n") || "Sin observaciones";
  obsOverlay.classList.remove("hidden");
}
function closeObsModal(){
  if (!obsOverlay) return;
  obsOverlay.classList.add("hidden");
}
obsClose?.addEventListener("click", closeObsModal);
obsOk?.addEventListener("click", closeObsModal);
obsOverlay?.addEventListener("click", (e) => { if (e.target === obsOverlay) closeObsModal(); });

function clampNonNegInt(v) {
  const n = parseInt(String(v || "0").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
function openOccModal(room) {
  modalRoom = room;
  modalSub.textContent = `Habitacion: ${room.etiqueta}`;
  adultsInput.value = String(room.adultos ?? 0);
  kidsInput.value = String(room.ninos ?? 0);
  obsInput.value = room.observaciones || "";
  modalOverlay.classList.remove("hidden");
}
function closeOccModal() {
  modalOverlay.classList.add("hidden");
  modalRoom = null;
}

adultsMinus.addEventListener("click", () => adultsInput.value = String(Math.max(0, clampNonNegInt(adultsInput.value) - 1)));
adultsPlus.addEventListener("click", () => adultsInput.value = String(clampNonNegInt(adultsInput.value) + 1));
kidsMinus.addEventListener("click", () => kidsInput.value = String(Math.max(0, clampNonNegInt(kidsInput.value) - 1)));
kidsPlus.addEventListener("click", () => kidsInput.value = String(clampNonNegInt(kidsInput.value) + 1));

modalClose.addEventListener("click", closeOccModal);
modalCancel.addEventListener("click", closeOccModal);
modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeOccModal(); });

/* =========================
   UPDATE ROOM (DB)
========================= */
async function updateRoom(modulo_id, etiqueta, patch, source = "app") {
  const resp = await apiPOST("/api/room/update", { modulo_id, etiqueta, patch, actor: getActor(), source });
  applyRoomUpdate(resp.data);
  return resp.data;
}

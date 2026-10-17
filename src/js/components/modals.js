/* ==========================================================================
   MODALS COMPONENT (CONFIRM, OBSERVACIONES, OCUPACION)
   ========================================================================== */

import { state } from "../state/store.js";
import { $, clampNonNegInt } from "../utils/helpers.js";

/* =========================
   CONFIRM DIALOG
   ========================= */
export function openConfirm(message) {
  const confirmMsg = $("confirmMsg");
  const confirmOverlay = $("confirmOverlay");
  if (confirmMsg) confirmMsg.textContent = message;
  if (confirmOverlay) confirmOverlay.classList.remove("hidden");
}

export function closeConfirm() {
  const confirmOverlay = $("confirmOverlay");
  if (confirmOverlay) confirmOverlay.classList.add("hidden");
}

export function confirmDialog(message, okText = "Confirmar", isDanger = false) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      closeConfirm();
      resolve(val);
    };

    const confirmOk = $("confirmOk");
    const confirmCancel = $("confirmCancel");
    const confirmOverlay = $("confirmOverlay");

    if (confirmOk) {
      confirmOk.textContent = okText;
      confirmOk.className = isDanger ? "btnModal danger" : "btnModal primary";
    }
    openConfirm(message);

    const onCancel = () => finish(false);
    const onOk = () => finish(true);
    const onOverlay = (e) => { if (e.target === confirmOverlay) finish(false); };

    confirmCancel?.addEventListener("click", onCancel, { once: true });
    confirmOk?.addEventListener("click", onOk, { once: true });
    confirmOverlay?.addEventListener("click", onOverlay, { once: true });
  });
}

/* =========================
   OBSERVACIONES MODAL
   ========================= */
export function openObsModal(room) {
  const obsOverlay = $("obsOverlay");
  const obsRoomSub = $("obsRoomSub");
  const obsTextBody = $("obsTextBody");
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

export function closeObsModal() {
  const obsOverlay = $("obsOverlay");
  if (obsOverlay) obsOverlay.classList.add("hidden");
}

/* =========================
   OCUPACION MODAL
   ========================= */
export function openOccModal(room) {
  state.modalRoom = room;
  const modalSub = $("modalSub");
  const adultsInput = $("adultsInput");
  const kidsInput = $("kidsInput");
  const obsInput = $("obsInput");
  const modalOverlay = $("modalOverlay");

  if (modalSub) modalSub.textContent = `Habitacion: ${room.etiqueta}`;
  if (adultsInput) adultsInput.value = String(room.adultos ?? 0);
  if (kidsInput) kidsInput.value = String(room.ninos ?? 0);
  if (obsInput) obsInput.value = room.observaciones || "";
  if (modalOverlay) modalOverlay.classList.remove("hidden");
}

export function closeOccModal() {
  const modalOverlay = $("modalOverlay");
  if (modalOverlay) modalOverlay.classList.add("hidden");
  state.modalRoom = null;
}

export function setupModalEvents(onSaveOcc) {
  const adultsInput = $("adultsInput");
  const kidsInput = $("kidsInput");
  const adultsMinus = $("adultsMinus");
  const adultsPlus = $("adultsPlus");
  const kidsMinus = $("kidsMinus");
  const kidsPlus = $("kidsPlus");
  const modalClose = $("modalClose");
  const modalCancel = $("modalCancel");
  const modalOverlay = $("modalOverlay");
  const modalSave = $("modalSave");

  adultsMinus?.addEventListener("click", () => {
    if (adultsInput) adultsInput.value = String(Math.max(0, clampNonNegInt(adultsInput.value) - 1));
  });
  adultsPlus?.addEventListener("click", () => {
    if (adultsInput) adultsInput.value = String(clampNonNegInt(adultsInput.value) + 1);
  });
  kidsMinus?.addEventListener("click", () => {
    if (kidsInput) kidsInput.value = String(Math.max(0, clampNonNegInt(kidsInput.value) - 1));
  });
  kidsPlus?.addEventListener("click", () => {
    if (kidsInput) kidsInput.value = String(clampNonNegInt(kidsInput.value) + 1);
  });

  modalClose?.addEventListener("click", closeOccModal);
  modalCancel?.addEventListener("click", closeOccModal);
  modalOverlay?.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeOccModal();
  });

  const obsClose = $("obsClose");
  const obsOk = $("obsOk");
  const obsOverlay = $("obsOverlay");

  obsClose?.addEventListener("click", closeObsModal);
  obsOk?.addEventListener("click", closeObsModal);
  obsOverlay?.addEventListener("click", (e) => {
    if (e.target === obsOverlay) closeObsModal();
  });

  modalSave?.addEventListener("click", onSaveOcc);
}

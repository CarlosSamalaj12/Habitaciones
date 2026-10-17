/* ==========================================================================
   TOAST NOTIFICATION COMPONENT
   ========================================================================== */

import { $ } from "../utils/helpers.js";

export function toast(type, title, msg) {
  const stack = $("toastStack");
  if (!stack) return;
  const item = document.createElement("div");
  item.className = `toastItem ${type}`;
  item.innerHTML = `
    <div class="toastIcon">${type === "ok" ? "OK" : type === "warn" ? "!" : "X"}</div>
    <div>
      <div class="toastTitle">${title}</div>
      <div class="toastMsg">${msg}</div>
    </div>
  `;
  stack.appendChild(item);
  setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(-6px)";
  }, 3200);
  setTimeout(() => item.remove(), 3600);
}

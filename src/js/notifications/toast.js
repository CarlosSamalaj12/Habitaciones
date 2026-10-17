/* ==========================================================================
   TOAST NOTIFICATION COMPONENT
   ========================================================================== */

import { $ } from "../utils/helpers.js";
import { renderIcon } from "../components/icons.js";

export function toast(type, title, msg) {
  const stack = $("toastStack");
  if (!stack) return;
  const item = document.createElement("div");
  item.className = `toastItem ${type}`;
  const iconHtml = type === "ok"
    ? renderIcon("check", { size: 18, color: "#34D399" })
    : type === "warn"
      ? renderIcon("alert", { size: 18, color: "#FBBF24" })
      : renderIcon("close", { size: 18, color: "#F87171" });

  item.innerHTML = `
    <div class="toastIcon">${iconHtml}</div>
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

/* ==========================================================================
   PAGE TOAST HELPER (UNIFIED ACROSS SECONDARY VIEWS)
   ========================================================================== */

import { $ } from "./helpers.js";

export function toast(msg, ok = true, ms = 3200, containerId = "toasts") {
  const container = $(containerId);
  if (!container) return;
  const t = document.createElement("div");
  t.className = "toast " + (ok ? "ok" : "err");
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

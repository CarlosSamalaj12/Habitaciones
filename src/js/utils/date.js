/* ==========================================================================
   DATE & TIME UTILITIES
   ========================================================================== */

export function nowLocalMySQL() {
  return new Date().toISOString();
}

export function parseAnyDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    const [datePart, timePart] = s.split(" ");
    const [Y, M, D] = datePart.split("-").map(Number);
    const [h, m, sec] = timePart.split(":").map(Number);
    return new Date(Date.UTC(Y, M - 1, D, h + 6, m, sec));
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function msSince(value, currentServerMs = Date.now()) {
  const d = parseAnyDate(value);
  if (!d) return 0;
  return Math.max(0, currentServerMs - d.getTime());
}

export function fmtDur(ms) {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}h ${String(mm).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`;
  return `${mm}m ${String(ss).padStart(2, "0")}s`;
}

export const FMT_STAMP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Guatemala",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: false
});

export function appendActionObs(prev, action, actorDisplayStr = "Sistema") {
  const parts = FMT_STAMP.formatToParts(new Date());
  const get = (type) => parts.find(p => p.type === type)?.value || "00";
  const stamp = `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
  const line = `[${stamp}] ${action} por ${actorDisplayStr}`;
  const base = String(prev || "").trim();
  return base ? `${base}\n${line}` : line;
}

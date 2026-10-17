/**
 * Convierte cualquier fecha a DATETIME Guatemala (UTC-6) sin depender de ICU/timezone del SO
 * - Si ya viene "YYYY-MM-DD HH:MM:SS" => se guarda tal cual (GT)
 * - Si viene ISO/Date => se convierte restando 6 horas al UTC
 */
function toMySQLDatetime(value) {
  if (!value) return null;

  if (typeof value === "string") {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s;
  }

  const d = (value instanceof Date) ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  // Guatemala = UTC-6 (sin DST)
  const gtMs = d.getTime() - (6 * 60 * 60 * 1000);
  const gt = new Date(gtMs);

  const pad = (n) => String(n).padStart(2, "0");
  const YYYY = gt.getUTCFullYear();
  const MM   = pad(gt.getUTCMonth() + 1);
  const DD   = pad(gt.getUTCDate());
  const hh   = pad(gt.getUTCHours());
  const mm   = pad(gt.getUTCMinutes());
  const ss   = pad(gt.getUTCSeconds());

  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}

module.exports = {
  toMySQLDatetime
};

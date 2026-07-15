/* =========================
   API HELPERS
========================= */
function requireOnline() {
  if (!navigator.onLine) {
    toast("err", "Sin conexion", "No hay conexion a internet. Verifica tu senal y vuelve a intentar.");
    return false;
  }
  return true;
}

async function apiGET(path) {
  if (!navigator.onLine) throw new Error("Sin conexion a internet. Verifica tu senal.");
  const r = await fetch(`${API_BASE}${path}`, { method: "GET" });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error(j?.error || `GET ${path} failed`);
  if (j.ok === false) throw new Error(j.error || `GET ${path} failed`);
  return j;
}

async function apiPOST(path, body) {
  if (!navigator.onLine) throw new Error("Sin conexion a internet. Verifica tu senal.");
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error(j?.error || `POST ${path} failed`);
  if (j.ok === false) throw new Error(j.error || `POST ${path} failed`);
  return j;
}

/* =========================
   ACTOR / AUDIT
========================= */
function getActor() {
  const sess = getSession();
  if (sess?.name) return { id: sess.id || null, name: sess.name, dept: sess.dept || "" };
  try {
    const cached = JSON.parse(localStorage.getItem(LS_ACTOR_CACHE) || "null");
    if (cached?.name) return cached;
  } catch {}
  try {
    const name = String(localStorage.getItem(LS_LEGACY_USER_NAME) || "").trim();
    const dept = String(localStorage.getItem(LS_LEGACY_USER_DEPT) || "").trim();
    if (name) return { id: null, name, dept };
  } catch {}
  return null;
}

function actorDisplay() {
  const a = getActor();
  if (!a?.name) return "Sistema";
  return a.dept ? `${a.name} - ${a.dept}` : a.name;
}

const FMT_STAMP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Guatemala",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: false
});

function appendActionObs(prev, action) {
  const parts = FMT_STAMP.formatToParts(new Date());
  const get = (type) => parts.find(p => p.type === type)?.value || "00";
  const stamp = `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
  const line = `[${stamp}] ${action} por ${actorDisplay()}`;
  const base = String(prev || "").trim();
  return base ? `${base}\n${line}` : line;
}

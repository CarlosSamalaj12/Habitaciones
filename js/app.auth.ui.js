/* =========================
   LOGIN (BD)
========================= */
function showLogin() {
  const overlay = $("loginOverlay");
  if (!overlay) return;
  if (!overlay.classList.contains("hidden")) {
    return;
  }
  overlay.classList.remove("hidden");
  $("loginErr").classList.add("hidden");
  $("loginPass").value = "";
  localStorage.setItem(LS_FORCE_LOGIN, "1");
  loadLoginUsers();
  $("loginUser").focus();
}

function hideLogin() {
  $("loginOverlay").classList.add("hidden");
  localStorage.removeItem(LS_FORCE_LOGIN);
}

function isLoginVisible() {
  const overlay = $("loginOverlay");
  return !!overlay && !overlay.classList.contains("hidden");
}

let LOGIN_USERS_LOADING = false;

async function loadLoginUsers(){
  if (LOGIN_USERS_LOADING) return;
  LOGIN_USERS_LOADING = true;
  try{
    const sel = $("loginUser");
    const btn = $("btnLogin");
    sel.disabled = true;
    sel.innerHTML = `<option value="">Cargando usuarios...</option>`;
    if (btn) btn.disabled = true;

    const resp = await apiGET("/api/users");
    const raw = Array.isArray(resp?.data) ? resp.data : (Array.isArray(resp) ? resp : []);
    const users = raw.map(u => ({
      name: String(u?.nombre || u?.name || ""),
      dept: String(u?.departamento || u?.dept || "")
    }));

    sel.innerHTML = `<option value="">Seleccionar...</option>`;
    if (!users.length) {
      sel.innerHTML = `<option value="">Sin usuarios</option>`;
      toast("err", "Error", "No hay usuarios disponibles");
      return;
    }

    users.forEach(u => {
      if (!u.name) return;
      const opt = document.createElement("option");
      opt.value = u.name;
      opt.textContent = u.dept ? `${u.name} - ${u.dept}` : u.name;
      sel.appendChild(opt);
    });
    console.log("Usuarios cargados:", users.length);
  }catch(e){
    console.warn("No se pudo cargar usuarios:", e);
    const sel = $("loginUser");
    sel.innerHTML = `<option value="">Error cargando</option>`;
    toast("err", "Error", "No se pudieron cargar usuarios");
  }finally{
    const sel = $("loginUser");
    sel.disabled = false;
    const btn = $("btnLogin");
    if (btn) btn.disabled = false;
    LOGIN_USERS_LOADING = false;
  }
}

$("btnLogin").addEventListener("click", async () => {
  try {
    const selEl = $("loginUser");
    if (!selEl || selEl.options.length <= 1) {
      $("loginErr").classList.remove("hidden");
      toast("err", "Error", "Usuarios no cargados");
      return;
    }

    const selName = String(selEl.value || "").trim();
    if (!selName) {
      $("loginErr").classList.remove("hidden");
      toast("err", "Error", "Selecciona tu usuario");
      selEl.focus();
      return;
    }
    const clave = String($("loginPass").value || "").trim();
    if (!clave) {
      $("loginErr").classList.remove("hidden");
      toast("err", "Error", "Ingresa tu contrasena");
      $("loginPass").focus();
      return;
    }
    if (!requireOnline()) return;

    const btn = $("btnLogin");
    btn.disabled = true;
    const resp = await apiPOST("/api/login", { nombre: selName, clave });
    const u = resp.user;
    if (String(u.name) !== selName) {
      $("loginErr").classList.remove("hidden");
      toast("err", "Error", "La contrasena no corresponde al usuario seleccionado");
      $("loginPass").focus();
      return;
    }

    setSession({ id: u.id, name: u.name, dept: u.dept, token: resp.token, at: Date.now() });
    setActivity();
    hideLogin();
    requestNotifPermission();
    toast("ok", "Bienvenido", `${u.name} - ${u.dept}`);

    await bootData();
    renderAll();
    renderActiveUser();
    adjustMobileLayout();
  } catch (e) {
    $("loginErr").classList.remove("hidden");
    toast("err", "Error", e.message || "Contrasena incorrecta");
    $("loginPass").focus();
  } finally {
    $("btnLogin").disabled = false;
  }
});

$("loginPass").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("btnLogin").click();
});

$("btnLock").addEventListener("click", () => {
  unsubscribeFromPush();
  showLogin();
});

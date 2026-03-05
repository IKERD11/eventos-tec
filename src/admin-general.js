// src/admin-general.js
import { supabase } from "./supabase.js";

// ============================================================
// AUTH CHECK — redirige si no hay sesión
// ============================================================
async function checkSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = "/index.html";
}

// ============================================================
// ESTADO GLOBAL
// ============================================================
let sessionUser = null;
let listaEventos = [];
let listaUsuarios = [];

// ============================================================
// INICIALIZACIÓN
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  /* ---- Theme ---- */
  const body = document.body;
  if (localStorage.getItem("theme") === "light")
    body.classList.add("light-theme");
  document.getElementById("themeToggle").addEventListener("click", () => {
    body.classList.toggle("light-theme");
    localStorage.setItem(
      "theme",
      body.classList.contains("light-theme") ? "light" : "dark",
    );
    refreshCharts();
  });

  /* ---- Session & Auth ---- */
  try {
    const session = await checkSession();
    if (!session) {
      window.location.href = "/index.html";
      return;
    }
    sessionUser = session.user;

    // Load profile
    const { data: profile } = await supabase
      .from("perfiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (profile) {
      sessionUser.profile = profile;
      const initials = (profile.nombre_completo || session.user.email)
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
      document.getElementById("userAvatar").textContent = initials;
      document.getElementById("userNameSidebar").textContent =
        profile.nombre_completo || session.user.email;
      document.getElementById("headerUserName").textContent =
        profile.nombre_completo || session.user.email;
    }
  } catch (e) {
    console.warn("Session check failed:", e.message);
  }

  /* ---- Logout ---- */
  document.getElementById("logoutBtn").addEventListener("click", logout);

  /* ---- Personal tab ---- */
  initPersonalTab();

  /* ---- Tabs ---- */
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabPanels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add("active");
    });
  });

  /* ---- Modal close ---- */
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document
    .getElementById("btnCancelModal")
    .addEventListener("click", closeModal);

  /* ---- Form submit ---- */
  document
    .getElementById("eventoForm")
    .addEventListener("submit", handleFormSubmit);

  /* ---- Search / Filters ---- */
  document
    .getElementById("searchEventos")
    .addEventListener("input", applyEventosFilter);
  document
    .getElementById("filterEstado")
    .addEventListener("change", applyEventosFilter);
  document
    .getElementById("filterModalidad")
    .addEventListener("change", applyEventosFilter);
  document
    .getElementById("searchUsuarios")
    .addEventListener("input", applyUsuariosFilter);
  document
    .getElementById("filterRol")
    .addEventListener("change", applyUsuariosFilter);

  /* ---- Botón nuevo evento ---- */
  document
    .getElementById("btnNuevoEvento")
    .addEventListener("click", () => openModal());

  /* ---- Export CSV ---- */
  document
    .getElementById("btnExportEventos")
    .addEventListener("click", exportEventosCSV);
  document
    .getElementById("btnExportUsuarios")
    .addEventListener("click", exportUsuariosCSV);

  /* ---- Initial Data Load ---- */
  await Promise.all([loadStats(), loadEventos(), loadUsuarios(), loadPersonal()]);
  await loadEventosParaInvitar();
  renderCharts();
});

// ============================================================
// STATS
// ============================================================
async function loadStats() {
  try {
    const [
      { count: totalEventos },
      { count: activos },
      { count: totalUsuarios },
      { count: participantes },
    ] = await Promise.all([
      supabase.from("eventos").select("*", { count: "exact", head: true }),
      supabase
        .from("eventos")
        .select("*", { count: "exact", head: true })
        .eq("estado", "Activo"),
      supabase.from("perfiles").select("*", { count: "exact", head: true }),
      supabase
        .from("participantes")
        .select("*", { count: "exact", head: true }),
    ]);

    document.getElementById("statTotalEventos").textContent = totalEventos ?? 0;
    document.getElementById("statActivos").textContent = activos ?? 0;
    document.getElementById("statUsuarios").textContent = totalUsuarios ?? 0;
    document.getElementById("statParticipantes").textContent =
      participantes ?? 0;

    // Update tab count badge
    const tabEvCount = document.getElementById("tabEvCount");
    if (tabEvCount) tabEvCount.textContent = totalEventos ?? 0;
  } catch (e) {
    console.error("Error loading stats:", e.message);
  }
}

// ============================================================
// CHARTS
// ============================================================
let chartBar = null;
let chartDoughnut = null;

function renderCharts() {
  if (typeof Chart === "undefined") return;

  const isLight = document.body.classList.contains("light-theme");
  const textColor = isLight ? "#475569" : "rgba(255,255,255,0.7)";

  Chart.defaults.color = textColor;
  Chart.defaults.font.family = "'Outfit', sans-serif";

  // ---- Bar chart: eventos por mes ----
  const months = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  const counts = new Array(12).fill(0);
  listaEventos.forEach((ev) => {
    const d = new Date(ev.fecha);
    if (!isNaN(d)) counts[d.getMonth()]++;
  });

  const ctxBar = document.getElementById("chartEventosMes");
  if (ctxBar) {
    if (chartBar) chartBar.destroy();
    chartBar = new Chart(ctxBar, {
      type: "bar",
      data: {
        labels: months,
        datasets: [
          {
            label: "Eventos",
            data: counts,
            backgroundColor: "rgba(16,185,129,0.35)",
            borderColor: "#10b981",
            borderWidth: 1.5,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
        },
      },
    });
  }

  // ---- Doughnut: por estado ----
  const estadoCounts = { Activo: 0, Finalizado: 0, Cancelado: 0 };
  listaEventos.forEach((ev) => {
    if (estadoCounts[ev.estado] !== undefined) estadoCounts[ev.estado]++;
  });

  const ctxDoughnut = document.getElementById("chartEstados");
  if (ctxDoughnut) {
    if (chartDoughnut) chartDoughnut.destroy();
    chartDoughnut = new Chart(ctxDoughnut, {
      type: "doughnut",
      data: {
        labels: Object.keys(estadoCounts),
        datasets: [
          {
            data: Object.values(estadoCounts),
            backgroundColor: [
              "rgba(16,185,129,0.7)",
              "rgba(100,116,139,0.7)",
              "rgba(239,68,68,0.7)",
            ],
            borderColor: ["#10b981", "#64748b", "#ef4444"],
            borderWidth: 1.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { padding: 15, boxWidth: 12, font: { size: 12 } },
          },
        },
      },
    });
  }
}

function refreshCharts() {
  if (chartBar || chartDoughnut) renderCharts();
}

// ============================================================
// EVENTOS — Load, Filter, Render
// ============================================================
async function loadEventos() {
  const tbody = document.getElementById("eventosTbody");
  tbody.innerHTML = `<tr class="loading-row"><td colspan="7">Cargando eventos...</td></tr>`;

  try {
    const { data, error } = await supabase
      .from("eventos")
      .select("*, perfiles(nombre_completo)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    listaEventos = data || [];
    renderEventos(listaEventos);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#f87171;padding:30px">Error al cargar eventos: ${e.message}</td></tr>`;
  }
}

function applyEventosFilter() {
  const q = document.getElementById("searchEventos").value.toLowerCase();
  const estado = document.getElementById("filterEstado").value;
  const modalidad = document.getElementById("filterModalidad").value;

  const filtered = listaEventos.filter(
    (ev) =>
      (q === "" ||
        ev.titulo.toLowerCase().includes(q) ||
        (ev.lugar || "").toLowerCase().includes(q)) &&
      (estado === "" || ev.estado === estado) &&
      (modalidad === "" || ev.modalidad === modalidad),
  );
  renderEventos(filtered);
}

function renderEventos(eventos) {
  const tbody = document.getElementById("eventosTbody");
  if (!eventos.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" class="icon-lg" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            <p>No hay eventos que coincidan</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  eventos.forEach((ev) => {
    const estadoBadge = `<span class="badge badge-${ev.estado?.toLowerCase()}">${ev.estado}</span>`;
    const modalBadge = `<span class="badge badge-${ev.modalidad?.toLowerCase().replace("í", "i")}">${ev.modalidad}</span>`;
    const fecha = new Date(ev.fecha + "T00:00:00").toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td style="font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${ev.titulo}">${ev.titulo}</td>
            <td style="font-size:0.82rem;opacity:0.7;">${ev.perfiles?.nombre_completo || "—"}</td>
            <td>${fecha}</td>
            <td style="font-size:0.82rem;">${ev.lugar || "—"}</td>
            <td>${modalBadge}</td>
            <td>${estadoBadge}</td>
            <td>
                <div class="actions-cell">
                    <button class="btn-icon-sm success btn-edit" data-id="${ev.id}" title="Editar">
                        <svg viewBox="0 0 24 24" fill="none" class="icon" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-icon-sm danger btn-delete" data-id="${ev.id}" title="Eliminar">
                        <svg viewBox="0 0 24 24" fill="none" class="icon" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                </div>
            </td>`;
    tbody.appendChild(tr);
  });

  // Bind actions
  tbody
    .querySelectorAll(".btn-edit")
    .forEach((btn) =>
      btn.addEventListener("click", () => openModal(btn.dataset.id)),
    );
  tbody
    .querySelectorAll(".btn-delete")
    .forEach((btn) =>
      btn.addEventListener("click", () => promptDelete(btn.dataset.id)),
    );
}

// ============================================================
// USUARIOS — Load, Filter, Render
// ============================================================
async function loadUsuarios() {
  const tbody = document.getElementById("usuariosTbody");
  tbody.innerHTML = `<tr class="loading-row"><td colspan="5">Cargando usuarios...</td></tr>`;

  try {
    const { data, error } = await supabase
      .from("perfiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    listaUsuarios = data || [];
    renderUsuarios(listaUsuarios);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#f87171;padding:30px">Error: ${e.message}</td></tr>`;
  }
}

function applyUsuariosFilter() {
  const q = document.getElementById("searchUsuarios").value.toLowerCase();
  const rol = document.getElementById("filterRol").value;

  const filtered = listaUsuarios.filter(
    (u) =>
      (q === "" || (u.nombre_completo || "").toLowerCase().includes(q)) &&
      (rol === "" || u.rol === rol),
  );
  renderUsuarios(filtered);
}

function renderUsuarios(usuarios) {
  const tbody = document.getElementById("usuariosTbody");
  if (!usuarios.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" class="icon-lg" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            <p>No hay usuarios que coincidan</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  const myId = sessionUser?.id;

  usuarios.forEach((u) => {
    const rolBadge = `<span class="badge badge-${u.rol}">${u.rol}</span>`;
    const fecha = new Date(u.created_at).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const isMe = u.id === myId;
    const activo = u.activo !== false; // default true if null

    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td style="font-weight:600;">${u.nombre_completo || "(Sin nombre)"}</td>
            <td>${rolBadge}</td>
            <td><span class="badge ${activo ? "badge-enabled" : "badge-disabled"}">${activo ? "Activo" : "Inactivo"}</span></td>
            <td style="font-size:0.82rem;opacity:0.7;">${fecha}</td>
            <td>
                <div class="actions-cell">
                    <label class="toggle-switch" title="${isMe ? "No puedes desactivar tu propia cuenta" : activo ? "Desactivar" : "Activar"}">
                        <input type="checkbox" class="toggle-activo" data-id="${u.id}" ${activo ? "checked" : ""} ${isMe ? "disabled" : ""}>
                        <span class="toggle-track"></span>
                    </label>
                    <select class="select-filter select-rol" data-id="${u.id}" style="padding:5px 10px;font-size:0.8rem;" ${isMe ? "disabled" : ""}>
                        <option value="docente"   ${u.rol === "docente" ? "selected" : ""}>Docente</option>
                        <option value="academia"  ${u.rol === "academia" ? "selected" : ""}>Academia</option>
                        <option value="admin"     ${u.rol === "admin" ? "selected" : ""}>Admin</option>
                    </select>
                </div>
            </td>`;
    tbody.appendChild(tr);
  });

  // Toggle activo
  tbody.querySelectorAll(".toggle-activo").forEach((toggle) => {
    toggle.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      const activo = e.target.checked;
      const { error } = await supabase
        .from("perfiles")
        .update({ activo })
        .eq("id", id);
      if (error) {
        alert("Error al actualizar: " + error.message);
        e.target.checked = !activo;
      } else {
        const u = listaUsuarios.find((x) => x.id === id);
        if (u) u.activo = activo;
        // update badge
        const row = e.target.closest("tr");
        if (row) {
          const badge = row.querySelector(".badge-enabled, .badge-disabled");
          if (badge) {
            badge.className = `badge ${activo ? "badge-enabled" : "badge-disabled"}`;
            badge.textContent = activo ? "Activo" : "Inactivo";
          }
        }
      }
    });
  });

  // Change rol
  tbody.querySelectorAll(".select-rol").forEach((sel) => {
    sel.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      const rol = e.target.value;
      const prev =
        e.target.dataset.prev || listaUsuarios.find((u) => u.id === id)?.rol;
      if (!confirm(`¿Cambiar el rol de este usuario a "${rol}"?`)) {
        e.target.value = prev;
        return;
      }
      const { error } = await supabase
        .from("perfiles")
        .update({ rol })
        .eq("id", id);
      if (error) {
        alert("Error: " + error.message);
        e.target.value = prev;
      } else {
        const u = listaUsuarios.find((x) => x.id === id);
        if (u) u.rol = rol;
      }
    });
  });
}

// ============================================================
// MODAL — Create / Edit Event
// ============================================================
let editingId = null;

function openModal(id = null) {
  editingId = id;
  document.getElementById("modalError").style.display = "none";
  document.getElementById("eventoForm").reset();
  document.getElementById("modalTitle").textContent = id
    ? "Editar Evento"
    : "Nuevo Evento";
  document.getElementById("btnSave").textContent = id
    ? "Guardar cambios"
    : "Crear evento";

  if (id) {
    const ev = listaEventos.find((e) => e.id === id);
    if (ev) {
      document.getElementById("evTitulo").value = ev.titulo;
      document.getElementById("evDescripcion").value = ev.descripcion;
      document.getElementById("evFecha").value = ev.fecha;
      document.getElementById("evHora").value = ev.hora;
      document.getElementById("evLugar").value = ev.lugar || "";
      document.getElementById("evCupo").value = ev.cupo_maximo;
      document.getElementById("evModalidad").value = ev.modalidad;
      document.getElementById("evEstado").value = ev.estado;
    }
  }
  document.getElementById("modalOverlay").classList.add("open");
  document.getElementById("evTitulo").focus();
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
  editingId = null;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById("btnSave");
  btn.disabled = true;
  btn.textContent = "Guardando...";
  document.getElementById("modalError").style.display = "none";

  const payload = {
    titulo: document.getElementById("evTitulo").value.trim(),
    descripcion: document.getElementById("evDescripcion").value.trim(),
    fecha: document.getElementById("evFecha").value,
    hora: document.getElementById("evHora").value,
    lugar: document.getElementById("evLugar").value.trim(),
    cupo_maximo: parseInt(document.getElementById("evCupo").value),
    modalidad: document.getElementById("evModalidad").value,
    estado: document.getElementById("evEstado").value,
  };

  try {
    let error;
    if (editingId) {
      ({ error } = await supabase
        .from("eventos")
        .update(payload)
        .eq("id", editingId));
    } else {
      payload.creado_por = sessionUser.id;
      if (!payload.imagenes_url) payload.imagenes_url = [];
      ({ error } = await supabase.from("eventos").insert([payload]));
    }
    if (error) throw error;
    closeModal();
    await Promise.all([loadStats(), loadEventos()]);
    renderCharts();
  } catch (err) {
    document.getElementById("modalError").textContent = err.message;
    document.getElementById("modalError").style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = editingId ? "Guardar cambios" : "Crear evento";
  }
}

// ============================================================
// DELETE EVENT
// ============================================================
async function promptDelete(id) {
  const ev = listaEventos.find((e) => e.id === id);
  if (
    !confirm(
      `¿Eliminar el evento "${ev?.titulo}"? Esta acción no se puede deshacer.`,
    )
  )
    return;
  const { error } = await supabase.from("eventos").delete().eq("id", id);
  if (error) {
    alert("Error: " + error.message);
    return;
  }
  await Promise.all([loadStats(), loadEventos()]);
  renderCharts();
}

// ============================================================
// EXPORT CSV
// ============================================================
function exportEventosCSV() {
  const rows = [
    [
      "Título",
      "Creador",
      "Fecha",
      "Hora",
      "Lugar",
      "Modalidad",
      "Estado",
      "Cupo",
    ],
  ];
  listaEventos.forEach((ev) =>
    rows.push([
      ev.titulo,
      ev.perfiles?.nombre_completo || "",
      ev.fecha,
      ev.hora,
      ev.lugar || "",
      ev.modalidad,
      ev.estado,
      ev.cupo_maximo,
    ]),
  );
  downloadCSV(
    rows,
    `eventos_admin_${new Date().toISOString().split("T")[0]}.csv`,
  );
}

function exportUsuariosCSV() {
  const rows = [["Nombre", "Rol", "Estado", "Registro"]];
  listaUsuarios.forEach((u) =>
    rows.push([
      u.nombre_completo || "",
      u.rol,
      u.activo !== false ? "Activo" : "Inactivo",
      new Date(u.created_at).toLocaleDateString("es-MX"),
    ]),
  );
  downloadCSV(
    rows,
    `usuarios_admin_${new Date().toISOString().split("T")[0]}.csv`,
  );
}

function downloadCSV(rows, filename) {
  const content = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\ufeff" + content], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
// PERSONAL — Upload Excel, Preview, Import, Table, Invite
// ============================================================
let listaPersonal   = [];
let previewRows     = [];
let selectedPersonal = new Set();

// Mapeo flexible de columnas del Excel
const COL_MAP = {
  nombre_completo:  ['nombre_completo','nombre','name','nombre completo'],
  correo:           ['correo','email','correo_electronico','e-mail','mail'],
  numero_control:   ['numero_control','no_control','num_control','control','número de control','no. control'],
  academia:         ['academia','departamento','depto','area','área'],
  rol_institucional:['rol_institucional','rol','puesto','cargo'],
};

function mapRow(rawRow) {
  const keys  = Object.keys(rawRow).map(k => k.toLowerCase().trim());
  const vals  = Object.values(rawRow);
  const mapped = {};
  for (const [field, aliases] of Object.entries(COL_MAP)) {
    const idx = keys.findIndex(k => aliases.includes(k));
    mapped[field] = idx !== -1 ? String(vals[idx] ?? '').trim() : '';
  }
  return mapped;
}

function initPersonalTab() {
  const zone       = document.getElementById('uploadZone');
  const fileInput  = document.getElementById('fileInputPersonal');
  const uploadLink = document.getElementById('uploadLink');

  uploadLink.addEventListener('click', () => fileInput.click());
  zone.addEventListener('click', e => { if (e.target !== uploadLink) fileInput.click(); });
  fileInput.addEventListener('change', e => { if (e.target.files[0]) handleExcelFile(e.target.files[0]); });

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleExcelFile(e.dataTransfer.files[0]);
  });

  document.getElementById('btnCancelImport').addEventListener('click', cancelPreview);
  document.getElementById('btnConfirmImport').addEventListener('click', () => importarPersonal(previewRows));

  document.getElementById('searchPersonal').addEventListener('input', applyPersonalFilter);
  document.getElementById('filterAcademia').addEventListener('change', applyPersonalFilter);

  document.getElementById('selectAllPersonal').addEventListener('change', e => {
    const checks = document.querySelectorAll('.chk-personal');
    checks.forEach(c => {
      c.checked = e.target.checked;
      const id  = c.dataset.id;
      if (e.target.checked) selectedPersonal.add(id);
      else selectedPersonal.delete(id);
    });
    updateSelectedCount();
  });

  document.getElementById('selectEventoInvite').addEventListener('change', updateEnviarBtn);
  document.getElementById('btnEnviarInvitaciones').addEventListener('click', enviarInvitaciones);
  document.getElementById('btnDescargarPlantilla').addEventListener('click', downloadPlantilla);
  document.getElementById('btnExportPersonal').addEventListener('click', exportPersonalCSV);
}

// ---- Parsear Excel con SheetJS ----
function handleExcelFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const raw  = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!raw.length) { alert('El archivo está vacío o no tiene datos.'); return; }

      previewRows = raw.map(mapRow).filter(r => r.correo); // Requiere correo

      const sinCorreo = raw.length - previewRows.length;
      document.getElementById('previewCount').textContent   = previewRows.length;
      document.getElementById('previewErrors').textContent  =
        sinCorreo > 0 ? `⚠️ ${sinCorreo} fila(s) omitidas por no tener correo.` : '';

      const tbody = document.getElementById('previewTbody');
      tbody.innerHTML = previewRows.map(r => `
        <tr>
          <td style="font-weight:600">${r.nombre_completo || '<sin nombre>'}</td>
          <td style="font-size:0.82rem;opacity:0.8">${r.correo}</td>
          <td>${r.numero_control}</td>
          <td>${r.academia}</td>
          <td>${r.rol_institucional || 'Docente'}</td>
        </tr>`).join('');

      document.getElementById('previewSection').style.display = 'block';
    } catch (err) {
      alert('Error al leer el archivo: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
  document.getElementById('fileInputPersonal').value = '';
}

function cancelPreview() {
  previewRows = [];
  document.getElementById('previewSection').style.display = 'none';
}

// ---- Importar a Supabase (upsert por correo) ----
async function importarPersonal(rows) {
  const btn = document.getElementById('btnConfirmImport');
  btn.disabled = true;
  btn.textContent = 'Importando...';

  const payload = rows.map(r => ({
    nombre_completo:   r.nombre_completo || '(Sin nombre)',
    correo:            r.correo.toLowerCase(),
    numero_control:    r.numero_control  || null,
    academia:          r.academia        || null,
    rol_institucional: r.rol_institucional || 'Docente',
    activo: true,
  }));

  const { error } = await supabase
    .from('personal')
    .upsert(payload, { onConflict: 'correo' });

  btn.disabled = false;
  btn.textContent = 'Confirmar importación';

  if (error) {
    alert('Error al importar: ' + error.message);
    return;
  }

  cancelPreview();
  await loadPersonal();
  await loadEventosParaInvitar();
}

// ---- Cargar personal de Supabase ----
async function loadPersonal() {
  const tbody = document.getElementById('personalTbody');
  tbody.innerHTML = `<tr class="loading-row"><td colspan="7">Cargando personal...</td></tr>`;

  const { data, error } = await supabase
    .from('personal')
    .select('*')
    .order('academia', { ascending: true })
    .order('nombre_completo', { ascending: true });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#f87171;padding:30px">Error: ${error.message}</td></tr>`;
    return;
  }

  listaPersonal = data || [];

  // Llenar filtro de academias
  const academias = [...new Set(listaPersonal.map(p => p.academia).filter(Boolean))].sort();
  const sel       = document.getElementById('filterAcademia');
  const current   = sel.value;
  sel.innerHTML   = '<option value="">Todas las academias</option>';
  academias.forEach(a => {
    const opt    = document.createElement('option');
    opt.value    = a;
    opt.textContent = a;
    if (a === current) opt.selected = true;
    sel.appendChild(opt);
  });

  renderPersonal(listaPersonal);
}

function applyPersonalFilter() {
  const q   = document.getElementById('searchPersonal').value.toLowerCase();
  const ac  = document.getElementById('filterAcademia').value;
  const filtered = listaPersonal.filter(p =>
    (q === '' || (p.nombre_completo || '').toLowerCase().includes(q) || (p.correo || '').toLowerCase().includes(q)) &&
    (ac === '' || p.academia === ac)
  );
  renderPersonal(filtered);
}

function renderPersonal(lista) {
  const tbody = document.getElementById('personalTbody');
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" class="icon-lg" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
      <p>No hay personal registrado</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  lista.forEach(p => {
    const activo = p.activo !== false;
    const isSelected = selectedPersonal.has(p.id);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="chk-personal" data-id="${p.id}" ${isSelected ? 'checked' : ''}></td>
      <td style="font-weight:600">${p.nombre_completo}</td>
      <td style="font-size:0.82rem;opacity:0.8">${p.correo}</td>
      <td>${p.numero_control || '—'}</td>
      <td><span class="badge badge-academia">${p.academia || '—'}</span></td>
      <td style="font-size:0.82rem">${p.rol_institucional || 'Docente'}</td>
      <td><span class="badge ${activo ? 'badge-enabled' : 'badge-disabled'}">${activo ? 'Activo' : 'Inactivo'}</span></td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.chk-personal').forEach(chk => {
    chk.addEventListener('change', e => {
      const id = e.target.dataset.id;
      if (e.target.checked) selectedPersonal.add(id);
      else selectedPersonal.delete(id);
      document.getElementById('selectAllPersonal').indeterminate =
        selectedPersonal.size > 0 && selectedPersonal.size < listaPersonal.length;
      updateSelectedCount();
    });
  });
}

function updateSelectedCount() {
  const n = selectedPersonal.size;
  document.getElementById('selectedCountText').textContent = `${n} persona(s) seleccionada(s)`;
  updateEnviarBtn();
}

function updateEnviarBtn() {
  const btn       = document.getElementById('btnEnviarInvitaciones');
  const eventoId  = document.getElementById('selectEventoInvite').value;
  btn.disabled    = selectedPersonal.size === 0 || !eventoId;
}

// ---- Cargar eventos activos para el selector de invitaciones ----
async function loadEventosParaInvitar() {
  const { data } = await supabase
    .from('eventos')
    .select('id, titulo, fecha')
    .eq('estado', 'Activo')
    .order('fecha', { ascending: true });

  const sel = document.getElementById('selectEventoInvite');
  sel.innerHTML = '<option value="">Selecciona el evento...</option>';
  (data || []).forEach(ev => {
    const opt = document.createElement('option');
    opt.value = ev.id;
    const f   = new Date(ev.fecha + 'T00:00:00').toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
    opt.textContent = `${ev.titulo} — ${f}`;
    sel.appendChild(opt);
  });
}

// ---- Enviar invitaciones (llama Edge Function) ----
async function enviarInvitaciones() {
  const eventoId    = document.getElementById('selectEventoInvite').value;
  const personal_ids = [...selectedPersonal];
  const btn         = document.getElementById('btnEnviarInvitaciones');
  const resDiv      = document.getElementById('invitesResult');

  if (!eventoId || !personal_ids.length) return;

  btn.disabled     = true;
  btn.textContent  = 'Enviando...';
  resDiv.style.display = 'none';

  const { data, error } = await supabase.functions.invoke('send-invites', {
    body: { evento_id: eventoId, personal_ids },
  });

  btn.disabled    = false;
  btn.innerHTML   = `<svg viewBox="0 0 24 24" fill="none" class="icon" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Enviar correos`;
  resDiv.style.display = 'block';

  if (error) {
    resDiv.className   = 'invites-result error';
    resDiv.textContent = '❌ Error: ' + error.message;
    return;
  }

  const r = data;
  resDiv.className = r.errores > 0 && r.enviados === 0 ? 'invites-result error' : 'invites-result success';
  resDiv.innerHTML = `✅ <strong>${r.enviados}</strong> correo(s) enviados` +
    (r.omitidos ? ` · <strong>${r.omitidos}</strong> ya habían respondido` : '') +
    (r.errores  ? ` · <strong>${r.errores}</strong> error(es)` : '');
}

// ---- Descargar plantilla Excel de ejemplo ----
function downloadPlantilla() {
  const wb  = XLSX.utils.book_new();
  const ws  = XLSX.utils.aoa_to_sheet([
    ['nombre_completo', 'correo', 'numero_control', 'academia', 'rol_institucional'],
    ['Juan García López', 'juan.garcia@cuautla.tecnm.mx', '20010001', 'Sistemas Computacionales', 'Docente'],
    ['María Pérez Ruiz', 'maria.perez@cuautla.tecnm.mx', '20010002', 'Gestión Empresarial', 'Coordinador'],
  ]);
  ws['!cols'] = [{wch:30},{wch:35},{wch:16},{wch:28},{wch:20}];
  XLSX.utils.book_append_sheet(wb, ws, 'Personal');
  XLSX.writeFile(wb, 'plantilla_personal.xlsx');
}

// ---- Exportar personal como CSV ----
function exportPersonalCSV() {
  const rows = [['Nombre','Correo','No. Control','Academia','Rol','Estado']];
  listaPersonal.forEach(p => rows.push([
    p.nombre_completo || '',
    p.correo,
    p.numero_control  || '',
    p.academia        || '',
    p.rol_institucional || 'Docente',
    p.activo !== false ? 'Activo' : 'Inactivo',
  ]));
  downloadCSV(rows, `personal_${new Date().toISOString().split('T')[0]}.csv`);
}

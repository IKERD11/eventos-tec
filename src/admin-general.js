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
window.calendarInstance = null;

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

  /* ---- Participantes panel ---- */
  initParticipantesPanel();

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

  /* ---- Calendar Modal ---- */
  const calModal = document.getElementById("calEventModal");
  if (calModal) {
    document.getElementById("closeCalModal").addEventListener("click", () => {
      calModal.style.display = "none";
    });
    calModal.addEventListener("click", (e) => {
      if (e.target === calModal) calModal.style.display = "none";
    });
  }

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

  /* ---- Sidebar Submenu Eventos ---- */
  const toggleSubmenuEventos = document.getElementById("toggleAdminSubmenuEventos");
  const submenuEventos = document.getElementById("adminSubmenuEventos");

  if (toggleSubmenuEventos && submenuEventos) {
    toggleSubmenuEventos.addEventListener("click", (e) => {
      e.preventDefault();
      toggleSubmenuEventos.classList.toggle("expanded");
      submenuEventos.classList.toggle("expanded");

      // Also switch to the Eventos tab
      const tabBtns = document.querySelectorAll(".tab-btn");
      const tabPanels = document.querySelectorAll(".tab-panel");
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabPanels.forEach((p) => p.classList.remove("active"));

      const targetBtn = document.getElementById("tabBtnEventos");
      const targetPanel = document.getElementById("tabEventos");
      if (targetBtn) targetBtn.classList.add("active");
      if (targetPanel) targetPanel.classList.add("active");
    });

    // Submenu filtering items
    const sidebarFilters = document.querySelectorAll(".admin-sidebar-filter");
    sidebarFilters.forEach((filterLnk) => {
      filterLnk.addEventListener("click", (e) => {
        e.preventDefault();
        sidebarFilters.forEach(f => f.classList.remove("active"));
        e.currentTarget.classList.add("active");

        // Ensure Eventos tab is active
        const targetBtn = document.getElementById("tabBtnEventos");
        const targetPanel = document.getElementById("tabEventos");
        if (targetBtn && !targetBtn.classList.contains("active")) {
          const tabBtns = document.querySelectorAll(".tab-btn");
          const tabPanels = document.querySelectorAll(".tab-panel");
          tabBtns.forEach((b) => b.classList.remove("active"));
          tabPanels.forEach((p) => p.classList.remove("active"));
          targetBtn.classList.add("active");
          if (targetPanel) targetPanel.classList.add("active");
        }

        applyEventosFilter();
      });
    });
  }

  // Also bind the new filterTiempo
  const filterTiempo = document.getElementById("filterTiempo");
  if (filterTiempo) {
    filterTiempo.addEventListener("change", applyEventosFilter);
  }

  /* ---- Initial Data Load ---- */
  initCalendar();
  await Promise.all([loadStats(), loadEventos(), loadUsuarios(), loadPersonal()]);
  await loadEventosParaInvitar();
  renderCharts();

  // Custom Select initialization
  initCustomSelects();
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
            backgroundColor: "rgba(0, 230, 118, 0.4)",
            borderColor: "#00e676",
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
              "rgba(0, 230, 118, 0.7)",
              "rgba(100,116,139,0.7)",
              "rgba(239,68,68,0.7)",
            ],
            borderColor: ["#00e676", "#64748b", "#ef4444"],
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

    // Convertir dinámicamente eventos pasados a "Inactivo"
    const now = new Date();
    listaEventos = (data || []).map(ev => {
      // Solo sobreescribimos visualmente si estaba "Activo" y ya pasó
      if (ev.estado === "Activo" && ev.fecha) {
        const baseHora = ev.hora ? ev.hora.substring(0, 5) : "00:00";
        const evDate = new Date(`${ev.fecha}T${baseHora}:00`);
        if (!isNaN(evDate.getTime()) && evDate < now) {
          ev.estado = "Inactivo";
        }
      }
      return ev;
    });

    renderEventos(listaEventos);
    updateCalendarEvents();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#f87171;padding:30px">Error al cargar eventos: ${e.message}</td></tr>`;
  }
}

function applyEventosFilter() {
  const q = document.getElementById("searchEventos").value.toLowerCase();
  const estado = document.getElementById("filterEstado").value;
  const modalidad = document.getElementById("filterModalidad").value;

  // New filters
  const tiempoEl = document.getElementById("filterTiempo");
  const tiempo = tiempoEl ? tiempoEl.value : "";

  const activeCarreraEl = document.querySelector(".admin-sidebar-filter.active");
  const carrera = activeCarreraEl ? activeCarreraEl.getAttribute("data-carrera") : "";

  const now = new Date();

  const filtered = listaEventos.filter(
    (ev) => {
      // time check
      let timeMatch = true;
      if (tiempo === "Proximos" || tiempo === "Pasados") {
        if (!ev.fecha) {
          timeMatch = false;
        } else {
          // Extraemos solo HH:MM por si ya viene con segundos desde la base de datos
          const baseHora = ev.hora ? ev.hora.substring(0, 5) : "00:00";
          const evDate = new Date(`${ev.fecha}T${baseHora}:00`);
          if (isNaN(evDate.getTime())) {
            timeMatch = false;
          } else {
            if (tiempo === "Proximos") timeMatch = evDate >= now;
            else timeMatch = evDate < now;
          }
        }
      }

      // career check
      const careerMatch = (!carrera || ev.clasificacion === carrera);

      return (
        (q === "" ||
          ev.titulo.toLowerCase().includes(q) ||
          (ev.lugar || "").toLowerCase().includes(q)) &&
        (estado === "" || ev.estado === estado) &&
        (modalidad === "" || ev.modalidad === modalidad) &&
        timeMatch &&
        careerMatch
      );
    }
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
    const estadoClass = (ev.estado || '').toLowerCase();
    const fecha = new Date(ev.fecha + "T00:00:00").toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td style="font-weight:600;" title="${ev.titulo}">${ev.titulo}</td>
            <td style="font-size:0.85rem; color: #94a3b8;">${ev.perfiles?.nombre_completo || "—"}</td>
            <td>${fecha}</td>
            <td>${ev.lugar || "—"}</td>
            <td>${ev.modalidad}</td>
            <td><span class="status-badge ${estadoClass}">${ev.estado}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn-icon view btn-participantes" data-id="${ev.id}" data-titulo="${ev.titulo}" data-fecha="${ev.fecha}" title="Ver Participantes">
                        <svg viewBox="0 0 24 24" fill="none" class="icon" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                    </button>
                    <button class="btn-icon view btn-gallery" data-id="${ev.id}" title="Ver Fotos">
                        <svg viewBox="0 0 24 24" fill="none" class="icon" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    </button>
                    <button class="btn-icon edit btn-edit" data-id="${ev.id}" title="Editar Evento">
                        <svg viewBox="0 0 24 24" fill="none" class="icon" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-icon delete btn-delete" data-id="${ev.id}" title="Eliminar Evento">
                        <svg viewBox="0 0 24 24" fill="none" class="icon" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                </div>
            </td>`;
    tbody.appendChild(tr);
  });

  // Bind actions
  tbody.querySelectorAll(".btn-participantes").forEach((btn) =>
    btn.addEventListener("click", () =>
      openParticipantesPanel(btn.dataset.id, btn.dataset.titulo, btn.dataset.fecha)
    )
  );
  tbody.querySelectorAll(".btn-gallery").forEach((btn) =>
    btn.addEventListener("click", () =>
      openGalleryModal(btn.dataset.id)
    )
  );
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

  // Initialize dynamic selects
  initCustomSelects();
}

// ============================================================
// CALENDAR INIT AND UPDATE
// ============================================================
function initCalendar() {
  const calendarEl = document.getElementById("calendar");
  if (!calendarEl || typeof FullCalendar === "undefined") return;

  window.calendarInstance = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    locale: "es",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay",
    },
    buttonText: {
      today: "Hoy",
      month: "Mes",
      week: "Semana",
      day: "Día",
      list: "Lista",
    },
    events: [],
    selectable: true,
    selectMirror: true,
    select: function (info) {
      // Abre modal de crear evento con fecha preseleccionada si es admin
      openModal();
      setTimeout(() => {
        const start = info.start;
        const yyyy = start.getFullYear();
        const mm = String(start.getMonth() + 1).padStart(2, '0');
        const dd = String(start.getDate()).padStart(2, '0');

        document.getElementById("evFecha").value = `${yyyy}-${mm}-${dd}`;

        if (!info.allDay) {
          const hh = String(start.getHours()).padStart(2, '0');
          const mins = String(start.getMinutes()).padStart(2, '0');
          document.getElementById("evHora").value = `${hh}:${mins}`;
        } else {
          document.getElementById("evHora").value = "";
        }
      }, 50);
      window.calendarInstance.unselect();
    },
    eventClick: function (info) {
      openCalEventModal(info.event);
    },
  });

  window.calendarInstance.render();
}

function updateCalendarEvents() {
  if (!window.calendarInstance) return;

  // Filtrar cancelados si se desea, o mostrarlos con otro color
  const validEvents = listaEventos.filter(ev => ev.estado !== 'Cancelado');

  const mappedEvents = validEvents.map((ev) => {
    const baseHora = ev.hora ? ev.hora.substring(0, 5) : "00:00";
    const startStr = `${ev.fecha}T${baseHora}:00`;
    let endStr = startStr;
    try {
      endStr = new Date(new Date(startStr).getTime() + 2 * 60 * 60 * 1000).toISOString();
    } catch (e) { }

    return {
      id: ev.id,
      title: ev.titulo,
      start: startStr,
      end: endStr,
      backgroundColor: ev.estado === "Activo" ? "var(--ag-accent)" : "grey",
      borderColor: "transparent",
      extendedProps: {
        descripcion: ev.descripcion,
        lugar: ev.lugar,
        modalidad: ev.modalidad,
        estado: ev.estado,
        hora: baseHora,
        fechaStr: ev.fecha,
        imagenes_url: ev.imagenes_url // pass photos
      },
      // for light text contrast in dark bg if needed
      textColor: ev.estado === "Activo" ? "#0f172a" : "#fff"
    };
  });

  window.calendarInstance.removeAllEvents();
  window.calendarInstance.addEventSource(mappedEvents);
}

function openCalEventModal(eventObj) {
  const props = eventObj.extendedProps;
  document.getElementById("mcTitle").textContent = eventObj.title;

  // Hero Image logic
  const heroGlow = document.querySelector("#calEventModal .ed-hero-glow");
  if (props.estado === "Pasado" && props.imagenes_url && props.imagenes_url.length > 0) {
    // Add background image and clear the animated gradient by overriding background
    // using a pseudo-element style or direct inline background with a dark tint overlay
    heroGlow.style.background = `linear-gradient(to top, rgba(15,23,42,1) 0%, rgba(15,23,42,0.4) 100%), url('${props.imagenes_url[0]}') center/cover no-repeat`;
    heroGlow.style.animation = 'none'; // pause animation just in case
  } else {
    // Reset to original gradient
    heroGlow.style.background = '';
    heroGlow.style.animation = '';
  }

  // New Neon Float IDs
  document.getElementById("mcDateDisplay").textContent = props.fechaStr || "--";
  document.getElementById("mcTimeDisplay").textContent = props.hora || "--";

  // Badges (Modality & Status fallback)
  document.getElementById("mcMod").textContent = props.modalidad || "--";
  if (document.getElementById("mcClasif")) {
    document.getElementById("mcClasif").textContent = props.estado || "Activo";
  }

  document.getElementById("mcDesc").textContent = props.descripcion || "Sin descripción";
  document.getElementById("mcLugar").textContent = props.lugar || "Por definir";

  const btnPart = document.getElementById("mcBtnPart");
  btnPart.href = "#";
  btnPart.onclick = (e) => {
    e.preventDefault();
    document.getElementById("calEventModal").style.display = "none";
    openParticipantesPanel(eventObj.id, eventObj.title, props.fechaStr);
  };

  document.getElementById("calEventModal").style.display = "flex";
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
    const rolClass = (u.rol || '').toLowerCase();
    const fecha = new Date(u.created_at).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const isMe = u.id === myId;
    const activo = u.activo !== false; // default true if null
    const estadoClass = activo ? 'activo' : 'inactivo';

    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td style="font-weight:600;">${u.nombre_completo || "(Sin nombre)"}</td>
            <td><span class="status-badge ${rolClass}">${u.rol}</span></td>
            <td><span class="status-badge ${estadoClass}">${activo ? "Activo" : "Inactivo"}</span></td>
            <td style="font-size:0.85rem; color: #94a3b8;">${fecha}</td>
            <td>
                <div class="action-buttons">
                    <select class="select-filter select-rol" data-id="${u.id}" style="min-width: 110px;" ${isMe ? "disabled" : ""}>
                        <option value="docente"   ${u.rol === "docente" ? "selected" : ""}>Docente</option>
                        <option value="academia"  ${u.rol === "academia" ? "selected" : ""}>Academia</option>
                        <option value="admin"     ${u.rol === "admin" ? "selected" : ""}>Admin</option>
                    </select>
                </div>
            </td>`;
    tbody.appendChild(tr);
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
        applyUsuariosFilter(); // Re-render to apply new badge class
      }
    });
  });

  // Initialize dynamic selects
  initCustomSelects();
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

      updateFormCustomSelect('evModalidad', 'customSelectFormModalidad', ev.modalidad);
      updateFormCustomSelect('evEstado', 'customSelectFormEstado', ev.estado);
      updateFormCustomSelect('evClasificacion', 'customSelectFormClasificacion', ev.clasificacion || 'Institucional');
    }
  } else {
    updateFormCustomSelect('evModalidad', 'customSelectFormModalidad', 'Presencial');
    updateFormCustomSelect('evEstado', 'customSelectFormEstado', 'Activo');
    updateFormCustomSelect('evClasificacion', 'customSelectFormClasificacion', 'Institucional');
  }
  document.getElementById("modalOverlay").classList.add("open");
  document.getElementById("evTitulo").focus();
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
  editingId = null;
}

// --- Form Custom Select Helpers ---
function updateFormCustomSelect(inputId, selectContainerId, value) {
  document.getElementById(inputId).value = value;
  const container = document.getElementById(selectContainerId);
  if (!container) return;
  container.dataset.value = value;
  const textSpan = container.querySelector('.select-text');

  // Find text corresponding to value
  const items = container.querySelectorAll('.select-items div');
  let foundText = value;
  items.forEach(item => {
    if (item.dataset.value === value) {
      foundText = item.textContent;
    }
  });
  if (textSpan) textSpan.textContent = foundText;
}

function setupFormCustomSelects() {
  document.querySelectorAll('.form-custom-select').forEach(container => {
    const selected = container.querySelector('.select-selected');
    const items = container.querySelector('.select-items');
    // Extract base ID to match hidden input
    // Since we used customSelectFormModalidad and evModalidad, etc.
    const hiddenInputId = container.id.replace('customSelectForm', 'ev');

    selected.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Close others
      document.querySelectorAll('.select-items').forEach(i => {
        if (i !== items) i.classList.add('select-hide');
      });
      items.classList.toggle('select-hide');
    });

    items.querySelectorAll('div').forEach(opt => {
      opt.addEventListener('click', (e) => {
        updateFormCustomSelect(hiddenInputId, container.id, opt.dataset.value);
        items.classList.add('select-hide');
      });
    });
  });

  // Close selects when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.select-items').forEach(i => i.classList.add('select-hide'));
  });
}

// Call the setup after DOM load / modal setup
setupFormCustomSelects();

async function handleFormSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById("btnSave");
  btn.disabled = true;
  btn.textContent = "Guardando...";
  document.getElementById("modalError").style.display = "none";

  const payload = {
    titulo: document.getElementById("evTitulo").value.trim(),
    descripcion: document.getElementById("evDescripcion").value.trim(),
    clasificacion: document.getElementById("evClasificacion").value,
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
let listaPersonal = [];
let previewRows = [];
let selectedPersonal = new Set();

// Mapeo flexible de columnas del Excel
const COL_MAP = {
  nombre_completo: ['nombre_completo', 'nombre', 'name', 'nombre completo'],
  correo: ['correo', 'email', 'correo_electronico', 'e-mail', 'mail'],
  numero_control: ['numero_control', 'no_control', 'num_control', 'control', 'número de control', 'no. control'],
  academia: ['academia', 'departamento', 'depto', 'area', 'área'],
  rol_institucional: ['rol_institucional', 'rol', 'puesto', 'cargo'],
};

function mapRow(rawRow) {
  const keys = Object.keys(rawRow).map(k => k.toLowerCase().trim());
  const vals = Object.values(rawRow);
  const mapped = {};
  for (const [field, aliases] of Object.entries(COL_MAP)) {
    const idx = keys.findIndex(k => aliases.includes(k));
    mapped[field] = idx !== -1 ? String(vals[idx] ?? '').trim() : '';
  }
  return mapped;
}

function initPersonalTab() {
  const zone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInputPersonal');
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
      const id = c.dataset.id;
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
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!raw.length) { alert('El archivo está vacío o no tiene datos.'); return; }

      previewRows = raw.map(mapRow).filter(r => r.correo); // Requiere correo

      const sinCorreo = raw.length - previewRows.length;
      document.getElementById('previewCount').textContent = previewRows.length;
      document.getElementById('previewErrors').textContent =
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
    nombre_completo: r.nombre_completo || '(Sin nombre)',
    correo: r.correo.toLowerCase(),
    numero_control: r.numero_control || null,
    academia: r.academia || null,
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

// ============================================================
// CUSTOM DROPDOWNS LOGIC
// ============================================================
function initCustomSelects() {
  document.querySelectorAll("select.select-filter").forEach((select) => {
    // Prevent double initialization
    if (select.closest(".custom-select-wrapper") || select.classList.contains("custom-select-initialized")) return;
    select.classList.add("custom-select-initialized");

    const wrapper = document.createElement("div");
    wrapper.className = "custom-select-wrapper";
    // Sync wrapper width
    if (select.style.minWidth) {
      wrapper.style.minWidth = select.style.minWidth;
    }

    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    select.style.display = "none";

    const trigger = document.createElement("div");
    trigger.className = "custom-select-trigger";
    // If the select is disabled, lower its opacity and prevent actions
    if (select.disabled) {
      trigger.style.opacity = "0.5";
      trigger.style.cursor = "not-allowed";
    }

    let initialText = select.options.length > 0 && select.selectedIndex >= 0
      ? select.options[select.selectedIndex].text
      : "Selecciona...";

    trigger.innerHTML = `<span>${initialText}</span>
    <svg viewBox="0 0 24 24" fill="none" style="width:16px;height:16px;margin-left:8px;" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>`;
    wrapper.appendChild(trigger);

    const optionsList = document.createElement("div");
    optionsList.className = "custom-select-options";

    Array.from(select.options).forEach((opt) => {
      const optionItem = document.createElement("div");
      optionItem.className = "custom-option";
      optionItem.textContent = opt.text;
      if (opt.selected) optionItem.classList.add("selected");

      optionItem.addEventListener("click", () => {
        if (select.disabled) return;
        select.value = opt.value;
        trigger.querySelector("span").textContent = opt.text;
        optionsList.querySelectorAll(".custom-option").forEach((o) => o.classList.remove("selected"));
        optionItem.classList.add("selected");
        optionsList.classList.remove("open");
        trigger.classList.remove("open");
        wrapper.classList.remove("open");
        wrapper.style.zIndex = "";

        // Disparar evento native 'change'
        select.dispatchEvent(new Event("change"));
      });
      optionsList.appendChild(optionItem);
    });

    wrapper.appendChild(optionsList);

    trigger.addEventListener("click", (e) => {
      if (select.disabled) return;
      e.stopPropagation();

      const isOpen = optionsList.classList.contains("open");

      // Close all other selects first
      document.querySelectorAll(".custom-select-options.open").forEach((list) => {
        if (list !== optionsList) {
          list.classList.remove("open");
          list.previousElementSibling?.classList.remove("open");
          const otherWrapper = list.closest('.custom-select-wrapper');
          if (otherWrapper) {
            otherWrapper.classList.remove("open");
            otherWrapper.style.zIndex = "";
            const row = otherWrapper.closest("tr");
            if (row) row.style.zIndex = "";
          }
        }
      });

      // Toggle current
      if (isOpen) {
        optionsList.classList.remove("open");
        trigger.classList.remove("open");
        wrapper.classList.remove("open");
        wrapper.style.zIndex = "";
        const row = wrapper.closest("tr");
        if (row) row.style.zIndex = "";
      } else {
        optionsList.classList.add("open");
        trigger.classList.add("open");
        wrapper.classList.add("open");
        // Elevate z-index directly to overcome flex container dom ordering
        wrapper.style.zIndex = "9999";
        const row = wrapper.closest("tr");
        if (row) {
          row.style.position = "relative";
          row.style.zIndex = "99";
        }
      }
    });

    // Si cambia el value desde JS, sincronizar el texto visual (útil para cuando se resetea por error)
    select.addEventListener('change', () => {
      const selectedOpt = select.options[select.selectedIndex];
      if (selectedOpt) {
        trigger.querySelector("span").textContent = selectedOpt.text;
        optionsList.querySelectorAll(".custom-option").forEach(o => {
          if (o.textContent === selectedOpt.text) o.classList.add('selected');
          else o.classList.remove('selected');
        });
      }
    });
  });

  // Cerrar menus al hacer click fuera
  document.addEventListener("click", (e) => {
    if (!e.target.closest('.custom-select-wrapper')) {
      document.querySelectorAll(".custom-select-options.open").forEach((list) => {
        list.classList.remove("open");
        if (list.previousElementSibling) list.previousElementSibling.classList.remove("open");

        const wrapper = list.closest('.custom-select-wrapper');
        if (wrapper) {
          wrapper.classList.remove("open");
          wrapper.style.zIndex = "";
          const row = wrapper.closest("tr");
          if (row) row.style.zIndex = "";
        }
      });
    }
  });
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
  const sel = document.getElementById('filterAcademia');
  const current = sel.value;
  sel.innerHTML = '<option value="">Todas las academias</option>';
  academias.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    if (a === current) opt.selected = true;
    sel.appendChild(opt);
  });

  renderPersonal(listaPersonal);
}

function applyPersonalFilter() {
  const q = document.getElementById('searchPersonal').value.toLowerCase();
  const ac = document.getElementById('filterAcademia').value;
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
  const btn = document.getElementById('btnEnviarInvitaciones');
  const eventoId = document.getElementById('selectEventoInvite').value;
  btn.disabled = selectedPersonal.size === 0 || !eventoId;
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
    const f = new Date(ev.fecha + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    opt.textContent = `${ev.titulo} — ${f}`;
    sel.appendChild(opt);
  });
}

// ---- Enviar invitaciones (llama Edge Function) ----
async function enviarInvitaciones() {
  const eventoId = document.getElementById('selectEventoInvite').value;
  const personal_ids = [...selectedPersonal];
  const btn = document.getElementById('btnEnviarInvitaciones');
  const resDiv = document.getElementById('invitesResult');

  if (!eventoId || !personal_ids.length) return;

  btn.disabled = true;
  btn.textContent = 'Enviando...';
  resDiv.style.display = 'none';

  const { data, error } = await supabase.functions.invoke('send-invites', {
    body: { evento_id: eventoId, personal_ids },
  });

  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" class="icon" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Enviar correos`;
  resDiv.style.display = 'block';

  if (error) {
    resDiv.className = 'invites-result error';
    resDiv.textContent = '❌ Error: ' + error.message;
    return;
  }

  const r = data;
  resDiv.className = r.errores > 0 && r.enviados === 0 ? 'invites-result error' : 'invites-result success';
  resDiv.innerHTML = `✅ <strong>${r.enviados}</strong> correo(s) enviados` +
    (r.omitidos ? ` · <strong>${r.omitidos}</strong> ya habían respondido` : '') +
    (r.errores ? ` · <strong>${r.errores}</strong> error(es)` : '');
}

// ---- Descargar plantilla Excel de ejemplo ----
function downloadPlantilla() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['nombre_completo', 'correo', 'numero_control', 'academia', 'rol_institucional'],
    ['Juan García López', 'juan.garcia@cuautla.tecnm.mx', '20010001', 'Sistemas Computacionales', 'Docente'],
    ['María Pérez Ruiz', 'maria.perez@cuautla.tecnm.mx', '20010002', 'Gestión Empresarial', 'Coordinador'],
  ]);
  ws['!cols'] = [{ wch: 30 }, { wch: 35 }, { wch: 16 }, { wch: 28 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Personal');
  XLSX.writeFile(wb, 'plantilla_personal.xlsx');
}

// ---- Exportar personal como CSV ----
function exportPersonalCSV() {
  const rows = [['Nombre', 'Correo', 'No. Control', 'Academia', 'Rol', 'Estado']];
  listaPersonal.forEach(p => rows.push([
    p.nombre_completo || '',
    p.correo,
    p.numero_control || '',
    p.academia || '',
    p.rol_institucional || 'Docente',
    p.activo !== false ? 'Activo' : 'Inactivo',
  ]));
  downloadCSV(rows, `personal_${new Date().toISOString().split('T')[0]}.csv`);
}

// ============================================================
// PANEL DE PARTICIPANTES POR EVENTO
// ============================================================
let pnlEventoId = null;
let pnlEventoData = null;  // { titulo, fecha }
let pnlPreviewRows = [];
let participantesDelEvento = [];

// Inicializar listeners del panel (se llama una vez en DOMContentLoaded)
function initParticipantesPanel() {
  document.getElementById('pnlClose').addEventListener('click', closeParticipantesPanel);
  document.getElementById('participantesOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeParticipantesPanel();
  });
  document.getElementById('pnlBtnImport').addEventListener('click', () =>
    document.getElementById('pnlFileInput').click()
  );
  document.getElementById('pnlFileInput').addEventListener('change', (e) => {
    if (e.target.files[0]) handlePnlExcel(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('pnlBtnCancelImport').addEventListener('click', cancelPnlImport);
  document.getElementById('pnlBtnConfirmImport').addEventListener('click', confirmPnlImport);
  document.getElementById('pnlBtnDownload').addEventListener('click', downloadParticipantesCSV);
}

function openParticipantesPanel(eventoId, titulo, fecha) {
  pnlEventoId = eventoId;
  pnlEventoData = { titulo, fecha };
  cancelPnlImport();

  document.getElementById('pnlEventoTitulo').textContent = titulo;
  const f = new Date(fecha + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  document.getElementById('pnlEventoFecha').textContent = f;

  document.getElementById('participantesOverlay').classList.add('open');
  loadParticipantesEvento();
}

function closeParticipantesPanel() {
  document.getElementById('participantesOverlay').classList.remove('open');
  pnlEventoId = null;
  pnlEventoData = null;
  cancelPnlImport();
}

async function loadParticipantesEvento() {
  if (!pnlEventoId) return;
  const tbody = document.getElementById('pnlParticipantesTbody');
  tbody.innerHTML = `<tr class="loading-row"><td colspan="6">Cargando...</td></tr>`;

  const { data, error } = await supabase
    .from('participantes')
    .select('*')
    .eq('evento_id', pnlEventoId)
    .order('created_at', { ascending: true });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:#f87171;text-align:center;padding:20px">Error: ${error.message}</td></tr>`;
    return;
  }

  participantesDelEvento = data || [];
  document.getElementById('pnlCount').textContent = `${participantesDelEvento.length} participante(s)`;

  if (!participantesDelEvento.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" class="icon-lg" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
      <p>Sin participantes aún. Importa un Excel para agregar.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  participantesDelEvento.forEach((p, i) => {
    const fecha = new Date(p.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    const estatusBadge = p.estatus === 'Confirmado'
      ? `<span class="badge badge-activo">Confirmado</span>`
      : `<span class="badge badge-disabled">En Espera</span>`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="opacity:0.5;font-size:0.8rem">${i + 1}</td>
      <td style="font-weight:600">${p.nombre}</td>
      <td style="font-size:0.82rem;opacity:0.8">${p.correo}</td>
      <td>${estatusBadge}</td>
      <td style="font-size:0.8rem;opacity:0.6">${fecha}</td>
      <td>
        <button class="btn-icon-sm danger btn-pnl-del" data-id="${p.id}" title="Eliminar participante">
          <svg viewBox="0 0 24 24" fill="none" class="icon" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-pnl-del').forEach(btn =>
    btn.addEventListener('click', () => deleteParticipante(btn.dataset.id))
  );
}

async function deleteParticipante(id) {
  if (!confirm('¿Eliminar este participante del evento?')) return;
  const { error } = await supabase.from('participantes').delete().eq('id', id);
  if (error) { alert('Error: ' + error.message); return; }
  await loadParticipantesEvento();
  loadStats();
}

// ---- Leer Excel del panel ----
function handlePnlExcel(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!raw.length) { alert('El archivo está vacío.'); return; }

      // Mapeo flexible de columnas
      const map = {
        nombre: ['nombre_completo', 'nombre', 'name', 'nombre completo'],
        correo: ['correo', 'email', 'correo_electronico', 'e-mail', 'mail'],
      };

      pnlPreviewRows = raw.map(row => {
        const keys = Object.keys(row).map(k => k.toLowerCase().trim());
        const vals = Object.values(row);
        const get = (aliases) => {
          const idx = keys.findIndex(k => aliases.includes(k));
          return idx !== -1 ? String(vals[idx] ?? '').trim() : '';
        };
        return { nombre: get(map.nombre), correo: get(map.correo) };
      }).filter(r => r.correo);

      const omitidos = raw.length - pnlPreviewRows.length;
      document.getElementById('pnlPreviewCount').textContent = pnlPreviewRows.length;
      document.getElementById('pnlPreviewError').textContent =
        omitidos > 0 ? `⚠️ ${omitidos} fila(s) omitidas por no tener correo.` : '';

      const tbody = document.getElementById('pnlPreviewTbody');
      tbody.innerHTML = pnlPreviewRows.map(r => `
        <tr>
          <td style="font-weight:600">${r.nombre || '<sin nombre>'}</td>
          <td style="font-size:0.82rem;opacity:0.8">${r.correo}</td>
        </tr>`).join('');

      document.getElementById('pnlPreview').style.display = 'block';
    } catch (err) {
      alert('Error al leer el archivo: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function cancelPnlImport() {
  pnlPreviewRows = [];
  document.getElementById('pnlPreview').style.display = 'none';
}

async function confirmPnlImport() {
  if (!pnlEventoId || !pnlPreviewRows.length) return;
  const btn = document.getElementById('pnlBtnConfirmImport');
  btn.disabled = true;
  btn.textContent = 'Importando...';

  const payload = pnlPreviewRows.map(r => ({
    nombre: r.nombre || '(Sin nombre)',
    correo: r.correo.toLowerCase(),
    evento_id: pnlEventoId,
    estatus: 'Confirmado',
  }));

  // Upsert por correo + evento_id para evitar duplicados
  const { error } = await supabase
    .from('participantes')
    .upsert(payload, { onConflict: 'correo,evento_id', ignoreDuplicates: false });

  btn.disabled = false;
  btn.textContent = 'Importar';

  if (error) {
    // Si el error es por falta de constraint unique, insertamos con insert
    const { error: e2 } = await supabase.from('participantes').insert(payload);
    if (e2) { alert('Error al importar: ' + e2.message); return; }
  }

  cancelPnlImport();
  await loadParticipantesEvento();
  loadStats();
}

// ---- Descargar participantes como CSV ----
function downloadParticipantesCSV() {
  if (!participantesDelEvento.length) {
    alert('No hay participantes para descargar.');
    return;
  }
  const rows = [['#', 'Nombre', 'Correo', 'Estado', 'Asistió', 'Registro']];
  participantesDelEvento.forEach((p, i) => rows.push([
    i + 1,
    p.nombre,
    p.correo,
    p.estatus || 'Confirmado',
    p.asistio ? 'Sí' : 'No',
    new Date(p.created_at).toLocaleDateString('es-MX'),
  ]));
  const titulo = (pnlEventoData?.titulo || 'evento').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  downloadCSV(rows, `participantes_${titulo}_${new Date().toISOString().split('T')[0]}.csv`);
}

// ============================================================
// IMAGE GALLERY MODAL
// ============================================================

const galleryModal = document.getElementById("galleryModal");
const galleryGrid = document.getElementById("galleryGrid");
const btnCloseGallery = document.getElementById("btnCloseGallery");
const galleryModalClose = document.getElementById("galleryModalClose");

function closeGalleryModal() {
  galleryModal.style.display = "none";
  galleryGrid.innerHTML = "";
}

btnCloseGallery?.addEventListener("click", closeGalleryModal);
galleryModalClose?.addEventListener("click", closeGalleryModal);

window.openGalleryModal = function (id) {
  const evento = listaEventos.find((e) => e.id === id);
  if (!evento) return;

  galleryGrid.innerHTML = "";

  if (!evento.imagenes_url || evento.imagenes_url.length === 0) {
    galleryGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: rgba(255,255,255,0.7); padding: 40px;">No hay imágenes cargadas para este evento.</div>`;
  } else {
    // Generate inner structure for gallery
    evento.imagenes_url.forEach((url, i) => {
      const card = document.createElement("div");
      card.className = "gallery-item";

      const img = document.createElement("img");
      img.src = url;
      img.alt = `Imagen ${i + 1}`;

      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn-gallery-download";
      downloadBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg> Descargar
      `;
      downloadBtn.onclick = () => downloadImage(url, `evento_${evento.id}_img_${i + 1}`);

      card.appendChild(img);
      card.appendChild(downloadBtn);
      galleryGrid.appendChild(card);
    });
  }

  galleryModal.style.display = "flex";
}

// Download helper through blob so it forces download
async function downloadImage(url, title) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Network response was not ok");
    const blob = await res.blob();
    const actUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = actUrl;

    // Attempt extracting format from end of URL or defaulted jpg
    const extension = url.split('.').pop().split('?')[0] || 'jpg';
    a.download = `${title}.${extension}`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(actUrl);
  } catch (error) {
    console.error("Descarga fallida:", error);
    alert("Hubo un error al descargar la imagen.");
  }
}

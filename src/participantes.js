import { checkSession, logout } from './auth.js';
import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
    let sessionUser = null;
    try {
        const session = await checkSession();
        if (!session) {
            window.location.href = '/index.html';
            return;
        }
        sessionUser = session.user;
        const nameNode = document.getElementById('userName');
        nameNode.textContent = sessionUser.user_metadata?.nombre_completo || sessionUser.email;
    } catch (e) {
        console.warn("Supabase auth check failed. Layout cargado en modo vista.");
    }

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        try { await logout(); } catch (e) { window.location.href = '/index.html'; }
    });

    // Theme logic
    const body = document.body;
    if (localStorage.getItem('theme') === 'light') body.classList.add('light-theme');
    document.getElementById('themeToggle').addEventListener('click', () => {
        body.classList.toggle('light-theme');
        localStorage.setItem('theme', body.classList.contains('light-theme') ? 'light' : 'dark');
    });

    const urlParams = new URLSearchParams(window.location.search);
    const eventoId = urlParams.get('evento');

    const viewSelector = document.getElementById('eventSelectorView');
    const viewParticipants = document.getElementById('participantsView');

    if (eventoId) {
        // Modo Gestor de Participantes
        viewSelector.style.display = 'none';
        viewParticipants.style.display = 'block';
        initParticipantsManager(eventoId);
    } else {
        // Modo Selector de Evento
        viewParticipants.style.display = 'none';
        viewSelector.style.display = 'block';
        initEventSelector();
    }

    async function initEventSelector() {
        const grid = document.getElementById('eventosGridSelector');
        const searchInput = document.getElementById('searchEventoGrid');
        let listaEventos = [];

        async function loadEventos() {
            try {
                const { data, error } = await supabase.from('eventos').select('*').order('created_at', { ascending: false });
                if (error) throw error;
                listaEventos = data;
                renderEventos(data);
            } catch (e) {
                grid.innerHTML = '<div class="error-msg">Error cargando eventos</div>';
            }
        }

        function renderEventos(eventos) {
            grid.innerHTML = '';
            if (eventos.length === 0) {
                grid.innerHTML = '<div>No hay eventos disponibles.</div>';
                return;
            }

            eventos.forEach(ev => {
                const card = document.createElement('div');
                card.className = 'evento-card glass-panel';
                card.style.cursor = 'pointer';
                card.innerHTML = `
                    <div class="card-content">
                        <h3>${ev.titulo}</h3>
                        <p style="opacity:0.8; font-size:0.9rem;">📅 ${ev.fecha}</p>
                        <p style="margin-top:10px;">➔ Gestionar participantes</p>
                    </div>
                `;
                card.addEventListener('click', () => window.location.href = `/participantes.html?evento=${ev.id}`);
                grid.appendChild(card);
            });
        }

        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            const filt = listaEventos.filter(ev => ev.titulo.toLowerCase().includes(val));
            renderEventos(filt);
        });

        loadEventos();
    }

    function initParticipantsManager(eventoId) {
        const titleEl = document.getElementById('evInfoTitle');
        const detailsEl = document.getElementById('evInfoDetails');
        const gaugeNum = document.getElementById('evGaugeNum');
        const tbody = document.getElementById('participantsTbody');
        const searchInput = document.getElementById('searchParticipante');

        document.getElementById('btnBackToEvents').addEventListener('click', () => window.location.href = '/participantes.html');

        document.getElementById('btnExportCsv').addEventListener('click', () => {
            if (listaParticipantes.length === 0) {
                alert("No hay participantes para exportar.");
                return;
            }

            // Crear contenido CSV
            let csvContent = "Nombre,Correo,Fecha de Registro,Hora,Asistio\n";

            listaParticipantes.forEach(p => {
                const dateObj = new Date(p.created_at);
                const fecha = dateObj.toLocaleDateString('es-MX');
                const hora = dateObj.toLocaleTimeString('es-MX');
                const asistioStr = p.asistio ? "Sí" : "No";

                // Escapar comas en los textos para evitar romper el formato
                const nombreSeguro = `"${p.nombre.replace(/"/g, '""')}"`;
                const correoSeguro = `"${p.correo.replace(/"/g, '""')}"`;

                csvContent += `${nombreSeguro},${correoSeguro},${fecha},${hora},${asistioStr}\n`;
            });

            // Crear Blob y forzar descarga
            const blob = new Blob(["\ufeff", csvContent], { type: 'text/csv;charset=utf-8;' }); // \ufeff añade BOM para que Excel lea tildes correctamente
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            // Nombre del archivo dinámico
            const nombreEventoSeguro = currentEvent.titulo.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            link.setAttribute("href", url);
            link.setAttribute("download", `lista_${nombreEventoSeguro}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });

        let currentEvent = null;
        let listaParticipantes = [];

        async function loadData() {
            try {
                // Fetch Event
                const { data: evData, error: evErr } = await supabase.from('eventos').select('*').eq('id', eventoId).single();
                if (evErr) throw evErr;
                currentEvent = evData;

                titleEl.textContent = evData.titulo;
                detailsEl.textContent = `📅 ${evData.fecha} | ⏰ ${evData.hora} | ${evData.modalidad}`;

                // Fetch Participants
                const { data: partData, error: partErr } = await supabase.from('participantes').select('*').eq('evento_id', eventoId).order('created_at', { ascending: false });
                if (partErr) throw partErr;

                listaParticipantes = partData;
                updateStats();
                renderTable(listaParticipantes);

            } catch (e) {
                console.error(e);
                tbody.innerHTML = '<tr><td colspan="4" class="error-msg">Error cargando datos.</td></tr>';
            }
        }

        function updateStats() {
            const total = listaParticipantes.length;
            const max = currentEvent.cupo_maximo;
            gaugeNum.textContent = `${total} / ${max}`;

            // Cerrar automáticamente si llega al límite (Visual y DB)
            if (total >= max && currentEvent.estado !== 'Finalizado') {
                gaugeNum.style.color = 'var(--error-color)';
                // Here we could auto-update the event state to 'Finalizado' in DB
                // supabase.from('eventos').update({estado: 'Finalizado'}).eq('id', currentEvent.id);
            } else {
                gaugeNum.style.color = '#fff';
                const isLight = document.body.classList.contains('light-theme');
                if (isLight) gaugeNum.style.color = 'var(--primary-color)';
            }
        }

        function renderTable(participantes) {
            tbody.innerHTML = '';
            if (participantes.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Aún no hay participantes en este evento.</td></tr>';
                return;
            }

            participantes.forEach(p => {
                const tr = document.createElement('tr');
                const dateStr = new Date(p.created_at).toLocaleString();

                tr.innerHTML = `
                    <td style="font-weight:600;">${p.nombre}</td>
                    <td>${p.correo}</td>
                    <td style="font-size:0.85rem; opacity:0.8;">${dateStr}</td>
                    <td>
                        <label class="switch">
                            <input type="checkbox" class="asistencia-toggle" data-id="${p.id}" ${p.asistio ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Add toggle listeners
            document.querySelectorAll('.asistencia-toggle').forEach(chk => {
                chk.addEventListener('change', async (e) => {
                    const id = e.target.dataset.id;
                    const asistio = e.target.checked;

                    try {
                        const { error } = await supabase.from('participantes').update({ asistio }).eq('id', id);
                        if (error) {
                            e.target.checked = !asistio; // revert
                            throw error;
                        }
                    } catch (err) {
                        alert("Error al guardar asistencia.");
                    }
                });
            });
        }

        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            const filt = listaParticipantes.filter(p =>
                p.nombre.toLowerCase().includes(val) || p.correo.toLowerCase().includes(val)
            );
            renderTable(filt);
        });

        // Modal Logic
        const modal = document.getElementById('participantModal');
        const form = document.getElementById('participantForm');
        const modalError = document.getElementById('partModalError');
        const btnSave = document.getElementById('btnSavePart');

        document.getElementById('btnAddParticipant').addEventListener('click', () => {
            if (listaParticipantes.length >= currentEvent.cupo_maximo) {
                alert("Este evento ha alcanzado su cupo máximo.");
                return;
            }
            modal.style.display = 'flex';
            modalError.style.display = 'none';
        });

        const closeModal = () => {
            modal.style.display = 'none';
            form.reset();
        };

        document.getElementById('closePartModal').addEventListener('click', closeModal);
        document.getElementById('btnCancelPart').addEventListener('click', closeModal);

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            btnSave.disabled = true;
            btnSave.textContent = 'Guardando...';
            modalError.style.display = 'none';

            if (listaParticipantes.length >= currentEvent.cupo_maximo) {
                modalError.textContent = "Cupo máximo alcanzado.";
                modalError.style.display = 'block';
                btnSave.disabled = false;
                btnSave.textContent = 'Guardar';
                return;
            }

            const nombre = document.getElementById('partNombre').value.trim();
            const correo = document.getElementById('partCorreo').value.trim();

            try {
                // Check if email already enrolled
                const exist = listaParticipantes.find(p => p.correo === correo);
                if (exist) throw new Error("Este correo ya está registrado en el evento.");

                const { error } = await supabase.from('participantes').insert([{
                    nombre, correo, evento_id: currentEvent.id
                }]);
                if (error) throw error;



                closeModal();
                loadData(); // Reload table
            } catch (e) {
                modalError.textContent = e.message;
                modalError.style.display = 'block';
            }
            btnSave.disabled = false;
            btnSave.textContent = 'Guardar';
        });

        loadData();
    }
});

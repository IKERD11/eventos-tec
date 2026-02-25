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
        if (sessionUser.user_metadata && sessionUser.user_metadata.nombre_completo) {
            nameNode.textContent = sessionUser.user_metadata.nombre_completo;
        } else {
            nameNode.textContent = sessionUser.email;
        }
    } catch (e) {
        console.warn("Supabase auth check failed. Layout cargado en modo vista.");
        // Mock user for layout testing
        sessionUser = { id: 'mock-uuid', email: 'docente@cuautla.tecnm.mx' };
        document.getElementById('userName').textContent = 'Docente Prueba';
    }

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        try { await logout(); } catch (e) { window.location.href = '/index.html'; }
    });

    const body = document.body;
    if (localStorage.getItem('theme') === 'light') body.classList.add('light-theme');
    document.getElementById('themeToggle').addEventListener('click', () => {
        body.classList.toggle('light-theme');
        localStorage.setItem('theme', body.classList.contains('light-theme') ? 'light' : 'dark');
        loadEventos(); // Reload cards to fix bg/colors if needed (CSS already handles most)
    });

    /* EVENTOS LOGIC */
    const eventosGrid = document.getElementById('eventosGrid');
    const searchInput = document.getElementById('searchEvento');
    let listaEventos = [];

    async function loadEventos() {
        try {
            // Also fetch current user's role from perfiles
            const { data: profile, error: profErr } = await supabase
                .from('perfiles')
                .select('rol')
                .eq('id', sessionUser.id)
                .single();

            if (!profErr && profile) {
                sessionUser.rol = profile.rol;
            }

            const { data, error } = await supabase
                .from('eventos')
                .select('*, perfiles(nombre_completo)')
                .order('created_at', { ascending: false });

            if (error) throw error;
            listaEventos = data;
            renderEventos(listaEventos);
        } catch (e) {
            console.error(e);
            eventosGrid.innerHTML = `<div class="error-msg">Error al cargar eventos o base de datos no conectada.</div>`;
        }
    }

    function renderEventos(eventos) {
        eventosGrid.innerHTML = '';
        if (eventos.length === 0) {
            eventosGrid.innerHTML = `<div>No hay eventos registrados. Crea uno nuevo.</div>`;
            return;
        }

        const isAdmin = sessionUser.rol === 'admin';

        eventos.forEach(ev => {
            const isCreator = (ev.creado_por === sessionUser.id);
            const canEdit = isCreator || isAdmin;

            const imageTemplate = ev.imagen_url
                ? `<img src="${ev.imagen_url}" alt="${ev.titulo}">`
                : `<div style="padding: 20px; textAlign: center; width: 100%; display: flex; align-items: center; justify-content: center; height: 100%;"><span>Sin Imagen</span></div>`;

            const card = document.createElement('div');
            card.className = 'evento-card glass-panel';
            card.innerHTML = `
                <div class="card-img">
                    <span class="card-estado estado-${ev.estado}">${ev.estado}</span>
                    ${imageTemplate}
                </div>
                <div class="card-content">
                    <h3>${ev.titulo} ${isAdmin && !isCreator ? '<span style="color:#8c52ff;font-size:0.8rem;">(Admin/Todos)</span>' : ''}</h3>
                    <div class="card-meta">
                        <span>📅 ${ev.fecha} ⏰ ${ev.hora}</span>
                        <span>📍 ${ev.lugar || 'No especificado'} (${ev.modalidad})</span>
                        <span>👥 Cupo: ${ev.cupo_maximo}</span>
                        <span>👤 Creador: ${ev.perfiles?.nombre_completo || 'Desconocido'}</span>
                    </div>
                    <p style="font-size:0.9rem; margin-bottom:15px; opacity:0.8;">${ev.descripcion.substring(0, 60)}...</p>
                    <div class="card-actions">
                        <a href="/participantes.html?evento=${ev.id}" class="btn-card">Participantes</a>
                        ${canEdit ? `
                            <div>
                                <button class="btn-card btn-edit" data-id="${ev.id}">Editar</button>
                                <button class="btn-card btn-danger btn-delete" data-id="${ev.id}">Borrar</button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
            eventosGrid.appendChild(card);
        });

        // Add Listeners to buttons
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => openModal(e.target.dataset.id));
        });
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => promptDelete(e.target.dataset.id));
        });
    }

    // Modal Logic
    const modal = document.getElementById('eventoModal');
    const form = document.getElementById('eventoForm');
    const modalError = document.getElementById('modalError');
    const btnSave = document.getElementById('btnSaveEvento');

    document.getElementById('btnNuevoEvento').addEventListener('click', () => openModal());
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('btnCancel').addEventListener('click', closeModal);

    function closeModal() {
        modal.style.display = 'none';
        form.reset();
        document.getElementById('eventoId').value = '';
        modalError.style.display = 'none';
    }

    async function openModal(id = null) {
        modalError.style.display = 'none';
        modal.style.display = 'flex';
        form.reset();

        if (id) {
            document.getElementById('modalTitle').textContent = 'Editar Evento';
            const { data, error } = await supabase.from('eventos').select('*').eq('id', id).single();
            if (!error && data) {
                document.getElementById('eventoId').value = data.id;
                document.getElementById('evTitulo').value = data.titulo;
                document.getElementById('evDescripcion').value = data.descripcion;
                document.getElementById('evModalidad').value = data.modalidad;
                document.getElementById('evEstado').value = data.estado;
                document.getElementById('evFecha').value = data.fecha;
                document.getElementById('evHora').value = data.hora;
                document.getElementById('evLugar').value = data.lugar;
                document.getElementById('evCupo').value = data.cupo_maximo;
            }
        } else {
            document.getElementById('modalTitle').textContent = 'Crear Evento';
            document.getElementById('eventoId').value = '';
        }
    }

    // Handle Form Submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        btnSave.disabled = true;
        btnSave.textContent = 'Guardando...';
        modalError.style.display = 'none';

        const id = document.getElementById('eventoId').value;
        const fileInput = document.getElementById('evImagen');
        const file = fileInput.files[0];

        try {
            let imagen_url = null;

            // Simple File Upload to Supabase Storage if file exists
            if (file) {
                if (file.size > 2 * 1024 * 1024) throw new Error("La imagen no debe superar los 2MB.");
                const fileExt = file.name.split('.').pop();
                const fileName = `${sessionUser.id}_${Date.now()}.${fileExt}`;
                const filePath = `portadas/${fileName}`;

                const { error: uploadError } = await supabase.storage.from('eventos').upload(filePath, file);
                if (uploadError) throw uploadError;

                const { data: publicUrlData } = supabase.storage.from('eventos').getPublicUrl(filePath);
                imagen_url = publicUrlData.publicUrl;
            }

            const evtData = {
                titulo: document.getElementById('evTitulo').value,
                descripcion: document.getElementById('evDescripcion').value,
                modalidad: document.getElementById('evModalidad').value,
                estado: document.getElementById('evEstado').value,
                fecha: document.getElementById('evFecha').value,
                hora: document.getElementById('evHora').value,
                lugar: document.getElementById('evLugar').value,
                cupo_maximo: parseInt(document.getElementById('evCupo').value)
            };

            if (imagen_url) evtData.imagen_url = imagen_url;

            if (id) {
                // Update
                const { error: updErr } = await supabase.from('eventos').update(evtData).eq('id', id);
                if (updErr) throw updErr;
            } else {
                // Insert
                evtData.creado_por = sessionUser.id; // required by our schema safely
                const { error: insErr } = await supabase.from('eventos').insert([evtData]);
                if (insErr) throw insErr;
            }

            closeModal();
            loadEventos();
        } catch (err) {
            modalError.textContent = err.message || "Error al guardar el evento.";
            modalError.style.display = 'block';
        }

        btnSave.disabled = false;
        btnSave.textContent = 'Guardar';
    });

    // Handle Delete
    async function promptDelete(id) {
        if (confirm("¿Estás seguro de eliminar este evento?")) {
            const { error } = await supabase.from('eventos').delete().eq('id', id);
            if (error) alert("Error al eliminar: " + error.message);
            else loadEventos();
        }
    }

    // Handle Search filter
    searchInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        const filt = listaEventos.filter(ev => ev.titulo.toLowerCase().includes(val) || ev.descripcion.toLowerCase().includes(val));
        renderEventos(filt);
    });

    loadEventos();
});

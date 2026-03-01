import { checkSession, logout, isAdmin } from './auth.js';
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

    if (await isAdmin()) {
        const navAdmin = document.getElementById('navAdmin');
        if (navAdmin) navAdmin.style.display = 'block';
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

            const imageTemplate = (ev.imagenes_url && ev.imagenes_url.length > 0)
                ? `<img src="${ev.imagenes_url[0]}" alt="${ev.titulo}">`
                : `<div style="padding: 20px; textAlign: center; width: 100%; display: flex; align-items: center; justify-content: center; height: 100%;"><span>Sin Imagen</span></div>`;

            const card = document.createElement('div');
            card.className = 'evento-card glass-panel cursor-pointer';
            card.dataset.id = ev.id; // Store ID for click event
            card.innerHTML = `
                <div class="card-img">
                    <span class="card-estado estado-${ev.estado}">${ev.estado}</span>
                    ${imageTemplate}
                    ${canEdit ? `
                        <div class="kebab-menu">
                            <button class="kebab-button" style="background:transparent;border:none;color:white;cursor:pointer;padding:5px;">
                                <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="5" r="1"></circle>
                                    <circle cx="12" cy="12" r="1"></circle>
                                    <circle cx="12" cy="19" r="1"></circle>
                                </svg>
                            </button>
                            <div class="dropdown-menu">
                                <button class="btn-dropdown drop-edit" data-id="${ev.id}">Editar Evento</button>
                                <button class="btn-dropdown drop-copy" data-id="${ev.id}">Copiar enlace público</button>
                                <div class="dropdown-divider"></div>
                                <button class="btn-dropdown drop-delete btn-danger" data-id="${ev.id}">Eliminar</button>
                            </div>
                        </div>
                    ` : ''}
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
                    <div class="card-actions" style="justify-content: flex-start;">
                        <a href="/participantes.html?evento=${ev.id}" class="btn-card stop-propagation">👥 Ver Participantes</a>
                    </div>
                </div>
            `;

            // Add click event to open details
            card.addEventListener('click', (e) => {
                // Prevent opening if clicking on the kebab menu or its contents, or buttons
                if (e.target.closest('.kebab-menu') || e.target.closest('.stop-propagation')) {
                    return;
                }
                abrirDetalle(ev.id);
            });

            eventosGrid.appendChild(card);
        });

        // Add Listeners to Dropdown Buttons
        document.querySelectorAll('.kebab-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevenir que abra detalles
                const menu = btn.nextElementSibling;
                // Close all others first
                document.querySelectorAll('.dropdown-menu.show').forEach(m => {
                    if (m !== menu) m.classList.remove('show');
                });
                menu.classList.toggle('show');
            });
        });

        // Close dropdowns if clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.kebab-menu')) {
                document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
            }
        });

        document.querySelectorAll('.drop-edit').forEach(btn => {
            btn.addEventListener('click', (e) => openModal(e.target.dataset.id));
        });
        document.querySelectorAll('.drop-delete').forEach(btn => {
            btn.addEventListener('click', (e) => promptDelete(e.target.dataset.id));
        });
        document.querySelectorAll('.drop-copy').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                const url = window.location.origin + '/registro.html?evento=' + id;
                navigator.clipboard.writeText(url).then(() => {
                    alert('¡Enlace público copiado al portapapeles!');
                    e.target.closest('.dropdown-menu').classList.remove('show');
                }).catch(err => alert("Error copiando el enlace: ", err));
            });
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

    // File Input display logic
    const fileInput = document.getElementById('evImagen');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const originalFileText = fileNameDisplay.textContent;

    fileInput.addEventListener('change', (e) => {
        const fileCount = e.target.files.length;
        if (fileCount === 1) {
            fileNameDisplay.textContent = e.target.files[0].name;
        } else if (fileCount > 1) {
            fileNameDisplay.textContent = `${fileCount} archivos seleccionados`;
        } else {
            fileNameDisplay.textContent = originalFileText;
        }
    });

    function closeModal() {
        modal.style.display = 'none';
        form.reset();
        document.getElementById('eventoId').value = '';
        modalError.style.display = 'none';
        fileNameDisplay.textContent = originalFileText;

        // Reset Flatpickrs
        if (datePicker) datePicker.clear();
        if (timePicker) timePicker.clear();
    }

    // Flatpickr instances
    let datePicker = null;
    let timePicker = null;

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
        textSpan.textContent = foundText;
    }

    function setupFormCustomSelect() {
        document.querySelectorAll('.form-custom-select').forEach(container => {
            const selected = container.querySelector('.select-selected');
            const items = container.querySelector('.select-items');
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
    }
    setupFormCustomSelect();

    async function openModal(id = null, preDate = null) {
        // Initialize Flatpickr if not already done, or re-apply settings
        if (!datePicker) {
            datePicker = flatpickr("#evFecha", {
                locale: "es",
                dateFormat: "Y-m-d",
                minDate: "today",
                theme: "dark"
            });
        }

        if (!timePicker) {
            timePicker = flatpickr("#evHora", {
                enableTime: true,
                noCalendar: true,
                dateFormat: "H:i",
                time_24hr: true,
                theme: "dark"
            });
        }

        modalError.style.display = 'none';

        if (id) {
            document.getElementById('modalTitle').textContent = 'Editar Evento';
            const { data, error } = await supabase.from('eventos').select('*').eq('id', id).single();
            if (!error && data) {
                document.getElementById('eventoId').value = data.id;
                document.getElementById('evTitulo').value = data.titulo;
                document.getElementById('evDescripcion').value = data.descripcion;

                updateFormCustomSelect('evModalidad', 'customSelectFormModalidad', data.modalidad);
                updateFormCustomSelect('evEstado', 'customSelectFormEstado', data.estado);
                updateFormCustomSelect('evClasificacion', 'customSelectFormClasificacion', data.clasificacion || 'Institucional');

                document.getElementById('evLugar').value = data.lugar;
                document.getElementById('evCupo').value = data.cupo_maximo;

                // Set Flatpickr dates
                datePicker.setDate(data.fecha);
                timePicker.setDate(data.hora);
            }
        } else {
            document.getElementById('modalTitle').textContent = 'Crear Evento';
            document.getElementById('eventoId').value = '';

            updateFormCustomSelect('evModalidad', 'customSelectFormModalidad', 'Presencial');
            updateFormCustomSelect('evEstado', 'customSelectFormEstado', 'Activo');
            updateFormCustomSelect('evClasificacion', 'customSelectFormClasificacion', 'Institucional');

            if (preDate) {
                // If it's a date string, we can set it.
                datePicker.setDate(preDate);
            } else {
                datePicker.clear();
            }
            timePicker.clear();
        }

        modal.style.display = 'flex';
    }

    // --- Detalle Modal Logic ---
    const detalleModal = document.getElementById('detalleModal');

    document.getElementById('closeDetalleModal').addEventListener('click', () => {
        detalleModal.style.display = 'none';
    });

    function abrirDetalle(id) {
        const ev = listaEventos.find(e => e.id === id);
        if (!ev) return;

        // Reset info
        document.getElementById('detTitulo').textContent = ev.titulo;
        document.getElementById('detEstado').textContent = ev.estado;
        document.getElementById('detEstado').className = `chip estado-${ev.estado}`;
        document.getElementById('detModalidad').textContent = ev.modalidad;
        document.getElementById('detDescripcion').textContent = ev.descripcion;
        document.getElementById('detFecha').textContent = ev.fecha;
        document.getElementById('detHora').textContent = ev.hora;
        document.getElementById('detLugar').textContent = ev.lugar || 'No especificado';
        document.getElementById('detCupo').textContent = ev.cupo_maximo;
        document.getElementById('detCreador').textContent = ev.perfiles?.nombre_completo || 'Desconocido';

        document.getElementById('btnDetalleParticipantes').onclick = () => {
            window.location.href = `/participantes.html?evento=${ev.id}`;
        };

        // Render Gallery
        const imgPrincipal = document.getElementById('detImgPrincipal');
        const detNoImg = document.getElementById('detNoImg');
        const detMiniaturas = document.getElementById('detMiniaturas');
        const btnDownload = document.getElementById('btnDownloadImg');

        detMiniaturas.innerHTML = ''; // clear previous

        // Helper func to safely force download via object url
        const setupDownload = (url, fallbackTitle) => {
            btnDownload.style.display = 'flex';
            btnDownload.onclick = async () => {
                try {
                    // Fetch block forces true download instead of nav
                    btnDownload.style.opacity = '0.5';
                    const response = await fetch(url);
                    const blob = await response.blob();
                    const localUrl = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = localUrl;
                    const cleanName = fallbackTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const ext = url.split('.').pop().split('?')[0] || 'jpg';
                    a.download = `evento_${cleanName}_IMG.${ext}`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(localUrl);
                    document.body.removeChild(a);
                } catch (err) {
                    console.error('Error downloading the image', err);
                    window.open(url, '_blank'); // fallback
                } finally {
                    btnDownload.style.opacity = '1';
                }
            };
        };

        if (ev.imagenes_url && ev.imagenes_url.length > 0) {
            imgPrincipal.style.display = 'block';
            detNoImg.style.display = 'none';
            imgPrincipal.src = ev.imagenes_url[0];
            setupDownload(ev.imagenes_url[0], ev.titulo);

            if (ev.imagenes_url.length > 1) {
                ev.imagenes_url.forEach((url, i) => {
                    const thumb = document.createElement('img');
                    thumb.src = url;
                    thumb.className = `thumb-img ${i === 0 ? 'active' : ''}`;
                    thumb.onclick = () => {
                        imgPrincipal.src = url;
                        setupDownload(url, ev.titulo);
                        document.querySelectorAll('.thumb-img').forEach(t => t.classList.remove('active'));
                        thumb.classList.add('active');
                    };
                    detMiniaturas.appendChild(thumb);
                });
            }
        } else {
            imgPrincipal.style.display = 'none';
            btnDownload.style.display = 'none';
            detNoImg.style.display = 'flex';
        }

        detalleModal.style.display = 'flex';
    }

    // Handle Form Submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        btnSave.disabled = true;
        btnSave.textContent = 'Guardando...';
        modalError.style.display = 'none';

        const id = document.getElementById('eventoId').value;
        const files = fileInput.files;

        try {
            let imagenes_url = [];

            // Multiple File Upload to Supabase Storage if files exist
            if (files.length > 0) {
                const uploadPromises = Array.from(files).map(async (file, index) => {
                    if (file.size > 2 * 1024 * 1024) throw new Error(`El archivo ${file.name} supera los 2MB.`);
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${sessionUser.id}_${Date.now()}_${index}.${fileExt}`;
                    const filePath = `portadas/${fileName}`;

                    const { error: uploadError } = await supabase.storage.from('eventos').upload(filePath, file);
                    if (uploadError) throw uploadError;

                    const { data: publicUrlData } = supabase.storage.from('eventos').getPublicUrl(filePath);
                    return publicUrlData.publicUrl;
                });

                // Wait for all uploads to finish
                imagenes_url = await Promise.all(uploadPromises);
            }

            const evtData = {
                titulo: document.getElementById('evTitulo').value,
                descripcion: document.getElementById('evDescripcion').value,
                modalidad: document.getElementById('evModalidad').value,
                estado: document.getElementById('evEstado').value,
                clasificacion: document.getElementById('evClasificacion').value,
                fecha: document.getElementById('evFecha').value,
                hora: document.getElementById('evHora').value,
                lugar: document.getElementById('evLugar').value,
                cupo_maximo: parseInt(document.getElementById('evCupo').value)
            };

            // Sólo agregar la columna si subieron imágenes nuevas
            // Si el objeto se está editando y el array está vacío, significa que el usuario
            // no subió fotos nuevas, entonces conservamos las que ya tiene en BD y no pasamos este campo.
            if (imagenes_url.length > 0) {
                evtData.imagenes_url = imagenes_url;
            }

            if (id) {
                // Update
                const { error: updErr } = await supabase.from('eventos').update(evtData).eq('id', id);
                if (updErr) throw updErr;
            } else {
                // Insert
                evtData.creado_por = sessionUser.id; // required by our schema safely
                // Para nuevos eventos sin foto, pasamos un array vacío explícitamente.
                if (!evtData.imagenes_url) evtData.imagenes_url = [];
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

    // --- Search and Filters Logic ---
    const customSelectEstado = document.getElementById('customSelectEstado');
    const customSelectModalidad = document.getElementById('customSelectModalidad');

    // Sidebar active filters
    let activeSidebarFilter = { type: 'all', val: 'all' };

    function applyFilters() {
        const query = searchInput.value.toLowerCase();
        const estado = customSelectEstado.dataset.value;
        const modalidad = customSelectModalidad.dataset.value;

        const hoyStr = new Date().toISOString().split('T')[0];

        const filtered = listaEventos.filter(ev => {
            const matchSearch = ev.titulo.toLowerCase().includes(query) || ev.descripcion.toLowerCase().includes(query);
            const matchEstado = estado === '' || ev.estado === estado;
            const matchModalidad = modalidad === '' || ev.modalidad === modalidad;

            // Sidebar logic
            let matchSidebar = true;
            if (activeSidebarFilter.type === 'clasificacion') {
                matchSidebar = (ev.clasificacion === activeSidebarFilter.val);
            } else if (activeSidebarFilter.type === 'tiempo') {
                if (activeSidebarFilter.val === 'proximos') {
                    matchSidebar = (ev.fecha >= hoyStr);
                } else if (activeSidebarFilter.val === 'pasados') {
                    matchSidebar = (ev.fecha < hoyStr);
                }
            }

            return matchSearch && matchEstado && matchModalidad && matchSidebar;
        });

        renderEventos(filtered);
    }

    searchInput.addEventListener('input', applyFilters);

    // Setup Sidebar Accordion and Filters
    const toggleSubmenu = document.getElementById('toggleSubmenuEventos');
    const submenu = document.getElementById('submenuEventos');

    if (toggleSubmenu && submenu) {
        toggleSubmenu.addEventListener('click', (e) => {
            e.preventDefault();
            submenu.classList.toggle('expanded');
            toggleSubmenu.classList.toggle('expanded');
        });

        const sidebarFilters = document.querySelectorAll('.sidebar-filter');
        sidebarFilters.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                // Update styling
                sidebarFilters.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Apply filter
                activeSidebarFilter.type = btn.dataset.type;
                activeSidebarFilter.val = btn.dataset.val;
                applyFilters();
            });
        });
    }

    // Setup Custom Selects
    function setupCustomSelect(selectEl) {
        const selected = selectEl.querySelector('.select-selected');
        const items = selectEl.querySelector('.select-items');
        const textSpan = selected.querySelector('.select-text');

        // Toggle dropdown
        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            // close others
            document.querySelectorAll('.select-items').forEach(i => {
                if (i !== items) i.classList.add('select-hide');
            });
            items.classList.toggle('select-hide');
        });

        // Click Option
        items.querySelectorAll('div').forEach(opt => {
            opt.addEventListener('click', (e) => {
                const val = opt.getAttribute('data-value');
                const txt = opt.textContent;

                textSpan.textContent = txt;
                selectEl.dataset.value = val;
                items.classList.add('select-hide');
                applyFilters();
            });
        });
    }

    setupCustomSelect(customSelectEstado);
    setupCustomSelect(customSelectModalidad);

    // Close selects when clicking outside
    document.addEventListener('click', () => {
        document.querySelectorAll('.select-items').forEach(i => i.classList.add('select-hide'));
    });

    loadEventos();

    // Check URL Parameters for pre-filled actions
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'new') {
        const preDate = urlParams.get('date');
        openModal(null, preDate);

        // Remove the parameters from the URL without refreshing to keep it clean
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.pushState({ path: newUrl }, '', newUrl);
    }
});

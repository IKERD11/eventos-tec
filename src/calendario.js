import { checkSession, logout, isAdmin } from './auth.js';
import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Theme setup
    const body = document.body;
    if (localStorage.getItem('theme') === 'light') body.classList.add('light-theme');
    document.getElementById('themeToggle').addEventListener('click', () => {
        body.classList.toggle('light-theme');
        localStorage.setItem('theme', body.classList.contains('light-theme') ? 'light' : 'dark');
        location.reload(); // FullCalendar colors require redraw
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        try { await logout(); } catch (e) { window.location.href = '/index.html'; }
    });

    let sessionUser = null;

    try {
        const session = await checkSession();
        if (!session) {
            window.location.href = '/index.html';
            return;
        }
        sessionUser = session.user;
        document.getElementById('userName').textContent = sessionUser.user_metadata?.nombre_completo || sessionUser.email;

        if (await isAdmin()) {
            const navAdmin = document.getElementById('navAdmin');
            if (navAdmin) navAdmin.style.display = 'block';
        }

        initCalendar();
    } catch (e) {
        console.warn("Supabase auth check failed. Layout cargado en modo vista.");
    }

    async function initCalendar() {
        try {
            const { data: eventos, error } = await supabase
                .from('eventos')
                .select('*')
                .in('estado', ['Activo', 'Finalizado']); // Ignoramos los cancelados

            if (error) throw error;

            // Mapear eventos a formato FullCalendar
            const isLight = document.body.classList.contains('light-theme');

            const calendarEvents = eventos.map(ev => {
                const startStr = `${ev.fecha}T${ev.hora}`;
                const endStr = new Date(new Date(startStr).getTime() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours approx

                return {
                    id: ev.id,
                    title: ev.titulo,
                    start: startStr,
                    end: endStr,
                    backgroundColor: ev.estado === 'Activo' ? 'var(--primary-color)' : 'grey',
                    borderColor: 'transparent',
                    extendedProps: {
                        descripcion: ev.descripcion,
                        lugar: ev.lugar,
                        modalidad: ev.modalidad,
                        estado: ev.estado,
                        hora: ev.hora,
                        fechaStr: ev.fecha,
                        clasificacion: ev.clasificacion,
                        imagenes_url: ev.imagenes_url
                    }
                };
            });

            const calendarEl = document.getElementById('calendar');
            const calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: 'dayGridMonth',
                locale: 'es',
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay'
                },
                buttonText: {
                    today: 'Hoy',
                    month: 'Mes',
                    week: 'Semana',
                    day: 'Día',
                    list: 'Lista'
                },
                events: calendarEvents,
                dateClick: function (info) {
                    window.location.href = `/eventos.html?action=new&date=${info.dateStr}`;
                },
                eventClick: function (info) {
                    showEventModal(info.event);
                }
            });

            calendar.render();

        } catch (err) {
            console.error("Error cargando eventos:", err);
            document.getElementById('calendar').innerHTML = '<div class="error-msg">Error cargando calendario</div>';
        }
    }

    // Modal helpers
    const modal = document.getElementById('calEventModal');
    document.getElementById('closeCalModal').addEventListener('click', () => {
        modal.style.display = 'none';
        document.getElementById('mcUrlPanel').style.display = 'none';
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
            document.getElementById('mcUrlPanel').style.display = 'none';
        }
    });

    // Botón "Registro Público" - muestra/oculta panel URL
    document.getElementById('mcBtnReg').addEventListener('click', () => {
        const panel = document.getElementById('mcUrlPanel');
        const isVisible = getComputedStyle(panel).display !== 'none';
        panel.style.display = isVisible ? 'none' : 'block';
        document.getElementById('mcCopyMsg').style.display = 'none';
    });

    // Botón "Copiar" URL
    document.getElementById('mcBtnCopyUrl').addEventListener('click', () => {
        const urlInput = document.getElementById('mcPublicUrl');
        const copyMsg = document.getElementById('mcCopyMsg');
        const btn = document.getElementById('mcBtnCopyUrl');
        navigator.clipboard.writeText(urlInput.value).then(() => {
            copyMsg.style.display = 'block';
            btn.textContent = '✓ Copiado';
            btn.style.background = 'var(--success-color, #51cf66)';
            setTimeout(() => {
                copyMsg.style.display = 'none';
                btn.textContent = 'Copiar';
                btn.style.background = '';
            }, 2500);
        }).catch(() => {
            urlInput.select();
            document.execCommand('copy');
            copyMsg.style.display = 'block';
        });
    });

    function showEventModal(eventObj) {
        const props = eventObj.extendedProps;
        document.getElementById('mcTitle').textContent = eventObj.title;

        // Hero Image logic — show photo for ANY event that has images
        const heroImg = document.getElementById('cemHeroImg');
        const heroGlow = document.getElementById('cemHeroGlow');
        const photoCountEl = document.getElementById('cemPhotoCount');
        const photoCountText = document.getElementById('cemPhotoCountText');

        if (props.imagenes_url && props.imagenes_url.length > 0) {
            // Show the photo, hide the animated glow
            heroImg.src = props.imagenes_url[0];
            heroImg.alt = eventObj.title;
            heroImg.style.display = 'block';
            // Reset animation so it plays on each open
            heroImg.style.animation = 'none';
            heroImg.offsetHeight; // reflow
            heroImg.style.animation = '';
            heroGlow.style.display = 'none';

            // Show count badge if multiple photos
            if (props.imagenes_url.length > 1) {
                photoCountText.textContent = `${props.imagenes_url.length} fotos`;
                photoCountEl.style.display = 'flex';
            } else {
                photoCountEl.style.display = 'none';
            }
        } else {
            // No image — show animated gradient glow
            heroImg.style.display = 'none';
            heroImg.src = '';
            heroGlow.style.display = 'block';
            photoCountEl.style.display = 'none';
        }

        // Stat fields
        document.getElementById("mcDateDisplay").textContent = props.fechaStr || "--";
        document.getElementById("mcTimeDisplay").textContent = props.hora || "--";

        // Badges
        document.getElementById("mcMod").textContent = props.modalidad || "--";

        document.getElementById("mcDesc").textContent = props.descripcion || "Sin descripción";
        document.getElementById("mcLugar").textContent = props.lugar || "Por definir";

        // Clasificación/Carrera
        const clasifMap = {
            'Institucional': 'Institucional',
            'ISC': 'Ing. Sistemas Computacionales',
            'IGE': 'Ing. Gestión Empresarial',
            'Ingeniería Industrial': 'Ing. Industrial',
            'Ingeniería Mecatrónica': 'Ing. Mecatrónica',
            'Ingeniería Electrónica': 'Ing. Electrónica',
            'Ingeniería Civil': 'Ing. Civil',
            'Contador Público': 'Contador Público'
        };
        const clasifVal = props.clasificacion || 'Institucional';
        document.getElementById('mcClasif').textContent = clasifMap[clasifVal] || clasifVal;

        // Botón Ver Participantes
        document.getElementById('mcBtnPart').href = `/participantes.html?evento=${eventObj.id}`;

        // URL pública del registro
        const publicUrl = window.location.origin + '/registro.html?evento=' + eventObj.id;
        document.getElementById('mcPublicUrl').value = publicUrl;

        // Resetear panel URL
        const urlPanel = document.getElementById('mcUrlPanel');
        urlPanel.style.display = 'none';
        document.getElementById('mcCopyMsg').style.display = 'none';
        const copyBtn = document.getElementById('mcBtnCopyUrl');
        copyBtn.textContent = 'Copiar';
        copyBtn.style.background = '';

        modal.style.display = 'flex';
    }
});

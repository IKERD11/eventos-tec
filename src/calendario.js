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
                        fechaStr: ev.fecha
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
    document.getElementById('closeCalModal').addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    function showEventModal(eventObj) {
        const props = eventObj.extendedProps;
        document.getElementById('mcTitle').textContent = eventObj.title;
        document.getElementById('mcDate').textContent = `${props.fechaStr} a las ${props.hora} (${props.estado})`;
        document.getElementById('mcDesc').textContent = props.descripcion;
        document.getElementById('mcLugar').textContent = props.lugar || 'Por definir';
        document.getElementById('mcMod').textContent = props.modalidad;

        document.getElementById('mcBtnPart').href = `/participantes.html?evento=${eventObj.id}`;
        document.getElementById('mcBtnReg').href = `/registro.html?evento=${eventObj.id}`;

        modal.style.display = 'flex';
    }
});

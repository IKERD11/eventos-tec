import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Check Theme
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-theme');
    }

    const urlParams = new URLSearchParams(window.location.search);
    const eventoId = urlParams.get('evento');

    const loadingState = document.getElementById('loadingState');
    const errorState = document.getElementById('errorState');
    const errorText = document.getElementById('errorText');
    const eventContainer = document.getElementById('eventContainer');
    const successState = document.getElementById('successState');

    const hero = document.getElementById('eventHero');
    const title = document.getElementById('eventTitle');
    const dateLine = document.getElementById('eventDate');
    const locationLine = document.getElementById('eventLocation');
    const capacityLine = document.getElementById('eventCapacity');
    const description = document.getElementById('eventDescription');

    const formArea = document.getElementById('regFormArea');
    const form = document.getElementById('publicRegForm');
    const nameInput = document.getElementById('regName');
    const emailInput = document.getElementById('regEmail');
    const btnSubmit = document.getElementById('btnSubmit');
    const regError = document.getElementById('regError');

    if (!eventoId) {
        showError("ID de evento no proporcionado en el enlace.");
        return;
    }

    let eventData = null;

    try {
        // Fetch Event Data (Public Select Allowed by RLS)
        const { data, error } = await supabase
            .from('eventos')
            .select('*')
            .eq('id', eventoId)
            .single();

        if (error || !data) {
            throw new Error("El evento no existe.");
        }

        eventData = data;

        if (eventData.estado !== 'Activo') {
            throw new Error(`Este evento está marcado como ${eventData.estado} y ya no acepta registros.`);
        }

        // Check if full (solo confirmados)
        const { count, error: countErr } = await supabase
            .from('participantes')
            .select('*', { count: 'exact', head: true })
            .eq('evento_id', eventoId)
            .eq('estatus', 'Confirmado');

        let isFull = false;
        if (!countErr && count >= eventData.cupo_maximo) {
            isFull = true;
            // No bloqueamos el form, pueden unirse a lista de espera
        }

        renderEvent(eventData, count || 0, isFull);

    } catch (err) {
        showError(err.message);
    }

    function renderEvent(ev, count, isFull) {
        loadingState.style.display = 'none';
        eventContainer.style.display = 'flex';

        if (ev.imagen_url) {
            hero.style.background = `url('${ev.imagen_url}')`;
        } else {
            hero.style.background = `linear-gradient(135deg, var(--primary-color), #4a1f9e)`;
        }

        title.textContent = ev.titulo;
        dateLine.textContent = `📅 ${ev.fecha} ⏰ ${ev.hora}`;
        locationLine.textContent = `📍 ${ev.lugar || 'Por definir'} (${ev.modalidad})`;

        if (isFull) {
            capacityLine.innerHTML = `👥 Cupo: <span style="color: var(--accent-color);">Lleno (${count}/${ev.cupo_maximo})</span> - Registros a Lista de Espera`;
            btnSubmit.textContent = 'Unirme a Lista de Espera';
        } else {
            capacityLine.textContent = `👥 Cupo Confirmado: ${count}/${ev.cupo_maximo}`;
        }

        description.textContent = ev.descripcion;
    }

    function showError(msg) {
        loadingState.style.display = 'none';
        errorState.style.display = 'block';
        if (msg) errorText.textContent = msg;
    }

    // Handle Registration Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        regError.style.display = 'none';
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Registrando...';

        const nombre = nameInput.value.trim();
        const correo = emailInput.value.trim();

        /* Optional: Restrict to institutional emails only 
        if (!correo.endsWith('@cuautla.tecnm.mx')) {
            regError.textContent = "Solo se permiten correos @cuautla.tecnm.mx";
            regError.style.display = 'block';
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Registrarme';
            return;
        }
        */

        try {
            // Re-check capacity for confirmed participants
            const { count } = await supabase
                .from('participantes')
                .select('*', { count: 'exact', head: true })
                .eq('evento_id', eventoId)
                .eq('estatus', 'Confirmado');

            let nuevoEstatus = 'Confirmado';
            if (count >= eventData.cupo_maximo) {
                nuevoEstatus = 'En Espera';
            }

            // Check if user already registered for this specific event
            const { data: existingUser } = await supabase
                .from('participantes')
                .select('id, estatus')
                .eq('evento_id', eventoId)
                .eq('correo', correo)
                .single();

            if (existingUser) {
                throw new Error(`Este correo ya está registrado en este evento (Estatus: ${existingUser.estatus}).`);
            }

            // Insert new participant (Must be allowed by RLS policy for insert/true)
            const { error: insErr } = await supabase
                .from('participantes')
                .insert([{ nombre, correo, evento_id: eventoId, estatus: nuevoEstatus }]);

            if (insErr) {
                throw new Error("Ocurrió un error guardando el registro.");
            }

            // Show success
            eventContainer.style.display = 'none';
            successState.style.display = 'block';

            if (nuevoEstatus === 'En Espera') {
                successState.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" class="icon" stroke="var(--accent-color)" stroke-width="2" style="width: 60px; height: 60px; margin: 0 auto 1.5rem auto; display: block;">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <h2>¡Estás en Lista de Espera!</h2>
                    <p style="color: var(--text-muted); margin-top: 10px;">El evento ha alcanzado su cupo máximo. Te hemos añadido a la lista de espera y tu lugar dependerá de si se libera un espacio.</p>
                `;
            }

        } catch (err) {
            regError.textContent = err.message;
            regError.style.display = 'block';
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Registrarme';
        }
    });

});

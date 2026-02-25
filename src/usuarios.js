import { checkSession, logout } from './auth.js';
import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
    const body = document.body;
    if (localStorage.getItem('theme') === 'light') body.classList.add('light-theme');
    document.getElementById('themeToggle').addEventListener('click', () => {
        body.classList.toggle('light-theme');
        localStorage.setItem('theme', body.classList.contains('light-theme') ? 'light' : 'dark');
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        try { await logout(); } catch (e) { window.location.href = '/index.html'; }
    });

    let currentUserProfile = null;

    try {
        const session = await checkSession();
        if (!session) {
            window.location.href = '/index.html';
            return;
        }

        // Fetch user profile to verify admin role
        const { data: profile, error } = await supabase
            .from('perfiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (error) throw error;
        currentUserProfile = profile;

        document.getElementById('userName').textContent = profile.nombre_completo || session.user.email;

        if (profile.rol !== 'admin') {
            alert("No tienes permisos para acceder a esta página. Serás redirigido.");
            window.location.href = '/dashboard.html';
            return;
        }

        initAdminPanel();

    } catch (e) {
        console.error("Error validando sesión:", e);
        window.location.href = '/index.html';
    }

    function initAdminPanel() {
        const tbody = document.getElementById('usersTbody');
        const searchInput = document.getElementById('searchUsuario');
        let listaPerfiles = [];

        async function loadUsers() {
            try {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Cargando usuarios...</td></tr>';
                const { data, error } = await supabase
                    .from('perfiles')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) throw error;
                listaPerfiles = data;
                renderUsers(data);
            } catch (err) {
                console.error("Error cargando usuarios", err);
                tbody.innerHTML = '<tr><td colspan="4" class="error-msg">Error cargando usuarios.</td></tr>';
            }
        }

        function renderUsers(users) {
            tbody.innerHTML = '';
            if (users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No hay usuarios registrados.</td></tr>';
                return;
            }

            users.forEach(user => {
                const tr = document.createElement('tr');

                // Badge color based on role
                const isDocente = user.rol === 'docente';
                const roleBadge = `<span class="badge ${isDocente ? 'badge-warning' : 'badge-success'}" style="padding:4px 8px; border-radius:12px; font-size:0.8rem;">${user.rol.toUpperCase()}</span>`;

                tr.innerHTML = `
                    <td style="font-weight:600;">${user.nombre_completo || 'Sin Nombre'}</td>
                    <td style="font-size:0.85rem; opacity:0.8;">${user.id.substring(0, 8)}...</td>
                    <td>${roleBadge}</td>
                    <td>
                        <button class="btn-secondary btn-cambiar-rol" data-id="${user.id}" data-rol="${user.rol}" ${user.id === currentUserProfile.id ? 'disabled title="No puedes cambiar tu propio rol"' : ''}>
                            Cambiar a ${isDocente ? 'Admin' : 'Docente'}
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Add role toggle listeners
            document.querySelectorAll('.btn-cambiar-rol').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.dataset.id;
                    const currentRol = e.currentTarget.dataset.rol;
                    const nuevoRol = currentRol === 'docente' ? 'admin' : 'docente';

                    if (confirm(`¿Estás seguro de cambiar el rol de este usuario a ${nuevoRol.toUpperCase()}?`)) {
                        try {
                            // Update 'rol' in perfiles
                            const { error } = await supabase
                                .from('perfiles')
                                .update({ rol: nuevoRol })
                                .eq('id', id);

                            if (error) throw error;

                            // Re-fetch users
                            loadUsers();
                        } catch (err) {
                            alert("Error al actualizar el usuario: " + err.message);
                        }
                    }
                });
            });
        }

        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            const filt = listaPerfiles.filter(u =>
                (u.nombre_completo && u.nombre_completo.toLowerCase().includes(val)) ||
                u.rol.toLowerCase().includes(val)
            );
            renderUsers(filt);
        });

        loadUsers();
    }
});

import { supabase } from './supabase.js';

export async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });
    return { data, error };
}

export async function register(email, password, nombre) {
    // Validación rápida frontend
    if (!email.endsWith('@cuautla.tecnm.mx')) {
        return { error: { message: "Solo se permiten correos institucionales (@cuautla.tecnm.mx)" } };
    }

    // El trigger en PostgreSQL también validará esto.
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                nombre_completo: nombre
            }
        }
    });

    return { data, error };
}

export async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    window.location.href = '/index.html';
}

export async function checkSession() {
    // Para validación rápida en cliente usamos getSession()
    // Esto previene acceder si no hay un token local válido.
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

export async function isAdmin() {
    const session = await checkSession();
    if (!session) return false;
    try {
        const { data: profile } = await supabase
            .from('perfiles')
            .select('rol')
            .eq('id', session.user.id)
            .single();
        return profile?.rol === 'admin';
    } catch (e) {
        return false;
    }
}

export async function resetPassword(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/index.html',
    });
    return { data, error };
}

export async function updatePassword(newPassword) {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    return { data, error };
}

export function onRecovery(callback) {
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
            callback();
        }
    });
}

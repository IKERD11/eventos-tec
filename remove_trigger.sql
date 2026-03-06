-- ==========================================
-- SOLUCIÓN RADICAL: ELIMINAR TRIGGER PROBLEMÁTICO
-- ==========================================

-- Simplemente eliminar el trigger que está causando el error
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- ==========================================
-- AHORA PUEDES REGISTRARTE
-- El perfil se creará manualmente después
-- ==========================================

-- ==========================================
-- CREAR USUARIO ADMIN MANUALMENTE
-- Ejecuta este script si no puedes registrarte desde la aplicación
-- ==========================================

-- NOTA: Este script crea el usuario directamente en la tabla auth.users
-- Solo funciona si tienes acceso directo a la BD (normalmente no se puede desde SQL Editor)

-- ALTERNATIVA: Usa la interfaz de Supabase
-- 1. Ve a Authentication → Users
-- 2. Haz clic en "Add User" 
-- 3. Selecciona "Create User"
-- 4. Email: admin@cuautla.tecnm.mx
-- 5. Password: (la que quieras)
-- 6. Auto Confirm User: SÍ (importante)
-- 7. Haz clic en "Create User"

-- Después de crear el usuario, ejecuta esto para crear su perfil:
-- (Reemplaza 'UUID_DEL_USUARIO' con el UUID real del usuario creado)

-- INSERT INTO public.perfiles (id, nombre_completo, rol)
-- VALUES ('UUID_DEL_USUARIO', 'Administrador', 'admin')
-- ON CONFLICT (id) DO UPDATE SET rol = 'admin';

-- ==========================================
-- IMPORTANTE: 
-- Si no puedes crear usuarios, el problema está en:
-- Authentication → Providers → Email → Confirm email debe estar OFF
-- ==========================================

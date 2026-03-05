-- ============================================================
-- SEED: Crear usuario Admin General de prueba
-- Correr en el SQL Editor de Supabase del proyecto eventos-tec
-- PASO 2 DE 2 — Correr DESPUÉS de migration_admin_general.sql
-- ============================================================
-- Esto crea un usuario admin directamente en auth.users,
-- saltándose el trigger de validación de dominio.
--
-- Credenciales resultantes:
--   Email:    admin@cuautla.tecnm.mx
--   Password: Admin1234!
-- ============================================================

DO $$
DECLARE
  new_user_id UUID := gen_random_uuid();
BEGIN

  -- Solo inserta si el email no existe aún
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@cuautla.tecnm.mx') THEN

    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      aud,
      role
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'admin@cuautla.tecnm.mx',
      crypt('Admin1234!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"nombre_completo":"Admin General"}',
      now(),
      now(),
      'authenticated',
      'authenticated'
    );

    -- Insertar perfil (el trigger puede fallar por dominio, por eso lo hacemos manual)
    INSERT INTO public.perfiles (id, nombre_completo, rol, activo)
    VALUES (new_user_id, 'Admin General', 'admin_general', true)
    ON CONFLICT (id) DO UPDATE SET rol = 'admin_general', activo = true;

    RAISE NOTICE 'Usuario creado: admin@cuautla.tecnm.mx con rol admin_general';

  ELSE
    -- Si el usuario ya existe, solo actualiza su rol
    UPDATE public.perfiles
    SET rol = 'admin_general', activo = true
    WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@cuautla.tecnm.mx');

    RAISE NOTICE 'Usuario ya existía. Rol actualizado a admin_general.';
  END IF;

END $$;


-- ============================================================
-- ALTERNATIVA: Si ya tienes una cuenta con @cuautla.tecnm.mx
-- y solo quieres subirla a admin_general, corre solo esto:
-- (Reemplaza el email con el tuyo)
-- ============================================================
/*
UPDATE public.perfiles
SET rol = 'admin_general', activo = true
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'TU_EMAIL@cuautla.tecnm.mx'
);
*/

-- ============================================================
-- MIGRACIÓN: Admin General - activo column
-- Correr en el SQL Editor de Supabase del proyecto eventos-tec
-- ============================================================

-- 1. Agregar columna activo a perfiles (si aún no existe)
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;

-- 2. Actualizar política de perfiles para que admin_general y admin
--    puedan ver y actualizar TODOS los perfiles (no sólo el propio)
DROP POLICY IF EXISTS "Usuarios pueden actualizar su propio perfil" ON public.perfiles;

CREATE POLICY "Usuarios pueden actualizar perfil propio o admin puede todo"
ON public.perfiles FOR UPDATE
TO authenticated
USING (
    auth.uid() = id
    OR (SELECT rol FROM public.perfiles WHERE id = auth.uid()) IN ('admin', 'admin_general')
);

-- 3. Opcional: Permitir que admin vea perfiles incluso si activo = false
-- (La política de SELECT ya permite ver todos los perfiles autenticados)

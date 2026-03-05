-- ============================================================
-- MIGRACIÓN: Admin General
-- Correr en el SQL Editor de Supabase del proyecto eventos-tec
-- PASO 1 DE 2 — Correr este archivo primero
-- ============================================================

-- 1. Agregar columna activo a perfiles (si aún no existe)
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;

-- 2. Actualizar el CHECK para incluir rol admin_general y academia
ALTER TABLE public.perfiles
  DROP CONSTRAINT IF EXISTS perfiles_rol_check;

ALTER TABLE public.perfiles
  ADD CONSTRAINT perfiles_rol_check
  CHECK (rol IN ('docente', 'academia', 'admin', 'admin_general'));

-- 3. Política de UPDATE en perfiles: admin/admin_general puede editar todos
DROP POLICY IF EXISTS "Usuarios pueden actualizar su propio perfil" ON public.perfiles;
DROP POLICY IF EXISTS "Usuarios pueden actualizar perfil propio o admin puede todo" ON public.perfiles;

CREATE POLICY "Usuarios pueden actualizar perfil propio o admin puede todo"
ON public.perfiles FOR UPDATE
TO authenticated
USING (
    auth.uid() = id
    OR (SELECT rol FROM public.perfiles WHERE id = auth.uid()) IN ('admin', 'admin_general')
);

-- 4. Política de UPDATE en eventos: admin/admin_general puede editar cualquier evento
DROP POLICY IF EXISTS "Solo el creador puede actualizar sus eventos" ON public.eventos;

CREATE POLICY "Creador o admin puede actualizar eventos"
ON public.eventos FOR UPDATE
TO authenticated
USING (
    auth.uid() = creado_por
    OR (SELECT rol FROM public.perfiles WHERE id = auth.uid()) IN ('admin', 'admin_general')
);

-- 5. Política de DELETE en eventos: admin/admin_general puede eliminar cualquier evento
DROP POLICY IF EXISTS "Solo el creador puede eliminar sus eventos" ON public.eventos;

CREATE POLICY "Creador o admin puede eliminar eventos"
ON public.eventos FOR DELETE
TO authenticated
USING (
    auth.uid() = creado_por
    OR (SELECT rol FROM public.perfiles WHERE id = auth.uid()) IN ('admin', 'admin_general')
);

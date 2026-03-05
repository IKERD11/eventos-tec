-- ============================================================
-- MIGRACIÓN: Tabla personal + invitaciones
-- Correr en el SQL Editor de Supabase del proyecto eventos-tec
-- PASO 1 DE 2 — Correr DESPUÉS de migration_admin_general.sql
-- ============================================================

-- Extensión necesaria (ya debe estar activa)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. TABLA: personal
--    Almacena los docentes/staff importados desde Excel
-- ============================================================
CREATE TABLE IF NOT EXISTS public.personal (
    id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nombre_completo  TEXT NOT NULL,
    correo           TEXT NOT NULL UNIQUE,
    numero_control   TEXT,
    academia         TEXT,              -- "academia" = departamento/área del TecNM
    rol_institucional TEXT DEFAULT 'Docente',
    activo           BOOLEAN DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.personal ENABLE ROW LEVEL SECURITY;

-- Solo usuarios autenticados pueden ver personal
CREATE POLICY "Personal visible para autenticados"
ON public.personal FOR SELECT
TO authenticated
USING (true);

-- Solo admin/admin_general puede insertar, actualizar o eliminar personal
CREATE POLICY "Admin puede insertar personal"
ON public.personal FOR INSERT
TO authenticated
WITH CHECK (
    (SELECT rol FROM public.perfiles WHERE id = auth.uid()) IN ('admin', 'admin_general')
);

CREATE POLICY "Admin puede actualizar personal"
ON public.personal FOR UPDATE
TO authenticated
USING (
    (SELECT rol FROM public.perfiles WHERE id = auth.uid()) IN ('admin', 'admin_general')
);

CREATE POLICY "Admin puede eliminar personal"
ON public.personal FOR DELETE
TO authenticated
USING (
    (SELECT rol FROM public.perfiles WHERE id = auth.uid()) IN ('admin', 'admin_general')
);


-- ============================================================
-- 2. TABLA: invitaciones
--    Registro de correos de confirmación enviados por evento
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invitaciones (
    id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    evento_id     UUID REFERENCES public.eventos(id) ON DELETE CASCADE NOT NULL,
    personal_id   UUID REFERENCES public.personal(id) ON DELETE CASCADE NOT NULL,
    token         TEXT UNIQUE DEFAULT uuid_generate_v4()::text NOT NULL,
    confirmado    BOOLEAN DEFAULT NULL,   -- NULL=pendiente, true=sí, false=no
    enviado_at    TIMESTAMPTZ,
    respondido_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(evento_id, personal_id)        -- una invitación por persona por evento
);

ALTER TABLE public.invitaciones ENABLE ROW LEVEL SECURITY;

-- Admin puede gestionar invitaciones
CREATE POLICY "Admin puede gestionar invitaciones"
ON public.invitaciones FOR ALL
TO authenticated
USING (
    (SELECT rol FROM public.perfiles WHERE id = auth.uid()) IN ('admin', 'admin_general')
)
WITH CHECK (
    (SELECT rol FROM public.perfiles WHERE id = auth.uid()) IN ('admin', 'admin_general')
);


-- ============================================================
-- 3. FUNCIÓN: get_invitacion_by_token
--    Devuelve los datos de una invitación por su token único.
--    SECURITY DEFINER permite que la llame el rol anon (sin login).
--    Úsala desde la página pública confirmar-asistencia.html
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_invitacion_by_token(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'token',             i.token,
        'confirmado',        i.confirmado,
        'nombre',            p.nombre_completo,
        'correo',            p.correo,
        'evento_titulo',     e.titulo,
        'evento_fecha',      e.fecha,
        'evento_hora',       e.hora,
        'evento_lugar',      e.lugar,
        'evento_modalidad',  e.modalidad,
        'evento_descripcion',e.descripcion
    )
    INTO result
    FROM   public.invitaciones i
    JOIN   public.personal     p ON p.id = i.personal_id
    JOIN   public.eventos      e ON e.id = i.evento_id
    WHERE  i.token = p_token;

    IF result IS NULL THEN
        RETURN json_build_object('error', 'Token no encontrado o inválido');
    END IF;

    RETURN result;
END;
$$;


-- ============================================================
-- 4. FUNCIÓN: confirmar_invitacion
--    Registra la respuesta (sí/no) de un invitado.
--    SECURITY DEFINER: accesible sin login desde la página pública.
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirmar_invitacion(p_token TEXT, p_confirmado BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    inv RECORD;
BEGIN
    SELECT i.id, i.confirmado, e.titulo, p.nombre_completo
    INTO   inv
    FROM   public.invitaciones i
    JOIN   public.eventos      e ON e.id = i.evento_id
    JOIN   public.personal     p ON p.id = i.personal_id
    WHERE  i.token = p_token;

    IF NOT FOUND THEN
        RETURN json_build_object('error', 'Token no encontrado');
    END IF;

    IF inv.confirmado IS NOT NULL THEN
        RETURN json_build_object(
            'error',      'Ya habías respondido esta invitación',
            'confirmado', inv.confirmado,
            'titulo',     inv.titulo
        );
    END IF;

    UPDATE public.invitaciones
    SET    confirmado    = p_confirmado,
           respondido_at = now()
    WHERE  token = p_token;

    RETURN json_build_object(
        'ok',        true,
        'confirmado', p_confirmado,
        'titulo',    inv.titulo,
        'nombre',    inv.nombre_completo
    );
END;
$$;

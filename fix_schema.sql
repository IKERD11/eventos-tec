-- ==========================================
-- SCRIPT DE CORRECCIÓN DE SCHEMA
-- Ejecuta esto si las tablas ya existen pero hay errores
-- ==========================================

-- 1. ELIMINAR Y RECREAR EL TRIGGER Y FUNCIÓN
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recrear la función de validación y creación de perfil
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Validar dominio: @cuautla.tecnm.mx
    IF split_part(NEW.email, '@', 2) != 'cuautla.tecnm.mx' THEN
        RAISE EXCEPTION 'Registro denegado. Solo se permiten correos institucionales (@cuautla.tecnm.mx).';
    END IF;

    -- Insertar perfil (solo si no existe)
    INSERT INTO public.perfiles (id, nombre_completo, rol)
    VALUES (NEW.id, coalesce(NEW.raw_user_meta_data->>'nombre_completo', split_part(NEW.email, '@', 1)), 'docente')
    ON CONFLICT (id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recrear el trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. ASEGURAR QUE RLS ESTÉ HABILITADO
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participantes ENABLE ROW LEVEL SECURITY;

-- 3. ELIMINAR POLÍTICAS ANTIGUAS Y RECREARLAS
-- Políticas para perfiles
DROP POLICY IF EXISTS "Perfiles son visibles para todos los usuarios autenticados" ON public.perfiles;
DROP POLICY IF EXISTS "Usuarios pueden actualizar su propio perfil" ON public.perfiles;

CREATE POLICY "Perfiles son visibles para todos los usuarios autenticados" 
ON public.perfiles FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Usuarios pueden actualizar su propio perfil" 
ON public.perfiles FOR UPDATE 
TO authenticated 
USING (auth.uid() = id);

-- Políticas para eventos
DROP POLICY IF EXISTS "Cualquier usuario autenticado puede ver eventos" ON public.eventos;
DROP POLICY IF EXISTS "Solo el creador puede insertar eventos" ON public.eventos;
DROP POLICY IF EXISTS "Solo el creador puede actualizar sus eventos" ON public.eventos;
DROP POLICY IF EXISTS "Solo el creador puede eliminar sus eventos" ON public.eventos;

CREATE POLICY "Cualquier usuario autenticado puede ver eventos" 
ON public.eventos FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Solo el creador puede insertar eventos" 
ON public.eventos FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = creado_por);

CREATE POLICY "Solo el creador puede actualizar sus eventos" 
ON public.eventos FOR UPDATE 
TO authenticated 
USING (auth.uid() = creado_por);

CREATE POLICY "Solo el creador puede eliminar sus eventos" 
ON public.eventos FOR DELETE 
TO authenticated 
USING (auth.uid() = creado_por);

-- Políticas para participantes
DROP POLICY IF EXISTS "Cualquier usuario autenticado puede ver participantes" ON public.participantes;
DROP POLICY IF EXISTS "Cualquier usuario autenticado puede agregar participantes" ON public.participantes;
DROP POLICY IF EXISTS "Cualquier usuario autenticado puede modificar (marcar asistencia)" ON public.participantes;

CREATE POLICY "Cualquier usuario autenticado puede ver participantes" 
ON public.participantes FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Cualquier usuario autenticado puede agregar participantes" 
ON public.participantes FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Cualquier usuario autenticado puede modificar (marcar asistencia)" 
ON public.participantes FOR UPDATE 
TO authenticated 
USING (true);

-- 4. VERIFICAR/CREAR BUCKET DE STORAGE
INSERT INTO storage.buckets (id, name, public) 
VALUES ('eventos', 'eventos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage
DROP POLICY IF EXISTS "Cualquiera puede ver imágenes de eventos" ON storage.objects;
DROP POLICY IF EXISTS "Solo usuarios autenticados pueden subir imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios solo pueden modificar sus propias imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios solo pueden eliminar sus propias imágenes" ON storage.objects;

CREATE POLICY "Cualquiera puede ver imágenes de eventos"
ON storage.objects FOR SELECT
USING ( bucket_id = 'eventos' );

CREATE POLICY "Solo usuarios autenticados pueden subir imágenes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'eventos' 
    AND (storage.extension(name) = 'jpg' OR storage.extension(name) = 'png' OR storage.extension(name) = 'jpeg')
);

CREATE POLICY "Usuarios solo pueden modificar sus propias imágenes"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'eventos' AND auth.uid() = owner );

CREATE POLICY "Usuarios solo pueden eliminar sus propias imágenes"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'eventos' AND auth.uid() = owner );

-- ==========================================
-- FIN DEL SCRIPT
-- ==========================================

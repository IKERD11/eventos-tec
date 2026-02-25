-- ==========================================
-- SCRIPT DE INICIALIZACIÓN DE SUPABASE
-- Proyecto: Sistema de Gestión de Eventos
-- Autor: Asistente
-- ==========================================

-- 1. EXTENSIÓN NECESARIA PARA UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA: perfiles (Extiende de auth.users)
CREATE TABLE public.perfiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    nombre_completo TEXT,
    rol TEXT DEFAULT 'docente' CHECK (rol IN ('docente', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en perfiles
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

-- Políticas para perfiles
CREATE POLICY "Perfiles son visibles para todos los usuarios autenticados" 
ON public.perfiles FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Usuarios pueden actualizar su propio perfil" 
ON public.perfiles FOR UPDATE 
TO authenticated 
USING (auth.uid() = id);

-- 3. TRIGGER PARA CREAR PERFIL AL REGISTRAR USUARIO Y VALIDAR DOMINIO
-- Crea función para bloquear correos no institucionales y crear perfil
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Validar dominio: @cuautla.tecnm.mx
    IF split_part(NEW.email, '@', 2) != 'cuautla.tecnm.mx' THEN
        RAISE EXCEPTION 'Registro denegado. Solo se permiten correos institucionales (@cuautla.tecnm.mx).';
    END IF;

    -- Insertar perfil
    INSERT INTO public.perfiles (id, nombre_completo, rol)
    VALUES (NEW.id, coalesce(NEW.raw_user_meta_data->>'nombre_completo', split_part(NEW.email, '@', 1)), 'docente');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crea el trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. TABLA: eventos
CREATE TABLE public.eventos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    titulo TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    tipo TEXT,
    modalidad TEXT CHECK (modalidad IN ('Presencial', 'Virtual', 'Híbrido')),
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    lugar TEXT,
    cupo_maximo INTEGER NOT NULL CHECK (cupo_maximo > 0),
    imagen_url TEXT,
    estado TEXT DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Finalizado', 'Cancelado')),
    creado_por UUID REFERENCES public.perfiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en eventos
ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;

-- Políticas para eventos
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


-- 5. TABLA: participantes
CREATE TABLE public.participantes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nombre TEXT NOT NULL,
    correo TEXT NOT NULL,
    evento_id UUID REFERENCES public.eventos(id) ON DELETE CASCADE NOT NULL,
    asistio BOOLEAN DEFAULT false,
    estatus TEXT DEFAULT 'Confirmado' CHECK (estatus IN ('Confirmado', 'En Espera')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en participantes
ALTER TABLE public.participantes ENABLE ROW LEVEL SECURITY;

-- Políticas para participantes
CREATE POLICY "Cualquier usuario autenticado puede ver participantes" 
ON public.participantes FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Cualquier usuario autenticado puede agregar participantes" 
ON public.participantes FOR INSERT 
TO authenticated 
WITH CHECK (true); -- La validacion de cupo se recomienda hacer ademas por función o en la lógica de cliente

CREATE POLICY "Cualquier usuario autenticado puede modificar (marcar asistencia)" 
ON public.participantes FOR UPDATE 
TO authenticated 
USING (true);

-- 6. STORAGE: BUCKET 'eventos'
INSERT INTO storage.buckets (id, name, public) 
VALUES ('eventos', 'eventos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage para el bucket 'eventos'
-- Lectura pública (si el bucket es public = true, todos pueden descargar)
CREATE POLICY "Cualquiera puede ver imágenes de eventos"
ON storage.objects FOR SELECT
USING ( bucket_id = 'eventos' );

-- Insertar imágenes (solo autenticados)
CREATE POLICY "Solo usuarios autenticados pueden subir imágenes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'eventos' 
    AND (storage.extension(name) = 'jpg' OR storage.extension(name) = 'png' OR storage.extension(name) = 'jpeg')
);

-- Actualizar/Borrar sus propias imágenes
CREATE POLICY "Usuarios solo pueden modificar sus propias imágenes"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'eventos' AND auth.uid() = owner );

CREATE POLICY "Usuarios solo pueden eliminar sus propias imágenes"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'eventos' AND auth.uid() = owner );

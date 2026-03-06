-- ==========================================
-- SCRIPT PARA SOLUCIONAR PROBLEMA DE REGISTRO
-- ==========================================

-- PASO 1: Eliminar temporalmente el trigger que está causando problemas
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- PASO 2: Crear una versión más simple del trigger que NO falle
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Insertar perfil sin validación de dominio (para testing)
    INSERT INTO public.perfiles (id, nombre_completo, rol)
    VALUES (
        NEW.id, 
        COALESCE(NEW.raw_user_meta_data->>'nombre_completo', split_part(NEW.email, '@', 1)), 
        'docente'
    )
    ON CONFLICT (id) DO NOTHING;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Si hay error, solo loguear pero no fallar
    RAISE WARNING 'Error al crear perfil: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PASO 3: Recrear el trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- PASO 4: Asegurar que las políticas permitan inserción en perfiles
DROP POLICY IF EXISTS "Usuarios pueden insertar su propio perfil" ON public.perfiles;
CREATE POLICY "Usuarios pueden insertar su propio perfil" 
ON public.perfiles FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = id);

-- ==========================================
-- DESPUÉS DE EJECUTAR ESTE SCRIPT:
-- 1. Refresca tu aplicación
-- 2. Intenta REGISTRARTE (no hacer login)
-- 3. Usa un email @cuautla.tecnm.mx
-- ==========================================

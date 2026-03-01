-- =========================================================================
-- SQL MIGRATION SCRIPT: Convert single 'imagen_url' to 'imagenes_url' ARRAY
-- =========================================================================

-- Paso 1: Agregar la nueva columna tipo Array en la tabla eventos
ALTER TABLE public.eventos
ADD COLUMN imagenes_url TEXT[] DEFAULT '{}';

-- Paso 2 (Opcional pero recomendado): Migrar los datos antiguos
-- Si ya tienes eventos con una imagen, esto convierte ese enlace en el primer
-- elemento del nuevo array para que no pierdas las fotos actuales.
UPDATE public.eventos
SET imagenes_url = ARRAY[imagen_url]
WHERE imagen_url IS NOT NULL AND imagen_url != '';

-- Paso 3: Eliminar la columna vieja que ya no usaremos
ALTER TABLE public.eventos
DROP COLUMN imagen_url;

-- Nota: Si da error de permisos, asegúrate de correr esto desde el 
-- SQL Editor de Supabase (https://app.supabase.com) donde tienes permisos de superusuario.

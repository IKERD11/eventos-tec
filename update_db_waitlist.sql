-- Actualización para Sistema de Lista de Espera
-- Ejecuta este script en el SQL Editor de tu proyecto Supabase

-- Añadir la columna 'estatus' a la tabla de participantes (si no existe)
ALTER TABLE public.participantes 
ADD COLUMN IF NOT EXISTS estatus TEXT DEFAULT 'Confirmado' 
CHECK (estatus IN ('Confirmado', 'En Espera'));

-- Validar que todo ha salido bien
-- Selecciona los primeros 5 participantes para asegurar que tengan el estatus en 'Confirmado'
SELECT id, nombre, estatus FROM public.participantes LIMIT 5;

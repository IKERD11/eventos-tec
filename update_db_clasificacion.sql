-- Script para agregar la nueva columna de clasificación (carrera o departamento) a la tabla eventos
-- Abre el panel SQL Editor en Supabase y ejecuta este código:

ALTER TABLE public.eventos 
ADD COLUMN IF NOT EXISTS clasificacion TEXT DEFAULT 'Institucional';

-- ACTUALIZACIÓN PARA HABILITAR ADMINISTRADORES REGIONALES EN EVENTOS
-- Corre esto en el SQL Editor de Supabase para darle súper poderes al rol 'admin'

-- 1. Actualizar políticas de "eventos" (Para que los Admin puedan modificar/borrar todos)

-- Política para Update de eventos
DROP POLICY IF EXISTS "Solo el creador puede actualizar sus eventos" ON public.eventos;

CREATE POLICY "Creador o Admin pueden actualizar eventos" 
ON public.eventos FOR UPDATE 
TO authenticated 
USING (
    auth.uid() = creado_por 
    OR 
    (SELECT rol FROM public.perfiles WHERE id = auth.uid()) = 'admin'
);

-- Política para Delete de eventos
DROP POLICY IF EXISTS "Solo el creador puede eliminar sus eventos" ON public.eventos;

CREATE POLICY "Creador o Admin pueden eliminar eventos" 
ON public.eventos FOR DELETE 
TO authenticated 
USING (
    auth.uid() = creado_por 
    OR 
    (SELECT rol FROM public.perfiles WHERE id = auth.uid()) = 'admin'
);

-- Drop existing insert policy if it exists and is causing conflicts
DROP POLICY IF EXISTS "Cualquier usuario autenticado puede agregar participantes" ON public.participantes;

-- Create an explicit permissive insert policy for authenticated users
CREATE POLICY "Permitir insertar participantes a usuarios autenticados" 
ON public.participantes 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Also ensure UPDATE is fully permissive for checking attendance
DROP POLICY IF EXISTS "Cualquier usuario autenticado puede modificar (marcar asistencia)" ON public.participantes;

CREATE POLICY "Permitir actualizar participantes a usuarios autenticados" 
ON public.participantes 
FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Ensure DELETE policy exists so users can eventually remove participants if needed
DROP POLICY IF EXISTS "Permitir eliminar participantes" ON public.participantes;

CREATE POLICY "Permitir eliminar participantes"
ON public.participantes
FOR DELETE
TO authenticated
USING (true);

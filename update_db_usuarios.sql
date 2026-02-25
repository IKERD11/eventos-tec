-- Ejecuta este script adicional en Supabase SQL Editor para permitir a los administradores cambiar roles de otros usuarios

-- 1. Política para Update de perfiles (Admins pueden actualizar cualquier perfil)
DROP POLICY IF EXISTS "Admins pueden actualizar perfiles" ON public.perfiles;

CREATE POLICY "Admins pueden actualizar perfiles" 
ON public.perfiles FOR UPDATE 
TO authenticated 
USING (
    (SELECT rol FROM public.perfiles WHERE id = auth.uid()) = 'admin'
);

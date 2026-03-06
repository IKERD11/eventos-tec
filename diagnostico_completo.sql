-- ==========================================
-- DIAGNÓSTICO Y LIMPIEZA COMPLETA
-- ==========================================

-- PASO 1: Ver todos los triggers que pueden estar causando problemas
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers 
WHERE event_object_schema IN ('auth', 'public')
ORDER BY event_object_table;

-- PASO 2: Ver todas las funciones relacionadas con usuarios
SELECT 
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name LIKE '%user%';

-- ==========================================
-- EJECUTA ESTO PRIMERO para ver qué hay
-- Luego ejecuta la siguiente sección
-- ==========================================

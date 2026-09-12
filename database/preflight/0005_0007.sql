-- Solo lectura. Ejecutar antes de las migraciones pendientes 0005-0007.
-- 1. Debe devolver cero filas. No corregir estados automaticamente.
SELECT c.id AS campaign_id, c.name AS campaign_name,
       count(*) AS execution_count,
       jsonb_agg(jsonb_build_object(
         'id', g.id, 'name', g.name, 'sequence', g.sequence, 'status', g.status
       ) ORDER BY g.sequence, g.id) AS conflicting_games
FROM public.campaigns c
JOIN public.games g ON g.campaign_id = c.id
WHERE g.status IN ('active', 'paused')
GROUP BY c.id, c.name
HAVING count(*) > 1;

-- 2. Antes de 0005 todos deben ser NULL.
SELECT to_regclass('public.kpi_definitions') AS kpi_definitions,
       to_regclass('public.game_state_sets') AS game_state_sets,
       to_regclass('public.game_state_values') AS game_state_values,
       to_regclass('public.game_preparation_changes') AS game_preparation_changes,
       to_regtype('public.game_state_phase') AS game_state_phase;

-- 3. Comprobar con la conexion real del servidor y la de migraciones.
-- El rol del SQL Editor no necesariamente coincide con DATABASE_URL.
-- Sin politicas RLS, se requiere propietario, superusuario o BYPASSRLS,
-- ademas de los permisos SQL correspondientes.
SELECT current_user AS connection_role, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname = current_user;

-- 4. Debe mostrar las tres filas con role_exists = true.
SELECT expected.role_name, r.oid IS NOT NULL AS role_exists, r.rolbypassrls
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS expected(role_name)
LEFT JOIN pg_roles r ON r.rolname = expected.role_name
ORDER BY expected.role_name;

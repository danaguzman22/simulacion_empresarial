-- Solo lectura: ejecutar antes de 0008. No cambia datos ni roles.
-- Ambos resultados deben indicar que 0008 aun no se aplico.
SELECT to_regclass('public.game_kpis') AS game_kpis;
SELECT table_name,column_name FROM information_schema.columns
WHERE table_schema='public' AND ((table_name='kpi_definitions' AND column_name='historical_used_at')
 OR (table_name='game_state_values' AND column_name='game_id'));

-- Fotografiar valores antes del backfill para comparar despues.
SELECT s.game_id,s.phase,v.kpi_definition_id,v.value
FROM public.game_state_values v JOIN public.game_state_sets s ON s.id=v.state_set_id
ORDER BY s.game_id,s.phase,v.kpi_definition_id;

-- Asociaciones que generara el backfill, incluidos pendientes sin valor.
SELECT DISTINCT s.game_id,d.id AS kpi_definition_id,d.key,d.required
FROM public.game_state_sets s JOIN public.kpi_definitions d ON d.campaign_id=s.campaign_id
WHERE (s.phase='preparation' AND d.active) OR EXISTS (
 SELECT 1 FROM public.game_state_values v WHERE v.state_set_id=s.id AND v.kpi_definition_id=d.id
)
ORDER BY s.game_id,d.key;

-- Debe devolver cero filas: coherencia de campana existente.
SELECT v.id FROM public.game_state_values v
JOIN public.game_state_sets s ON s.id=v.state_set_id
JOIN public.kpi_definitions d ON d.id=v.kpi_definition_id
WHERE v.campaign_id<>s.campaign_id OR d.campaign_id<>s.campaign_id;

-- Detecta uso historico a proteger e indicadores numericos actuales invalidos.
SELECT DISTINCT d.id,d.key FROM public.kpi_definitions d
JOIN public.game_state_values v ON v.kpi_definition_id=d.id
JOIN public.game_state_sets s ON s.id=v.state_set_id
WHERE s.phase IN ('initial','current','final');
SELECT v.id FROM public.game_state_values v JOIN public.kpi_definitions d ON d.id=v.kpi_definition_id
WHERE v.value<>round(v.value,d.precision) OR (v.value<0 AND NOT d.allows_negative);

-- La migracion necesita ser propietaria de estas tablas (o superusuario).
SELECT current_user AS connection_role,r.rolsuper,r.rolbypassrls,
 c.relname,pg_has_role(current_user,c.relowner,'USAGE') AS owns_table
FROM pg_roles r CROSS JOIN pg_class c
WHERE r.rolname=current_user AND c.oid IN ('public.game_state_values'::regclass,'public.game_state_sets'::regclass,'public.kpi_definitions'::regclass,'public.game_preparation_changes'::regclass);

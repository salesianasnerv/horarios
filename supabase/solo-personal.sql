-- Horarios solo para el personal del colegio (protección de datos, 21-10-2026).
-- Hasta ahora cualquiera podía leer los horarios, las ausencias y las sustituciones sin iniciar sesión.
-- Desde aquí, solo las cuentas del colegio con sesión iniciada (es_profesorado()); escribir sigue siendo
-- solo para la administración. El parte de Teams no cambia: lo envía la propia base de datos.
--
-- ¡Ejecutar DESPUÉS de publicar en la web real la versión que pide iniciar sesión! Si no, la parte
-- pública se quedaría vacía hasta entonces.

begin;

do $$
declare t text;
begin
  foreach t in array array['hor_cursos','hor_docentes','hor_grupos','hor_tramos','hor_materias','hor_ocupaciones',
                           'hor_zonas_recreo','hor_turnos_recreo','hor_ausencias','hor_coberturas','hor_avisos','hor_config'] loop
    execute format('drop policy if exists lectura_publica on %I', t);
    execute format('drop policy if exists lectura_personal on %I', t);
    execute format('create policy lectura_personal on %I for select to authenticated using (es_profesorado())', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

commit;

-- Para volver atrás (solo si algo falla):
-- do $$ declare t text; begin
--   foreach t in array array['hor_cursos','hor_docentes','hor_grupos','hor_tramos','hor_materias','hor_ocupaciones',
--                            'hor_zonas_recreo','hor_turnos_recreo','hor_ausencias','hor_coberturas','hor_avisos','hor_config'] loop
--     execute format('grant select on %I to anon', t);
--     execute format('create policy lectura_publica on %I for select using (true)', t);
--   end loop; end $$;

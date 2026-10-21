-- Horarios solo para el personal de ESO y Bachillerato (22-10-2026).
-- Los horarios son de esas dos etapas: los leen quienes están en sus grupos de Microsoft 365
-- (E-NER-ESO o E-NER-Bachillerato, con sus grupos internos: dirección, coordinaciones, Orientación…)
-- y quienes administran Horarios. El resto del personal (Infantil, Primaria, FP, PAS) ya no los ve.
-- Requiere la sincronización de grupos (personal.grupos_entra).

begin;

create or replace function hor_puede_ver() returns boolean
language sql stable security definer set search_path = public as $$
  select es_profesorado() and (
    hor_es_admin()
    or exists (select 1 from personal where email = email_actual() and activo
               and grupos_entra && array['eso', 'bachillerato']))
$$;
revoke execute on function hor_puede_ver() from public, anon;
grant execute on function hor_puede_ver() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['hor_cursos','hor_docentes','hor_grupos','hor_tramos','hor_materias','hor_ocupaciones',
                           'hor_zonas_recreo','hor_turnos_recreo','hor_ausencias','hor_coberturas','hor_avisos','hor_config'] loop
    execute format('drop policy if exists lectura_personal on %I', t);
    execute format('create policy lectura_personal on %I for select to authenticated using (hor_puede_ver())', t);
  end loop;
end $$;

commit;

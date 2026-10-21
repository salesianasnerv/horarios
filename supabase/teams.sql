-- Parte de sustituciones en un canal de Teams, cada día lectivo a las 7:30 (se ejecuta una sola vez en el SQL Editor de Supabase).
--
-- Cómo funciona:
--   · Cada vez que jefatura guarda una ausencia o una sustitución, la web prepara la imagen del parte de los días
--     afectados y la deja en hor_teams_partes (con el mensaje ya montado). Si un día deja de tener sustituciones, lo borra.
--   · A las 7:30 (hora de Sevilla), la base de datos manda al canal el parte de ese día, si lo hay (pg_cron + pg_net).
--
-- La dirección del flujo de Teams (webhook) es secreta: quien la tenga puede publicar en el canal. Por eso no va en el
-- código de la web ni en hor_config (que se lee sin iniciar sesión), sino en hor_secretos, que nadie lee desde la web.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists hor_secretos (
  clave text primary key,
  valor text not null
);
alter table hor_secretos enable row level security;  -- sin políticas: nadie la lee ni la cambia desde la web
revoke all on hor_secretos from anon, authenticated;

-- Partes preparados para enviar (uno por día)
create table if not exists hor_teams_partes (
  curso_id text not null references hor_cursos(id) on delete cascade,
  fecha date not null,
  imagen_ruta text,            -- archivo de la imagen en Storage (hor-adjuntos)
  mensaje jsonb not null,      -- tarjeta para Teams, ya montada por la web
  actualizado timestamptz not null default now(),
  enviado timestamptz,         -- cuándo se mandó (null = pendiente)
  envio_id bigint,             -- número de envío de pg_net, para saber cómo fue
  primary key (curso_id, fecha)
);
alter table hor_teams_partes enable row level security;
drop policy if exists solo_admin on hor_teams_partes;
create policy solo_admin on hor_teams_partes for all to authenticated using (hor_es_admin()) with check (hor_es_admin());

-- ¿Hay un canal de Teams configurado?
create or replace function hor_teams_configurado() returns boolean
language sql security definer stable set search_path = public as $$
  select hor_es_admin() and exists (select 1 from hor_secretos where clave = 'teams_webhook');
$$;

-- Guardar (o borrar, si se deja vacía) la dirección del flujo de Teams.
create or replace function hor_guardar_webhook_teams(url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not hor_es_admin() then raise exception 'Solo la administración puede cambiar el canal de Teams'; end if;
  url := trim(coalesce(url, ''));
  if url = '' then
    delete from hor_secretos where clave = 'teams_webhook';
  elsif url !~ '^https://' then
    raise exception 'La dirección del flujo tiene que empezar por https://';
  else
    insert into hor_secretos (clave, valor) values ('teams_webhook', url)
    on conflict (clave) do update set valor = excluded.valor;
  end if;
end $$;

-- Envío diario: lo lanza pg_cron. Manda el parte de hoy si existe y no se ha mandado ya.
create or replace function hor_teams_envio_diario() returns void
language plpgsql security definer set search_path = public as $$
declare
  ahora timestamp := now() at time zone 'Europe/Madrid';
  destino text;
  p record;
begin
  -- pg_cron va en hora UTC: se lanza a las 5:30 y a las 6:30 UTC y solo sigue la que cae a las 7:30 en Sevilla
  -- (así vale con horario de invierno y de verano).
  if ahora::time < '07:25' or ahora::time > '07:45' then return; end if;
  select valor into destino from hor_secretos where clave = 'teams_webhook';
  if destino is null then return; end if;
  for p in select * from hor_teams_partes where fecha = ahora::date and enviado is null loop
    update hor_teams_partes
       set enviado = now(),
           envio_id = net.http_post(url := destino, body := p.mensaje,
                                    headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 15000)
     where curso_id = p.curso_id and fecha = p.fecha;
  end loop;
end $$;
revoke execute on function hor_teams_envio_diario() from public, anon, authenticated;

-- Cómo fue un envío (null si ya no queda constancia: pg_net guarda las respuestas unas horas).
create or replace function hor_resultado_teams(envio bigint) returns jsonb
language sql security definer stable set search_path = public as $$
  select case when hor_es_admin() then (
    select jsonb_build_object('codigo', r.status_code, 'error', coalesce(r.error_msg, case when r.timed_out then 'Tiempo agotado' end))
    from net._http_response r where r.id = envio) end;
$$;

revoke execute on function hor_teams_configurado(), hor_guardar_webhook_teams(text), hor_resultado_teams(bigint) from public, anon;
grant execute on function hor_teams_configurado(), hor_guardar_webhook_teams(text), hor_resultado_teams(bigint) to authenticated;

-- De lunes a viernes a las 5:30 y 6:30 UTC (= 7:30 en Sevilla en invierno o en verano)
select cron.unschedule('hor-teams-parte') where exists (select 1 from cron.job where jobname = 'hor-teams-parte');
select cron.schedule('hor-teams-parte', '30 5,6 * * 1-5', 'select hor_teams_envio_diario()');

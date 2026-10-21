-- Parte de sustituciones en un canal de Teams, cada día lectivo a las 7:30 (SQL Editor de Supabase).
-- Se puede ejecutar más de una vez: deja todo como debe estar.
--
-- Cómo funciona:
--   · Cada vez que jefatura guarda una ausencia o una sustitución, la web prepara la imagen del parte de los días
--     afectados y la deja en hor_teams_partes (con el mensaje ya montado). Si un día deja de tener sustituciones, lo borra.
--   · A las 7:30 (hora de Sevilla), pg_cron llama a la función de Supabase «hor-teams» (supabase/functions/hor-teams),
--     que se identifica ante Microsoft como la app «Acceso a Microsoft 365» y manda al canal el parte de ese día.
--     (El colegio no deja que nadie de fuera active los flujos de Teams, por eso hace falta identificarse.)
--
-- La dirección del flujo de Teams (webhook) y la clave para llamar a la función son secretas: están en hor_secretos,
-- que nadie puede leer desde la web.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists hor_secretos (
  clave text primary key,
  valor text not null
);
alter table hor_secretos enable row level security;  -- sin políticas: nadie la lee ni la cambia desde la web
revoke all on hor_secretos from anon, authenticated;

-- Clave que la base de datos manda a la función para que solo ella pueda usarla (se crea una vez, al azar)
insert into hor_secretos (clave, valor)
values ('clave_funcion', md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text))
on conflict (clave) do nothing;

-- Partes preparados para enviar (uno por día)
create table if not exists hor_teams_partes (
  curso_id text not null references hor_cursos(id) on delete cascade,
  fecha date not null,
  imagen_ruta text,            -- archivo de la imagen en Storage (hor-adjuntos)
  mensaje jsonb not null,      -- tarjeta para Teams, ya montada por la web
  actualizado timestamptz not null default now(),
  enviado timestamptz,         -- cuándo se mandó (null = pendiente)
  resultado jsonb,             -- cómo fue: { codigo, error }
  primary key (curso_id, fecha)
);
alter table hor_teams_partes add column if not exists resultado jsonb;
alter table hor_teams_partes drop column if exists envio_id;
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

-- Pide a la función «hor-teams» que mande el parte de un día (si lo hay y no se ha mandado).
-- Para probar a mano desde el SQL Editor: select hor_teams_mandar(current_date);
create or replace function hor_teams_mandar(dia date) returns bigint
language plpgsql security definer set search_path = public as $$
declare clave text;
begin
  if not exists (select 1 from hor_teams_partes where fecha = dia and enviado is null) then return null; end if;
  select valor into clave from hor_secretos where clave = 'clave_funcion';
  return net.http_post(
    url := 'https://hblayjaknhfxieqbzrlq.supabase.co/functions/v1/hor-teams',
    body := jsonb_build_object('fecha', dia),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-clave', clave),
    timeout_milliseconds := 30000);
end $$;

-- Envío diario: lo lanza pg_cron. pg_cron va en hora UTC: se lanza a las 5:30 y a las 6:30 UTC y solo sigue
-- la que cae a las 7:30 en Sevilla (así vale con horario de invierno y de verano).
create or replace function hor_teams_envio_diario() returns void
language plpgsql security definer set search_path = public as $$
declare ahora timestamp := now() at time zone 'Europe/Madrid';
begin
  if ahora::time < '07:25' or ahora::time > '07:45' then return; end if;
  perform hor_teams_mandar(ahora::date);
end $$;

drop function if exists hor_resultado_teams(bigint);
revoke execute on function hor_teams_envio_diario(), hor_teams_mandar(date) from public, anon, authenticated;
revoke execute on function hor_teams_configurado(), hor_guardar_webhook_teams(text) from public, anon;
grant execute on function hor_teams_configurado(), hor_guardar_webhook_teams(text) to authenticated;

-- De lunes a viernes a las 5:30 y 6:30 UTC (= 7:30 en Sevilla en invierno o en verano)
select cron.unschedule('hor-teams-parte') where exists (select 1 from cron.job where jobname = 'hor-teams-parte');
select cron.schedule('hor-teams-parte', '30 5,6 * * 1-5', 'select hor_teams_envio_diario()');

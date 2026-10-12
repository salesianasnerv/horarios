-- Esquema de la web de horarios y sustituciones.
-- Supabase → SQL Editor → New query → pega todo este archivo → Run.
-- Se ejecuta en el proyecto común «Acceso Microsoft 365» (el del control de baños): todo lleva el prefijo hor_ y no toca las demás tablas.

create table if not exists hor_cursos (
  id text primary key,
  nombre text not null,
  activo boolean not null default false,
  inicio date,
  fin date,
  centro text
);

create table if not exists hor_docentes (
  curso_id text not null references hor_cursos(id) on delete cascade,
  id text not null,
  nombre text not null,
  corto text,
  abrev text,
  activo boolean not null default true,
  en_bolsa boolean not null default true,   -- entra en el reparto de sustituciones
  orden int,
  notas text,
  primary key (curso_id, id)
);

create table if not exists hor_grupos (
  curso_id text not null references hor_cursos(id) on delete cascade,
  id text not null,
  nombre text not null,
  etapa text,
  orden int,
  tutor_id text,
  aula text,
  primary key (curso_id, id)
);

create table if not exists hor_tramos (
  curso_id text not null references hor_cursos(id) on delete cascade,
  id text not null,
  orden int not null,
  etiqueta text,
  inicio text not null,       -- "08:00"
  fin text not null,
  lectivo boolean not null default true,
  primary key (curso_id, id)
);

create table if not exists hor_materias (
  curso_id text not null references hor_cursos(id) on delete cascade,
  id text not null,
  abrev text not null,
  nombre text,
  niveles text[] not null default '{}',   -- hor_cursos en los que se usa este nombre (vacío = todos)
  primary key (curso_id, id)
);

-- Una fila por cada cosa que hace un docente en un día y tramo.
create table if not exists hor_ocupaciones (
  curso_id text not null references hor_cursos(id) on delete cascade,
  id text not null,
  docente_id text not null,
  dia int not null check (dia between 1 and 5),
  tramo_id text not null,
  tipo text not null,          -- clase | tutoria | apoyo | coordinacion | no_lectiva | guardia | otro
  materia text,
  hor_grupos text[] not null default '{}',
  subgrupo text,
  detalle text,
  aula text,                   -- si es distinta del aula del grupo
  primary key (curso_id, id)
);
create index if not exists hor_ocupaciones_docente on hor_ocupaciones (curso_id, docente_id);

create table if not exists hor_zonas_recreo (
  curso_id text not null references hor_cursos(id) on delete cascade,
  id text not null,
  patio text,
  nombre text not null,
  descripcion text,
  orden int,
  primary key (curso_id, id)
);

create table if not exists hor_turnos_recreo (
  curso_id text not null references hor_cursos(id) on delete cascade,
  id text not null,
  zona_id text not null,
  dia int not null check (dia between 1 and 5),
  docente_id text not null,
  nota text,
  primary key (curso_id, id)
);

-- Ausencias puntuales y bajas largas (con periodo y, opcionalmente, sustituto/a que hereda el horario).
create table if not exists hor_ausencias (
  curso_id text not null references hor_cursos(id) on delete cascade,
  id text not null,
  docente_id text not null,
  desde date not null,
  hasta date,                  -- null = sin fecha de fin
  hor_tramos text[] not null default '{}',  -- vacío = todo el día
  larga boolean not null default false,
  sustituto_id text,
  sustituto_desde date,
  nota text,                   -- visible para todo el claustro
  primary key (curso_id, id)
);

-- El motivo de la ausencia es privado: solo lo ve la administración.
create table if not exists hor_ausencias_motivo (
  curso_id text not null references hor_cursos(id) on delete cascade,
  id text not null,
  motivo text,
  primary key (curso_id, id)
);

-- Cada hora cubierta (base del contador).
create table if not exists hor_coberturas (
  curso_id text not null references hor_cursos(id) on delete cascade,
  id text not null,
  fecha date not null,
  tramo_id text not null,
  ocupacion_id text not null,
  ausente_id text,
  sustituto_id text,
  ausencia_id text,
  nota text,                    -- aviso para esa hora (lo que manda el profesor/a ausente)
  adjuntos jsonb not null default '[]',  -- archivos adjuntos [{nombre, url, tipo, ruta}]
  primary key (curso_id, id)
);
create index if not exists hor_coberturas_fecha on hor_coberturas (curso_id, fecha);

-- Avisos que publica jefatura en la pestaña «Hoy».
create table if not exists hor_avisos (
  curso_id text not null references hor_cursos(id) on delete cascade,
  id text not null,
  texto text not null,
  desde date,
  hasta date,
  importante boolean not null default false,
  primary key (curso_id, id)
);

create table if not exists hor_config (
  curso_id text not null references hor_cursos(id) on delete cascade,
  clave text not null,
  valor jsonb,
  primary key (curso_id, clave)
);

create table if not exists hor_admins (
  email text primary key
);

-- ¿La persona que ha iniciado sesión está en la lista de administradores?
create or replace function hor_es_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from hor_admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
grant execute on function hor_es_admin() to anon, authenticated;

-- Seguridad: todo el mundo puede LEER los horarios; solo los administradores pueden ESCRIBIR.
do $$
declare t text;
begin
  foreach t in array array['hor_cursos','hor_docentes','hor_grupos','hor_tramos','hor_materias','hor_ocupaciones',
                           'hor_zonas_recreo','hor_turnos_recreo','hor_ausencias','hor_coberturas','hor_avisos','hor_config'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists lectura_publica on %I', t);
    execute format('drop policy if exists escritura_admin on %I', t);
    execute format('create policy lectura_publica on %I for select using (true)', t);
    execute format('create policy escritura_admin on %I for all to authenticated using (hor_es_admin()) with check (hor_es_admin())', t);
  end loop;
end $$;

alter table hor_ausencias_motivo enable row level security;
drop policy if exists solo_admin on hor_ausencias_motivo;
create policy solo_admin on hor_ausencias_motivo for all to authenticated using (hor_es_admin()) with check (hor_es_admin());

alter table hor_admins enable row level security;
drop policy if exists solo_admin on hor_admins;
create policy solo_admin on hor_admins for all to authenticated using (hor_es_admin()) with check (hor_es_admin());

-- Archivos adjuntos de los avisos: carpeta pública (solo lectura) en Storage; solo la administración sube y borra.
insert into storage.buckets (id, name, public, file_size_limit)
values ('hor-adjuntos', 'hor-adjuntos', true, 10485760)
on conflict (id) do nothing;
drop policy if exists hor_adjuntos_subir on storage.objects;
drop policy if exists hor_adjuntos_borrar on storage.objects;
create policy hor_adjuntos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'hor-adjuntos' and hor_es_admin());
create policy hor_adjuntos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'hor-adjuntos' and hor_es_admin());

-- Personas con acceso a la administración (se pueden cambiar después desde Datos → Cursos).
insert into hor_admins (email) values
  ('mangeles.chavez@salesianas.org'),
  ('laura.ramos@salesianas.org'),
  ('rocio.cano@salesianas.org'),
  ('ana.felipe@salesianas.org'),
  ('anam.gallardo@salesianas.org'),
  ('miguelangel.arcos@salesianas.org')
on conflict do nothing;

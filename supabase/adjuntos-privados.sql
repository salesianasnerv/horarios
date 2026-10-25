-- Horarios · carpeta de adjuntos privada (25-10-2026). PEDIR VISTO BUENO A MARIÁN ANTES.
-- Ejecutar en Supabase → SQL Editor, proyecto «Acceso Microsoft 365». Se puede volver a ejecutar.
-- Ejecutarlo A LA VEZ que se publica la versión de la web que pide enlaces temporales (si no, los adjuntos no se abren).
--
-- Qué cambia
--   · La carpeta «hor-adjuntos» (archivos de los avisos e imagen del parte de Teams) deja de ser pública.
--   · Los archivos solo los abre quien puede ver Horarios (personal de ESO y Bachillerato o permiso «horarios»),
--     con un enlace que la web pide al momento y caduca a los 10 minutos.
--   · La imagen del parte de Teams se envía con un enlace de 30 días: pasado ese tiempo, el mensaje de Teams
--     se queda sin imagen (el texto sigue). Los partes ya enviados antes de este cambio pierden la imagen ya.

begin;

update storage.buckets set public = false where id = 'hor-adjuntos';

drop policy if exists hor_adjuntos_ver on storage.objects;
create policy hor_adjuntos_ver on storage.objects for select to authenticated
  using (bucket_id = 'hor-adjuntos' and (hor_puede_ver() or hor_es_admin()));

commit;

-- Comprobación: tiene que salir public = false
select id, public from storage.buckets where id = 'hor-adjuntos';

-- Para volver atrás: update storage.buckets set public = true where id = 'hor-adjuntos';

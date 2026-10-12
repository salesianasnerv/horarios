-- Reparación (12/10/2026): en la primera versión de schema.sql dos columnas se crearon con un prefijo de más.
-- Ejecutar UNA vez en el proyecto «Acceso Microsoft 365» → SQL Editor → Run.
alter table hor_ocupaciones rename column hor_grupos to grupos;
alter table hor_ausencias rename column hor_tramos to tramos;

-- Se borra el curso que quedó cargado a medias (se borra en cascada su profesorado, grupos, tramos y materias)
-- para volver a cargarlo completo desde la administración con «Cargar curso 2026-2027».
delete from hor_cursos where id = 'c-2026-2027';

-- Que la API vea ya las columnas con su nombre correcto.
notify pgrst, 'reload schema';

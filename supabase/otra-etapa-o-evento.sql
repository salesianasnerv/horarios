-- Sustituciones de alguien de otra etapa (no está en el listado) o por un evento (p. ej. semana de evaluación).
-- Supabase → proyecto «Acceso Microsoft 365» → SQL Editor → New query → pega esto → Run. Solo hace falta una vez.
alter table hor_coberturas add column if not exists extra jsonb;

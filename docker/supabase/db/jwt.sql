-- Copiado de supabase/supabase, docker/volumes/db/jwt.sql (Apache-2.0), sem alteração.
-- Roda UMA vez, no primeiro boot do contêiner `db` (docker-entrypoint-initdb.d).
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';

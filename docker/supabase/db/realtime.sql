-- Copiado de supabase/supabase, docker/volumes/db/realtime.sql (Apache-2.0), sem alteração.
-- Roda UMA vez, no primeiro boot do contêiner `db` (docker-entrypoint-initdb.d).
\set pguser `echo "$POSTGRES_USER"`

create schema if not exists _realtime;
alter schema _realtime owner to :pguser;

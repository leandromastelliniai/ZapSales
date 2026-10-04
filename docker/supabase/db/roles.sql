-- Copiado de supabase/supabase, docker/volumes/db/roles.sql (Apache-2.0), com UMA
-- alteração: sai o `ALTER USER supabase_functions_admin`. Esse papel só existe quando
-- o webhooks.sql (edge functions) também roda no primeiro boot, e o ZapSales não sobe
-- edge functions. Com a linha, o script aborta nela (medido: "role
-- supabase_functions_admin does not exist") e as senhas de Auth e Storage nunca são
-- definidas — os dois contêineres ficam reiniciando com "password authentication failed".
-- Roda UMA vez, no primeiro boot do contêiner `db` (docker-entrypoint-initdb.d).
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';

-- O papel dedicado do app e do worker — a receita de
-- docs/runbooks/banco-e-papel-do-worker.md §2, aplicada pelo kit.
--
-- Idempotente: cria o papel se faltar e SEMPRE reafirma senha e grants, porque
-- a atualização re-aplica o baseline.sql, e objeto novo precisa nascer
-- alcançável pelo worker. A senha chega como variável do psql
-- (`-v senha=...`), nunca escrita aqui.
--
-- Roda DEPOIS do baseline.sql, como supabase_admin (o superusuário da imagem do
-- Supabase — `psql_admin` em kit/lib/stack.sh): criar papel com BYPASSRLS exige
-- quem também o tenha. O `for role "postgres"` abaixo continua certo, porque é o
-- `postgres` quem aplica o baseline e cria os objetos.

select format('create role agent_worker login password %L bypassrls', :'senha')
 where not exists (select 1 from pg_roles where rolname = 'agent_worker')
\gexec

select format('alter role agent_worker with login bypassrls password %L', :'senha')
\gexec

grant usage on schema public to agent_worker;
grant select, insert, update, delete on all tables in schema public to agent_worker;
grant usage, select on all sequences in schema public to agent_worker;
grant execute on all functions in schema public to agent_worker;

alter default privileges for role "postgres" in schema public grant execute on functions to agent_worker;
alter default privileges for role "postgres" in schema public grant usage, select on sequences to agent_worker;
alter default privileges for role "postgres" in schema public grant select, insert, update, delete on tables to agent_worker;

-- A auditoria é só-inclusão para todo papel (migration 0525).
revoke update, delete, truncate on table public.api_audit_log from agent_worker;

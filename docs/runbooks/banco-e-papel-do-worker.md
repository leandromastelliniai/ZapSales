# Runbook — aplicar o schema e criar o papel do worker

Receita de banco que todo kit de instalação do ZapSales precisa cumprir (o kit da VPS
Hostinger vem nas issues #3 e #12). Vale para Supabase self-hosted e para projeto
Supabase na nuvem.

## 1. Aplicar o schema

```bash
# DDL roda com a conexão do DONO do banco
DDL="${SUPABASE_DB_ADMIN_URL:-$SUPABASE_DB_URL}"
psql "$DDL" -v ON_ERROR_STOP=1 -c \
  'create extension if not exists vector with schema public;
   create extension if not exists citext with schema public;
   create extension if not exists pg_trgm with schema public;'
psql "$DDL" -v ON_ERROR_STOP=1 -f supabase/baseline.sql
```

O `baseline.sql` é idempotente: para **atualizar** uma instalação existente, rode o
mesmo comando de novo, **com a mesma flag** — re-aplicar não erra. Quem prova isso é o
job `invariants` do CI, que aplica o arquivo em modo install e de novo em modo update,
as duas vezes com `ON_ERROR_STOP=1`. Aplique o `baseline.sql`, nunca a cadeia de
`supabase/migrations/` (ela não sobe do zero).

Usando Postgres próprio em vez de Supabase: aplique ANTES o
`scripts/selfhost-prelude.sql` (papéis, schemas e extensões que o dump supõe). O login
do app exige Supabase real; worker e agente funcionam integralmente.

## 2. Criar o papel dedicado do worker

Mais seguro que dar ao worker a conexão do superusuário:

```sql
create role agent_worker login password 'TROQUE-ESTA-SENHA' bypassrls;
grant usage on schema public to agent_worker;
grant select, insert, update, delete on all tables in schema public to agent_worker;
grant usage, select on all sequences in schema public to agent_worker;
grant execute on all functions in schema public to agent_worker;

-- Funções e tabelas criadas por migration FUTURA nascem sem os grants acima;
-- só os objetos que já existem no momento deste bloco os recebem. A
-- atualização re-aplica o `baseline.sql`, que re-emite default privileges só
-- para postgres/anon/authenticated/service_role — agent_worker fica de fora.
-- Espelhe a mesma convenção (`FOR ROLE "postgres"`) para que todo objeto que
-- o dono criar a partir daqui já nasça alcançável pelo worker:
alter default privileges for role "postgres" in schema public grant execute on functions to agent_worker;
alter default privileges for role "postgres" in schema public grant usage, select on sequences to agent_worker;
alter default privileges for role "postgres" in schema public grant select, insert, update, delete on tables to agent_worker;

-- A auditoria é só-inclusão para todo papel: o worker grava e lê
-- `api_audit_log`, nunca altera nem apaga. O `baseline.sql` reafirma isto a
-- cada atualização (migration 0525), com o nome que o papel tiver.
revoke update, delete, truncate on table public.api_audit_log from agent_worker;
```

Se o papel do **dono** na sua instalação não for `postgres`, troque `for role
"postgres"` pelo nome dele nas linhas `alter default privileges` — é quem o
`baseline.sql` roda como, e é esse papel que o default ACL segue.

## 3. As duas conexões

- `SUPABASE_DB_URL` (no `.env`) aponta para o papel `agent_worker` — é a que o app e o
  worker usam.
- `SUPABASE_DB_ADMIN_URL` fica com a conexão do **dono** — é a que aplica o
  `baseline.sql`.

Usar a mesma string para as duas faz o `baseline.sql` falhar por falta de permissão na
primeira atualização. Quem cobra a receita acima é
`tests/invariants/audit-log-so-inclusao-para-todo-papel.test.ts`, que lê o bloco SQL
deste arquivo e o aplica num Postgres de teste.

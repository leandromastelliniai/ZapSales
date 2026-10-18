-- manifest: **Instalar um módulo não trava mais o núcleo (issue #130).** `fn_proteger_modulo_provisionado()` chamava a varredura inteira das travas do suporte (`drop policy` + `create policy` em ~126 tabelas, ACCESS EXCLUSIVE, numa transação) e dava `40P01` com a leitura da autenticação; agora chama `fn_aplicar_travas_de_suporte_em_tabelas_sem_trava()`, que só alcança tabela gravável sem as três travas. A varredura total segue no baseline.
-- 0554 — Instalar um módulo não trava as tabelas do núcleo.
--
-- Medido (PGlite sobre o baseline, numa transação): `fn_proteger_modulo_provisionado()` segurava
-- ACCESS EXCLUSIVE em 126 tabelas do núcleo, `organizations` e `user_organizations` entre elas —
-- as duas que a autenticação lê em TODA requisição (`lib/auth/server.ts`). `drop policy` pede esse
-- modo mesmo com `if exists`, e a varredura percorria o catálogo sem `order by`: instalar um
-- módulo com a equipe logada fazia as requisições esperarem o commit e, na inversão de ordem de
-- travas, uma delas morria com `40P01 deadlock detected` (visto 4 vezes no CI, sempre durante
-- `honorarios-instalar-e-pagar`).
--
-- A provisionadora só precisa das travas na tabela que ELA criou. A função nova aplica as três
-- policies `support_write_*` apenas onde `authenticated` pode gravar e as três ainda não existem,
-- em ordem fixa (`oid`), e a proteção de módulo passa a chamá-la. Não muda o resultado da
-- instalação: a tabela nova sai com as mesmas três travas de antes.
--
-- A varredura TOTAL (`fn_aplicar_travas_de_suporte()`) não muda e segue sendo chamada pelo
-- baseline: é ela que CONVERGE uma trava existente mas desatualizada (privilégio que mudou), e
-- isso acontece na atualização do clone, não na instalação de um módulo.
--
-- ⚠️ Duas funções carregam a MESMA forma das três policies (`fn_aplicar_travas_de_suporte` e a nova,
-- além do nome `support_write_*` e do `< 3`). Mudar o conjunto de travas (uma quarta policy, outro
-- predicado) é mudar as duas — senão a instalação de módulo e a atualização do clone divergem.
--
-- Idempotente: `create or replace`; reaplicar não muda nada.

create or replace function public.fn_aplicar_travas_de_suporte_em_tabelas_sem_trava()
returns void
language plpgsql
set search_path = public
as $f$
declare r record; v_col text;
begin
 for r in
   select c.oid, c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and (exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped)
           or c.relname = 'organizations')
      -- tabela só do servidor mantém ZERO policies (contrato mais restritivo): nada a criar
      and (has_table_privilege('authenticated', c.oid, 'insert')
           or has_table_privilege('authenticated', c.oid, 'update')
           or has_table_privilege('authenticated', c.oid, 'delete'))
      -- só quem tem as três travas AUSENTES ou INCOMPLETAS (uma ou duas). Esta consulta lê o catálogo
      -- e não trava tabela alguma;
      -- o `drop policy` do corpo trava, e por isso ele só roda onde há o que criar.
      and (select count(*) from pg_policy p
            where p.polrelid = c.oid
              and p.polname in ('support_write_insert', 'support_write_update', 'support_write_delete')) < 3
    order by c.oid
 loop
   v_col := case when r.relname = 'organizations' then 'id' else 'organization_id' end;
   execute format('drop policy if exists support_write_insert on public.%I', r.relname);
   execute format('create policy support_write_insert on public.%I as restrictive for insert to authenticated with check (public.fn_support_write_allowed(%I))', r.relname, v_col);
   execute format('drop policy if exists support_write_update on public.%I', r.relname);
   execute format('create policy support_write_update on public.%I as restrictive for update to authenticated using (public.fn_support_write_allowed(%I)) with check (public.fn_support_write_allowed(%I))', r.relname, v_col, v_col);
   execute format('drop policy if exists support_write_delete on public.%I', r.relname);
   execute format('create policy support_write_delete on public.%I as restrictive for delete to authenticated using (public.fn_support_write_allowed(%I))', r.relname, v_col);
 end loop;
end $f$;

-- Mesma regra da `fn_aplicar_travas_de_suporte` (só quem aplica o schema a chama; não é `security
-- definer`): EXECUTE sai das duas origens e dos papéis que o default ACL do Supabase alcança.
revoke execute on function public.fn_aplicar_travas_de_suporte_em_tabelas_sem_trava()
  from public, anon, authenticated, service_role;

-- O ponto de entrada que a provisionadora de um módulo chama (ADR-0002, D5). A ORDEM continua a
-- mesma — isolamento primeiro, travas do suporte depois —, mas as travas agora só alcançam o que
-- ainda não as tem, isto é, a tabela que o módulo acabou de criar.
create or replace function public.fn_proteger_modulo_provisionado()
returns void
language plpgsql
set search_path = public
as $f$
begin
  perform public.fn_proteger_tabelas_de_organizacao();
  perform public.fn_aplicar_travas_de_suporte_em_tabelas_sem_trava();
end $f$;

revoke execute on function public.fn_proteger_modulo_provisionado() from public, anon, authenticated, service_role;

-- manifest: **A integração Nuvemshop sai do produto.** Derruba `nuvemshop_products` (e o índice parcial dos webhooks LGPD dela em `webhook_events_log`), apaga o que só ela gravava (pedidos, credencial em `tenant_integrations`, corpo cru de webhook), reclassifica os pedidos LGPD que ela abriu como `api` guardando a origem no payload, fecha os eventos `nuvemshop.*` pendentes e tira `nuvemshop` dos CHECKs de `webhook_events_log`, `tenant_integrations`, `orders` e `lgpd_requests`. A chave de cifra que protege as credenciais de TODAS as integrações, batizada com o nome da loja, passa a se chamar `integrations_oauth_key` (GUC `app.integrations_oauth_key`, linha em `private.app_secrets`, env `INTEGRATIONS_OAUTH_ENCRYPTION_KEY`).
-- remove-do-vocabulario: webhook_events_log_provider_check = nuvemshop | a integração de loja que gravava o corpo cru dos webhooks dela saiu do produto; as linhas que já usavam o valor são apagadas antes do add constraint, senão a atualização de um banco com essas linhas morreria no meio

-- =============================================================================
-- 0533 — remoção da integração Nuvemshop
-- =============================================================================
--
-- O código da integração (OAuth, webhooks de pedido/produto e os três webhooks
-- LGPD da loja, a sincronização do catálogo para o RAG, a tela e o passo do
-- onboarding) saiu na mesma mudança. Esta migration tira do banco o que só ela
-- usava e estreita os vocabulários que a citavam.
--
-- O QUE FICA, de propósito:
--   * `orders` e `tenant_integrations` — conceitos genéricos de e-commerce
--     (`vtex`/`shopify` continuam no vocabulário); só o valor da loja removida sai.
--   * `lgpd_requests` — registro legal. Nenhuma linha é apagada: a que veio da
--     loja vira `source = 'api'` (pedido máquina-a-máquina, o mais próximo do
--     que ela era) e guarda a origem em `request_payload.origem_antes_da_0533`.
--   * `ai_knowledge_sources` — o CHECK de `source_type` já não existe (a 0181
--     abriu o vocabulário). O nome legado da fonte de catálogo da loja é
--     canonizado para `catalogo`, porque o código deixou de aceitá-lo.
--
-- A CHAVE DE CIFRA
--   `private.fn_oauth_key()` lia `app.nuvemshop_oauth_key` / a linha
--   `nuvemshop_oauth_key` — nome herdado da primeira integração que cifrou
--   token, mas a chave protege Agenda Google, canais, plataformas de anúncio,
--   SMTP e webhooks. Ela passa a ler `app.integrations_oauth_key` / a linha
--   `integrations_oauth_key`. A linha existente é RENOMEADA (o valor não muda,
--   então tudo que já foi cifrado continua decifrável). A GUC não se migra por
--   SQL portável (`alter database` exige privilégio que o Supabase cloud nega):
--   quem a usava por GUC precisa setar o nome novo.
--
-- Idempotente: `if exists` em todo drop, filtros de igualdade nos backfills
-- (reaplicar casa 0 linhas), `drop constraint if exists` + `add constraint`.
-- O mesmo conteúdo está no apêndice do `supabase/baseline.sql`; lá o CHECK de
-- `webhook_events_log` mora no BLOCO ÚNICO dele, o da 0534 no fim do arquivo.

-- ---- 1. o catálogo espelhado da loja ----
drop table if exists public.nuvemshop_products cascade;

-- Índice parcial que só servia aos webhooks LGPD da loja
-- (`customer/redact`, `customer/data_request`, `store/redact`).
drop index if exists public.webhook_events_log_lgpd_idx;

-- ---- 2. o arquivo cru dos webhooks ----
delete from public.webhook_events_log where provider = 'nuvemshop';
alter table public.webhook_events_log
  drop constraint if exists webhook_events_log_provider_check;
alter table public.webhook_events_log
  add constraint webhook_events_log_provider_check check (provider in (
    'waha', 'generic', 'meta_cloud', 'zernio', 'datafy'
  ));

-- ---- 3. a credencial da loja ----
delete from public.tenant_integrations where provider = 'nuvemshop';
alter table public.tenant_integrations
  drop constraint if exists tenant_integrations_provider_check;
alter table public.tenant_integrations
  add constraint tenant_integrations_provider_check check (provider in (
    'vtex', 'shopify'
  ));

-- ---- 4. os pedidos espelhados da loja ----
-- `orders` é espelho de loja remota (`external_provider` NOT NULL): sem a
-- integração não há valor honesto para reclassificar a linha. Ninguém a
-- referencia por FK.
delete from public.orders where external_provider = 'nuvemshop';
alter table public.orders
  drop constraint if exists orders_external_provider_check;
alter table public.orders
  add constraint orders_external_provider_check check (external_provider in (
    'vtex', 'shopify'
  ));

-- ---- 5. pedidos LGPD abertos pela loja ----
update public.lgpd_requests
   set source = 'api',
       request_payload = coalesce(request_payload, '{}'::jsonb)
                         || jsonb_build_object('origem_antes_da_0533', 'nuvemshop')
 where source = 'nuvemshop';
alter table public.lgpd_requests
  drop constraint if exists lgpd_requests_source_check;
alter table public.lgpd_requests
  add constraint lgpd_requests_source_check check (source in (
    'manual', 'api', 'support'
  ));

-- ---- 6. o que sobrou em vocabulário aberto ----
update public.ai_knowledge_sources
   set source_type = 'catalogo'
 where source_type = 'nuvemshop_catalog';

update public.organizations
   set onboarding_state = onboarding_state - 'nuvemshop'
 where onboarding_state ? 'nuvemshop';

-- Eventos da loja que ninguém mais consome não são fila: fecham como registro.
update public.event_log
   set status = 'done',
       updated_at = now(),
       last_error = 'superseded: integração de loja removida (migration 0533)'
 where event_type like 'nuvemshop.%'
   and status = 'pending';

comment on column public.organizations.onboarding_state is
  'Wizard state: { welcome?: {accepted_at, timezone, display_name}, whatsapp?: {session_id, status}, ai?: {agent_id}, team?: {invites_sent} }';

comment on table public.catalog_products is
  'O catálogo que a LOJA possui — uma linha por item vendável, com o preço que o agente de IA responde. A loja é a fonte da verdade.';

-- ---- 7. a chave de cifra das integrações ----
update private.app_secrets
   set name = 'integrations_oauth_key',
       updated_at = now()
 where name = 'nuvemshop_oauth_key'
   and not exists (
     select 1 from private.app_secrets where name = 'integrations_oauth_key'
   );

create or replace function private.fn_oauth_key() returns text
    language sql security definer
    set search_path to 'private', 'pg_temp'
    as $$
  select coalesce(
    nullif(current_setting('app.integrations_oauth_key', true), ''),
    (select value from private.app_secrets where name = 'integrations_oauth_key')
  );
$$;
revoke all on function private.fn_oauth_key() from public, anon, authenticated;

create or replace function public.fn_encrypt_oauth(plaintext text) returns bytea
    language plpgsql security definer
    set search_path to 'public', 'private', 'extensions', 'pg_temp'
    as $$
declare
  k text := private.fn_oauth_key();
begin
  if k is null or length(k) < 32 then
    raise exception 'INTEGRATIONS_OAUTH_ENCRYPTION_KEY ausente';
  end if;
  return pgp_sym_encrypt(plaintext, k, 'cipher-algo=aes256');
end$$;
revoke execute on function public.fn_encrypt_oauth(text) from public, anon, authenticated;
grant execute on function public.fn_encrypt_oauth(text) to service_role;

notify pgrst, 'reload schema';

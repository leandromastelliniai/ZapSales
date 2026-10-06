-- manifest: Custo da campanha oficial (issue #10): tabela de preços da Meta por país e categoria na instalação (semente: Brasil em 01/10/2026), custo por mensagem estimado no envio e real pelo pricing do webhook, teto de gasto por campanha e mensal da organização com pausa por motivo, contador das 1.000 de atendimento grátis por número e o relatório de custo.
--
-- ═══ Por que o custo mora numa tabela própria, e não em messages ═══
--
-- O custo tem dois tempos — estimado quando a campanha envia, real quando o
-- webhook de status traz o `pricing` — e é financeiro: precisa sobreviver à
-- mensagem e ser somado por campanha, por organização no mês e por número no
-- mês sem varrer `messages`. O webhook não traz VALOR, só se cobrou e em que
-- categoria; o valor sai da tabela de preços, copiado para a linha no momento.
-- Por isso editar a tabela muda as estimativas seguintes e nunca o histórico.
--
-- ═══ Por que a reserva trava a organização ═══
--
-- O teto é mensal da ORGANIZAÇÃO, e duas campanhas dela (ou o laço do worker e
-- o cron de rede de segurança) podem reservar ao mesmo tempo. Cada um veria a
-- mesma folga e, juntos, passariam do teto. `fn_campanha_reservar_lote_no_teto`
-- toma um advisory lock da transação por organização, recalcula o comprometido
-- e só então reserva — e o reservado (`sending`) já conta como gasto.
--
-- ═══ Colunas da issue #9 ═══
--
-- `campaigns.pausa_motivo`/`pausa_detalhe` também nascem na 0539 (issue #9, em
-- voo). Aqui com `add column if not exists`, e o CHECK com os motivos das duas.

-- ═══ 1. A tabela de preços da Meta, da INSTALAÇÃO ═══
--
-- Uma linha por país e categoria. O prefixo de discagem mora na linha para a
-- tabela responder sozinha de que país é um telefone (o prefixo mais longo
-- vence) — sem um segundo mapa de DDI que divergiria deste. Centavos com quatro
-- casas: o marketing no Brasil custa R$ 0,3217, e inteiro arredondaria cada
-- mensagem. Sem `organization_id`: o preço da Meta é o mesmo para todas as
-- organizações da instalação, e quem edita é o administrador da instalação.
create table if not exists public.meta_pricing_rates (
  id uuid primary key default uuid_generate_v4(),
  country text not null,
  dial_prefix text not null,
  category text not null,
  unit_price_cents numeric(12,4) not null,
  currency text not null default 'BRL',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint meta_pricing_rates_country_check check (country ~ '^[A-Z]{2}$'),
  constraint meta_pricing_rates_dial_prefix_check check (dial_prefix ~ '^[0-9]{1,4}$'),
  constraint meta_pricing_rates_category_check check (category in ('marketing', 'utility', 'authentication', 'service')),
  constraint meta_pricing_rates_price_check check (unit_price_cents >= 0),
  constraint meta_pricing_rates_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint meta_pricing_rates_pais_categoria_uniq unique (country, category)
);

comment on table public.meta_pricing_rates is
  'Preço de UMA mensagem da Meta por país do destinatário e categoria (issue #10). Da instalação, editada em /admin/precos-da-meta. A semente é a tabela do Brasil vigente em 01/10/2026. O custo real de cada mensagem copia o preço do momento para meta_message_costs — editar a tabela muda as estimativas seguintes, nunca o que já foi registrado.';

drop trigger if exists trg_meta_pricing_rates_updated_at on public.meta_pricing_rates;
create trigger trg_meta_pricing_rates_updated_at
  before update on public.meta_pricing_rates
  for each row execute function public.fn_set_updated_at();

-- A semente: só onde a linha não existe — reaplicar não desfaz a edição do painel.
insert into public.meta_pricing_rates (country, dial_prefix, category, unit_price_cents, currency)
values
  ('BR', '55', 'marketing', 32.17, 'BRL'),
  ('BR', '55', 'utility', 3.5, 'BRL'),
  ('BR', '55', 'authentication', 3.5, 'BRL'),
  ('BR', '55', 'service', 3.5, 'BRL')
on conflict (country, category) do nothing;

-- Só o service_role: a tela da instalação lê e grava pelo servidor, que confere
-- o administrador da instalação antes.
alter table public.meta_pricing_rates enable row level security;
revoke all on public.meta_pricing_rates from anon, authenticated;
grant all on public.meta_pricing_rates to service_role;

-- A cotação do dólar para somar o custo de IA (registrado em centavos de dólar
-- em llm_calls) ao custo da Meta (em reais). Nula = a referência do produto
-- (lib/custo/cotacao.ts), editável no mesmo painel.
alter table public.platform_settings
  add column if not exists cotacao_usd_brl numeric(10,4);

alter table public.platform_settings drop constraint if exists platform_settings_cotacao_check;
alter table public.platform_settings
  add constraint platform_settings_cotacao_check check (cotacao_usd_brl is null or cotacao_usd_brl > 0);

-- ═══ 2. O custo de cada mensagem ═══
--
-- Uma linha por mensagem (unique organização + mensagem), em dois tempos:
--   `estimado` — gravada pela rodada da campanha oficial no envio, pela tabela;
--   `webhook`  — o `pricing` do status da Meta chegou: a Meta diz SE cobrou e
--                em que categoria; o preço é o da tabela no momento.
-- O teto conta as duas: o que ainda não teve preço confirmado já está gasto
-- para efeito de orçamento. `cost_cents` nulo = cobrável sem preço na tabela.
-- Sem contato nem telefone, de propósito: a linha é financeira, e o país basta.
create table if not exists public.meta_message_costs (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  channel_session_id uuid references public.channel_sessions(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  origem text not null,
  billable boolean not null default true,
  category text not null,
  pricing_type text,
  country text,
  unit_price_cents numeric(12,4),
  cost_cents numeric(12,4),
  currency text not null default 'BRL',
  janela_gratis_de_anuncio boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_message_costs_origem_check check (origem in ('estimado', 'webhook')),
  constraint meta_message_costs_mensagem_uniq unique (organization_id, message_id)
);

comment on table public.meta_message_costs is
  'Custo da Meta por mensagem (issue #10): estimado no envio da campanha oficial, real quando o pricing do webhook de status chega. Fonte do teto de gasto (campanha e mensal da organização), do contador das 1.000 de atendimento grátis por número e do relatório da campanha.';

create index if not exists idx_meta_message_costs_org_mes
  on public.meta_message_costs (organization_id, created_at);
create index if not exists idx_meta_message_costs_campanha
  on public.meta_message_costs (campaign_id)
  where campaign_id is not null;
create index if not exists idx_meta_message_costs_atendimento
  on public.meta_message_costs (channel_session_id, created_at)
  where category = 'service';

drop trigger if exists trg_meta_message_costs_updated_at on public.meta_message_costs;
create trigger trg_meta_message_costs_updated_at
  before update on public.meta_message_costs
  for each row execute function public.fn_set_updated_at();

alter table public.meta_message_costs enable row level security;
drop policy if exists tenant_isolation_meta_message_costs_all on public.meta_message_costs;
create policy tenant_isolation_meta_message_costs_all on public.meta_message_costs
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );
revoke all on public.meta_message_costs from anon, authenticated;
grant select on public.meta_message_costs to authenticated;
grant all on public.meta_message_costs to service_role;

-- ═══ 3. O teto da campanha e a pausa com motivo ═══
--
-- `pausa_motivo`/`pausa_detalhe` são as mesmas colunas da issue #9 (migration
-- 0539, em voo): mesma forma, mesma semântica — nulo = pausa manual ou nenhuma.
-- A lista do CHECK leva os motivos das duas issues, para nenhuma das duas, ao
-- entrar por último, apagar o vocabulário da outra.
alter table public.campaigns
  add column if not exists teto_gasto_cents numeric(12,4),
  add column if not exists pausa_motivo text,
  add column if not exists pausa_detalhe text;

alter table public.campaigns drop constraint if exists campaigns_teto_gasto_check;
alter table public.campaigns
  add constraint campaigns_teto_gasto_check check (teto_gasto_cents is null or teto_gasto_cents > 0);

update public.campaigns set pausa_motivo = null
 where pausa_motivo is not null
   and pausa_motivo not in ('qualidade_vermelha', 'modelo_rejeitado', 'modelo_pausado',
                            'modelo_desativado', 'modelo_recategorizado', 'risco_nao_aceito', 'teto_de_gasto');
alter table public.campaigns drop constraint if exists campaigns_pausa_motivo_check;
alter table public.campaigns
  add constraint campaigns_pausa_motivo_check check (
    pausa_motivo is null or pausa_motivo in (
      'qualidade_vermelha', 'modelo_rejeitado', 'modelo_pausado',
      'modelo_desativado', 'modelo_recategorizado', 'risco_nao_aceito', 'teto_de_gasto'
    )
  );

comment on column public.campaigns.teto_gasto_cents is
  'Teto de gasto da Meta desta campanha, em centavos (issue #10). Nulo = sem teto próprio (o mensal da organização, em settings.campanhas.teto_gasto_mensal_cents, continua valendo). Atingido, a rodada pausa com pausa_motivo = teto_de_gasto.';

-- ═══ 4. O comprometido: o que conta contra o teto ═══
--
-- Custo registrado (real ou estimado; desconhecido conta pelo preço de
-- referência) MAIS quem está reservado e ainda não saiu (`sending`), também pelo
-- preço de referência. Reservar já é gastar para efeito de orçamento: é isso que
-- impede dois lotes em voo de, somados, passarem do teto.
create or replace function public.fn_custo_comprometido(
  p_org uuid,
  p_campaign uuid,
  p_desde timestamptz,
  p_preco numeric
)
returns table (da_campanha numeric, da_organizacao numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    coalesce((select sum(coalesce(m.cost_cents, p_preco))
                from public.meta_message_costs m
               where m.organization_id = p_org and m.campaign_id = p_campaign), 0)
    + p_preco * (select count(*)
                   from public.campaign_recipients r
                  where r.organization_id = p_org and r.campaign_id = p_campaign
                    and r.status = 'sending'),
    coalesce((select sum(coalesce(m.cost_cents, p_preco))
                from public.meta_message_costs m
               where m.organization_id = p_org and m.created_at >= p_desde), 0)
    + p_preco * (select count(*)
                   from public.campaign_recipients r
                   join public.campaigns c on c.id = r.campaign_id
                  where r.organization_id = p_org and r.status = 'sending'
                    and c.meta_template_id is not null);
$$;

comment on function public.fn_custo_comprometido(uuid, uuid, timestamptz, numeric) is
  'Issue #10: quanto já conta contra o teto — da campanha e da organização desde p_desde (início do mês no fuso da organização). Custo registrado + reservados em voo, os dois pelo preço de referência quando não há preço.';

revoke execute on function public.fn_custo_comprometido(uuid, uuid, timestamptz, numeric) from public, anon, authenticated;
grant execute on function public.fn_custo_comprometido(uuid, uuid, timestamptz, numeric) to service_role;

-- A reserva da campanha oficial COM teto: trava a organização (advisory lock da
-- transação), recalcula o comprometido e só então reserva o que cabe. Sem a
-- trava, o laço do worker e o cron de rede de segurança veriam a mesma folga ao
-- mesmo tempo e, juntos, reservariam o dobro.
create or replace function public.fn_campanha_reservar_lote_no_teto(
  p_campaign_id uuid,
  p_limite integer,
  p_agora timestamptz,
  p_preco numeric,
  p_teto_campanha numeric,
  p_teto_organizacao numeric,
  p_inicio_do_mes timestamptz
)
returns table (
  id uuid,
  contact_id uuid,
  recipient_address text,
  attempt_count integer,
  variables jsonb,
  rendered_body text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_campanha numeric;
  v_organizacao numeric;
  v_cabem integer := greatest(p_limite, 0);
begin
  select c.organization_id into v_org from public.campaigns c where c.id = p_campaign_id;
  if v_org is null then
    return;
  end if;
  if p_preco > 0 and (p_teto_campanha is not null or p_teto_organizacao is not null) then
    perform pg_advisory_xact_lock(hashtextextended('custo-meta:' || v_org::text, 0));
    select t.da_campanha, t.da_organizacao into v_campanha, v_organizacao
      from public.fn_custo_comprometido(v_org, p_campaign_id, p_inicio_do_mes, p_preco) t;
    if p_teto_campanha is not null then
      v_cabem := least(v_cabem, greatest(0, floor((p_teto_campanha - v_campanha) / p_preco + 0.000001))::integer);
    end if;
    if p_teto_organizacao is not null then
      v_cabem := least(v_cabem, greatest(0, floor((p_teto_organizacao - v_organizacao) / p_preco + 0.000001))::integer);
    end if;
  end if;
  return query select * from public.fn_campanha_reservar_lote(p_campaign_id, v_cabem, p_agora);
end
$$;

comment on function public.fn_campanha_reservar_lote_no_teto(uuid, integer, timestamptz, numeric, numeric, numeric, timestamptz) is
  'Issue #10: fn_campanha_reservar_lote limitada pelos tetos de gasto, com a organização travada durante a conta. Sem teto (ou sem preço), reserva como a original.';

revoke execute on function public.fn_campanha_reservar_lote_no_teto(uuid, integer, timestamptz, numeric, numeric, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_campanha_reservar_lote_no_teto(uuid, integer, timestamptz, numeric, numeric, numeric, timestamptz) to service_role;

-- ═══ 5. O relatório de custo da campanha ═══
--
-- Custo da Meta (registrado), custo de IA (llm_calls, em centavos de DÓLAR, do
-- contato do destinatário entre o envio e o fim da janela de atribuição de
-- resposta) e as conversas que vieram de anúncio Click-to-WhatsApp (janela
-- grátis). Quem divide e converte é o TypeScript (lib/custo/relatorio.ts).
create or replace function public.fn_custo_da_campanha(
  p_org uuid,
  p_campaign uuid,
  p_janela_horas integer
)
returns table (
  meta_cents numeric,
  meta_estimado_cents numeric,
  mensagens_com_custo bigint,
  mensagens_sem_preco bigint,
  conversas_de_anuncio bigint,
  ia_usd_cents numeric,
  responderam bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    coalesce((select sum(m.cost_cents) from public.meta_message_costs m
               where m.organization_id = p_org and m.campaign_id = p_campaign), 0),
    coalesce((select sum(m.cost_cents) from public.meta_message_costs m
               where m.organization_id = p_org and m.campaign_id = p_campaign
                 and m.origem = 'estimado'), 0),
    (select count(*) from public.meta_message_costs m
      where m.organization_id = p_org and m.campaign_id = p_campaign),
    (select count(*) from public.meta_message_costs m
      where m.organization_id = p_org and m.campaign_id = p_campaign and m.cost_cents is null),
    (select count(*) from public.meta_message_costs m
      where m.organization_id = p_org and m.campaign_id = p_campaign and m.janela_gratis_de_anuncio),
    coalesce((select sum(l.cost_cents)
                from public.campaign_recipients r
                join public.llm_calls l
                  on l.organization_id = r.organization_id
                 and l.contact_id = r.contact_id
                 and l.created_at >= r.sent_at
                 and l.created_at < r.sent_at + make_interval(hours => p_janela_horas)
               where r.organization_id = p_org and r.campaign_id = p_campaign
                 and r.sent_at is not null), 0),
    (select count(*) from public.campaign_recipients r
      where r.organization_id = p_org and r.campaign_id = p_campaign and r.replied_at is not null);
$$;

comment on function public.fn_custo_da_campanha(uuid, uuid, integer) is
  'Issue #10: os números do relatório de custo da campanha — Meta (registrado e a parte ainda estimada), IA em centavos de dólar dentro da janela de atribuição, conversas de anúncio (janela grátis) e quem respondeu.';

revoke execute on function public.fn_custo_da_campanha(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.fn_custo_da_campanha(uuid, uuid, integer) to service_role;

notify pgrst, 'reload schema';

-- ═══ 6. O aviso das 1.000 grátis na Central ═══
-- A lista inteira, como manda o bloco único do baseline (kind-check-migration-x-baseline).
alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;

alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    'appointment_outcome_required',
    'appointment_recovery_review',
    'qr_rescan',
    'routing_unassigned',
    'job_dead',
    'event_dead',
    'budget_exceeded',
    'handoff',
    'promotion_review',
    'judge_unaligned',
    'followup_dead',
    'snooze_expired',
    'next_action_ambiguous',
    'risk_backlog_seeded',
    'reactivation_expired',
    'capabilities_missing',
    'message_send_stuck',
    'midia_nao_lida',
    'channel_template_review',
    'channel_number_alert',
    'promise_unfulfilled',
    'contact_proposal_expired',
    'budget_warning',
    'conhecimento_nao_indexado',
    'voice_call_missed',
    'case_stale',
    'aviso_de_caso_nao_entregue',
    'followup_sem_agente',
    'canal_mudo_sem_numero',
    'proposal_expired_notice',
    'proposal_acceptance_rate_drop',
    'proposal_promised_not_created',
    'proposta_travada',
    'proposta_pronta_para_revisao',
    'org_reativada',
    'jev_pedido_de_humano',
    'jev_parar_de_receber',
    'atendimento_gratis_do_numero',
    'other'
  ));

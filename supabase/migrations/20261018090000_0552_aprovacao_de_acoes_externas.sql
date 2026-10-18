-- manifest: **Aprovação de ações externas do agente (issue #95, parte da #86).** A ferramenta externa pode ALTERAR algo no outro sistema: chave `require_approval` (nula = padrão do efeito, altera pede) e `approval_ttl_hours` em `agent_external_tools`, a trava «altera só inativa» sai, tabela `agent_external_tool_requests` (o pedido de execução: pendente → executando → executada/falha/recusada/expirada, server-side only, uma execução por pedido) e o aviso `external_tool_approval` na Central.
-- 0552 — Aprovação das ações externas do agente.
--
-- A #94 deixou o agente CONSULTAR um sistema externo. Esta etapa deixa-o AGIR (criar
-- pedido, cadastrar em outro sistema) com a proteção de que NADA altera o mundo sem
-- aprovação por padrão.
--
--   * `agent_external_tools.require_approval` — a chave «pedir aprovação». NULA = a
--     pessoa nunca mexeu: vale o padrão do efeito (altera pede, consulta não). O padrão
--     seguro mora no NULL e não num `default`: uma linha escrita por fora da tela, sem a
--     chave, continua pedindo aprovação quando altera. `true`/`false` é decisão explícita
--     de quem cadastra.
--   * `agent_external_tools.approval_ttl_hours` — quanto o pedido espera por um humano
--     (padrão 24 h, de 1 a 168).
--   * A trava `agent_external_tools_altera_so_inativa` (0551) SAI: era o chão provisório
--     «altera só existe inativa» que esta etapa existe para retirar. Linhas existentes
--     não mudam (nenhuma altera ativa pôde existir).
--   * `agent_external_tool_requests` — o PEDIDO de execução. É o que a Central mostra
--     («o que o agente quer executar e os dados»), o que um humano aprova ou recusa, e o
--     que impede o segundo efeito:
--       - `pending → executing` é um UPDATE condicional (`where status = 'pending'`): só
--         UM clique, UMA repetição do modelo ou UMA rodada vence; os outros leem 0 linhas.
--         É a «execução única por pedido».
--       - o índice único parcial reconhece a MESMA chamada (organização, ferramenta,
--         conversa, impressão digital dos dados) enquanto ela está viva: o modelo que
--         repete a chamada reencontra o pedido em vez de abrir outro.
--       - `uncertain` registra que a chamada falhou e o outro sistema PODE ter feito:
--         uma ação que altera não é repetida sozinha nesse caso.
--     Server-side only como `agent_external_tools`: RLS ligada, zero policies, grants
--     revogados de anon/authenticated. Quem lê e escreve é o servidor, com o filtro de
--     organização à mão. Os dados que o agente preencheu ficam em `arguments` (a execução
--     precisa deles); a Central e a auditoria mostram só um RESUMO sem segredos.
--   * `agent_inbox_items.kind = 'external_tool_approval'` — o item na Central com os
--     botões de aprovar e recusar.
--
-- Função NOVA em `public`: nenhuma ⇒ o item 9 da doutrina de migrations não é acionado.
-- Sem FK para `contacts` (só para a conversa, `on delete set null`): a tabela não entra
-- na varredura de LGPD de «quem guarda pessoa». ⚠️ Isso NÃO quer dizer que ela não guarde dado
-- pessoal: `arguments` leva o que o agente preencheu (nome, telefone…) e `outcome_content` o que o outro
-- sistema devolveu. A cascata de anonimização do contato não os alcança; o que os alcança é a PODA
-- de 90 dias do cron `external-tool-requests-expiry` (marca `data_pruned_at`), e a auditoria só
-- recebe um resumo com campos sensíveis mascarados.

alter table public.agent_external_tools
  add column if not exists require_approval boolean,
  add column if not exists approval_ttl_hours integer not null default 24;

alter table public.agent_external_tools
  drop constraint if exists agent_external_tools_altera_so_inativa;

alter table public.agent_external_tools
  drop constraint if exists agent_external_tools_ttl_check;
alter table public.agent_external_tools
  add constraint agent_external_tools_ttl_check check (approval_ttl_hours between 1 and 168);

comment on column public.agent_external_tools.effect is
  'consulta = só lê. altera = muda algo no outro sistema; nunca é repetida sozinha e, por padrão, espera aprovação (require_approval).';
comment on column public.agent_external_tools.require_approval is
  'A chave «pedir aprovação». NULL = padrão do efeito (altera pede, consulta não). true/false = decisão explícita de quem cadastra. No modo Assistido toda ferramenta espera, qualquer que seja o valor.';
comment on column public.agent_external_tools.approval_ttl_hours is
  'Horas que um pedido desta ferramenta espera por um humano antes de expirar (1 a 168; padrão 24).';

create table if not exists public.agent_external_tool_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tool_id uuid not null references public.agent_external_tools(id) on delete cascade,
  agent_id uuid,
  conversation_id uuid references public.conversations(id) on delete set null,
  -- Onde o pedido nasceu: um turno de atendimento ao vivo ou um rascunho do modo Assistido.
  origin text not null default 'live',
  status text not null default 'pending',
  -- Os dados que o agente preencheu, JÁ validados contra o esquema da ferramenta.
  arguments jsonb not null default '{}'::jsonb,
  -- Impressão digital canônica dos dados (sha256): reconhece a mesma chamada repetida.
  arguments_hash text not null,
  -- A chamada falhou e o outro sistema pode ter feito a alteração (prazo, rede, 5xx).
  uncertain boolean not null default false,
  inbox_item_id uuid references public.agent_inbox_items(id) on delete set null,
  expires_at timestamptz not null,
  decided_by uuid,
  decided_at timestamptz,
  executed_at timestamptz,
  outcome_http_status integer,
  outcome_reason text,
  -- O que o outro sistema devolveu numa execução bem-sucedida (até 4.000 caracteres): é com isto
  -- que o agente lê o resultado de uma ação aprovada, quando repete a chamada — como DADO NÃO
  -- CONFIÁVEL, no canal de resultado de ferramenta, nunca no prompt.
  outcome_content text,
  -- Quando os DADOS (arguments, outcome_content) foram apagados pela poda de 90 dias (LGPD). A linha,
  -- o estado e o desfecho ficam.
  data_pruned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_external_tool_requests_content_len check (outcome_content is null or char_length(outcome_content) <= 4000),
  constraint agent_external_tool_requests_origin_check check (origin in ('live', 'assisted')),
  constraint agent_external_tool_requests_status_check
    check (status in ('pending', 'executing', 'executed', 'failed', 'rejected', 'expired')),
  constraint agent_external_tool_requests_arguments_check check (jsonb_typeof(arguments) = 'object'),
  constraint agent_external_tool_requests_hash_check check (char_length(arguments_hash) = 64)
);

-- A MESMA chamada, viva, uma vez só: enquanto está pendente ou executando, o modelo que a
-- repete (ou dois turnos concorrentes) reencontra o pedido. A conversa nula conta como um
-- valor só (turno sem conversa).
create unique index if not exists agent_external_tool_requests_viva_uk
  on public.agent_external_tool_requests (
    organization_id, tool_id, coalesce(conversation_id, '00000000-0000-0000-0000-000000000000'::uuid), arguments_hash
  )
  where status in ('pending', 'executing');

-- O cron de expiração e a Central leem os pendentes por prazo.
create index if not exists agent_external_tool_requests_pendentes_idx
  on public.agent_external_tool_requests (expires_at)
  where status = 'pending';

-- O bloco «pedidos desta conversa» que o agente lê no turno.
create index if not exists agent_external_tool_requests_conversa_idx
  on public.agent_external_tool_requests (organization_id, conversation_id, created_at desc);

comment on table public.agent_external_tool_requests is
  'Pedido de execução de uma ferramenta externa do agente (issue #95): o que o agente quer executar, com os dados, e o desfecho. pending → executing (UPDATE condicional = execução única) → executed/failed; ou rejected/expired. Server-side only: RLS ligada sem policies e grants revogados de anon/authenticated.';
comment on column public.agent_external_tool_requests.uncertain is
  'A chamada falhou e o outro sistema PODE ter feito a alteração (prazo, rede, 5xx). Ação que altera não é repetida sozinha nesse caso.';
comment on column public.agent_external_tool_requests.outcome_content is
  'O que o outro sistema devolveu numa execução bem-sucedida (até 4.000 caracteres). Volta ao agente como dado não confiável quando ele repete a chamada.';
comment on column public.agent_external_tool_requests.arguments is
  'Os dados que o agente preencheu (a execução precisa deles). A Central e a auditoria mostram só um resumo sem segredos.';

alter table public.agent_external_tool_requests enable row level security;
revoke all on public.agent_external_tool_requests from anon, authenticated;
grant select, insert, update, delete on public.agent_external_tool_requests to service_role;

drop trigger if exists trg_agent_external_tool_requests_updated_at on public.agent_external_tool_requests;
create trigger trg_agent_external_tool_requests_updated_at
  before update on public.agent_external_tool_requests
  for each row execute function public.fn_set_updated_at();

-- ─── O aviso do pedido na Central ───────────────────────────────────────────
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
    'external_tool_failed',
    'external_tool_approval',
    'other'
  ));

notify pgrst, 'reload schema';

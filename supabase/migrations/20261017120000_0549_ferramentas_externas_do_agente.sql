-- manifest: **Ferramentas externas do agente — webhook de consulta (issue #94, parte da #86).** Tabela `agent_external_tools` (o webhook que o agente chama no meio da conversa: nome, "quando usar", endereço, campos a preencher, "só consulta"/"altera dados" e a chave de assinatura cifrada, server-side only como a 0548), coluna `ai_agent_versions.external_tool_ids` (quais ferramentas cada versão do agente pode chamar, coberta pela trava de imutabilidade) e o aviso `external_tool_failed` na Central. "Altera dados" só existe inativo: a trava de aprovação é de outra etapa.
-- 0549 — Ferramentas externas do agente (webhook de CONSULTA).
--
-- O agente passa a poder chamar um webhook durante a conversa para consultar
-- algo em outro sistema (estoque, planilha, ERP, Make, n8n). Esta migration dá o
-- chão de dados; o recurso nasce sem nenhuma ferramenta cadastrada, e a
-- instalação inteira segue útil sem ele.
--
--   * `agent_external_tools` — o cadastro, por organização. Server-side only
--     (RLS ligada, zero policies, grants revogados de anon/authenticated): a linha
--     carrega a chave de assinatura (cifrada por `fn_encrypt_oauth`, não é hash
--     porque precisa ser USADA a cada chamada) e quem lê é o servidor, com o
--     filtro de organização à mão. A tela vê só os 4 últimos caracteres.
--   * `ai_agent_versions.external_tool_ids` — quais ferramentas externas ESTA
--     versão do agente pode chamar. É dado da VERSÃO (rascunho, diff, histórico,
--     desfazer), então a trava de imutabilidade passa a cobri-lo. Mesmo desenho
--     de `knowledge_source_ids` (0181). O teto de 27 capacidades por agente soma
--     `tool_ids` e este vetor (validado no servidor e na tela).
--   * `agent_inbox_items.kind = 'external_tool_failed'` — a falha de uma chamada
--     aparece na Central, nunca em silêncio (laço de retorno da #86).
--
-- "Altera dados": o vocabulário do efeito já tem os dois valores, mas a linha só
-- pode existir INATIVA — a ferramenta que muda algo no outro sistema depende da
-- etapa de aprovação, e esta etapa é só de consulta. O CHECK abaixo é a terceira
-- trava (as outras duas são a rota e o motor do turno); a etapa da aprovação o
-- remove numa migration própria.
--
-- Função NOVA em `public`: nenhuma (só um `create or replace` de função que já
-- existia, `fn_ai_agent_version_content_immutable`, preservando
-- `set search_path = ''`) ⇒ o item 9 da doutrina de migrations não é acionado.

create table if not exists public.agent_external_tools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- O que a pessoa lê e escreve.
  name text not null,
  -- O identificador que o MODELO usa (`ext_<slug>`); derivado do nome, único por
  -- organização, e nunca digitado pela pessoa.
  slug text not null,
  when_to_use text not null,
  url text not null,
  -- [{ nome, tipo, descricao, obrigatorio }] — o esquema dos dados que o agente
  -- preenche. Lido por um Zod central (`lib/ai/ferramentas-externas/esquema.ts`).
  parameters jsonb not null default '[]'::jsonb,
  effect text not null default 'consulta',
  active boolean not null default true,
  signing_secret_encrypted bytea not null,
  -- Para a tela reconhecer QUAL chave está gravada sem ver a chave.
  signing_secret_last4 text not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_external_tools_effect_check check (effect in ('consulta', 'altera')),
  constraint agent_external_tools_altera_so_inativa check (effect = 'consulta' or active = false),
  constraint agent_external_tools_slug_check check (slug ~ '^[a-z][a-z0-9_]{0,35}$'),
  constraint agent_external_tools_name_len check (char_length(name) between 3 and 60),
  constraint agent_external_tools_when_len check (char_length(when_to_use) between 10 and 600),
  constraint agent_external_tools_url_len check (char_length(url) between 8 and 2000),
  constraint agent_external_tools_parameters_check
    check (jsonb_typeof(parameters) = 'array' and jsonb_array_length(parameters) <= 10)
);

-- Um identificador por organização: o modelo chama pelo nome, e dois iguais
-- tornariam a chamada ambígua.
create unique index if not exists agent_external_tools_org_slug_uk
  on public.agent_external_tools (organization_id, slug);

comment on table public.agent_external_tools is
  'Ferramenta externa do agente (issue #94): um webhook de CONSULTA que o agente chama no meio da conversa. Por organização. Server-side only: RLS ligada sem policies e grants revogados de anon/authenticated; a chave de assinatura nunca volta ao browser.';
comment on column public.agent_external_tools.slug is
  'O identificador que o modelo vê (ext_<slug>). Derivado do nome, único por organização.';
comment on column public.agent_external_tools.signing_secret_encrypted is
  'Cifrado por fn_encrypt_oauth (pgp_sym/aes256), a mesma cifra de channel_sessions, ad_platform_connections, map_provider_credentials e voice_provider_credentials. Assina cada chamada (HMAC-SHA256) para o sistema receptor verificar.';
comment on column public.agent_external_tools.effect is
  'consulta = só lê (roda sem aprovação, pode ter nova tentativa). altera = muda algo no outro sistema: só pode existir inativa nesta etapa (check agent_external_tools_altera_so_inativa).';

alter table public.agent_external_tools enable row level security;
revoke all on public.agent_external_tools from anon, authenticated;
grant select, insert, update, delete on public.agent_external_tools to service_role;

drop trigger if exists trg_agent_external_tools_updated_at on public.agent_external_tools;
create trigger trg_agent_external_tools_updated_at
  before update on public.agent_external_tools
  for each row execute function public.fn_set_updated_at();

-- ─── Por agente (dado da versão) ────────────────────────────────────────────

alter table public.ai_agent_versions
  add column if not exists external_tool_ids uuid[] not null default '{}';

comment on column public.ai_agent_versions.external_tool_ids is
  'Ferramentas externas (agent_external_tools) que esta versão do agente pode chamar. Vazio = nenhuma. Soma com tool_ids no teto de 27 capacidades por agente. Quem confere que a ferramenta existe e é desta organização é o servidor (sem FK: array).';

-- ─── A trava de imutabilidade passa a cobrir a coluna nova ──────────────────
-- Corpo idêntico ao da 0548 (resposta em áudio), mais `external_tool_ids`. O
-- invariante `tests/unit/trigger-imutavel-cobre-todas-as-colunas-de-conteudo.test.ts`
-- compara a ÚLTIMA definição que vale contra o conjunto de conteúdo.

create or replace function fn_ai_agent_version_content_immutable() returns trigger
-- search_path fixo na PRÓPRIA definição: um create or replace sem a cláusula
-- apaga o alter function ... set search_path da 0521 (invariante
-- tests/invariants/avisos-do-security-advisor.test.ts).
language plpgsql set search_path = '' as $fn$
begin
  if old.status <> 'draft' and (
       new.system_prompt          is distinct from old.system_prompt
    or new.provider               is distinct from old.provider
    or new.model                  is distinct from old.model
    or new.credential_id          is distinct from old.credential_id
    or new.tool_ids               is distinct from old.tool_ids
    or new.trigger_config         is distinct from old.trigger_config
    or new.channel_session_id     is distinct from old.channel_session_id
    or new.max_steps              is distinct from old.max_steps
    or new.token_budget           is distinct from old.token_budget
    or new.cost_budget_cents      is distinct from old.cost_budget_cents
    or new.history_message_window is distinct from old.history_message_window
    or new.history_token_window   is distinct from old.history_token_window
    or new.handoff_keywords       is distinct from old.handoff_keywords
    or new.handoff_tool_enabled   is distinct from old.handoff_tool_enabled
    or new.followup               is distinct from old.followup
    or new.multimodal_input       is distinct from old.multimodal_input
    or new.video_frames_enabled   is distinct from old.video_frames_enabled
    or new.split_messages         is distinct from old.split_messages
    or new.split_max_chars        is distinct from old.split_max_chars
    or new.cases_enabled          is distinct from old.cases_enabled
    or new.operator_enabled       is distinct from old.operator_enabled
    or new.operator_model         is distinct from old.operator_model
    or new.operator_tool_ids      is distinct from old.operator_tool_ids
    or new.pipeline_ids           is distinct from old.pipeline_ids
    or new.knowledge_source_ids   is distinct from old.knowledge_source_ids
    or new.external_tool_ids      is distinct from old.external_tool_ids
    or new.proposal_ai_draft_enabled is distinct from old.proposal_ai_draft_enabled
    or new.inbound_debounce_ms    is distinct from old.inbound_debounce_ms
    or new.audio_reply_enabled    is distinct from old.audio_reply_enabled
    or new.audio_reply_voice_id   is distinct from old.audio_reply_voice_id
    or new.audio_reply_model_id   is distinct from old.audio_reply_model_id
    or new.profile_persona        is distinct from old.profile_persona
    or new.profile_tone           is distinct from old.profile_tone
    or new.profile_objective      is distinct from old.profile_objective
    or new.profile_welcome        is distinct from old.profile_welcome
    or new.profile_language       is distinct from old.profile_language
    or new.temperature            is distinct from old.temperature
    or new.version_number         is distinct from old.version_number
    or new.agent_id               is distinct from old.agent_id
    or new.organization_id        is distinct from old.organization_id
  ) then
    raise exception 'ai_agent_versions % é imutável (status=%): mudança de conteúdo = versão draft nova; rollback = revert (clona + publica)',
      old.id, old.status;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_ai_agent_versions_content_immutable on public.ai_agent_versions;
create trigger trg_ai_agent_versions_content_immutable
  before update on public.ai_agent_versions
  for each row execute function fn_ai_agent_version_content_immutable();

-- ─── O aviso da falha na Central ────────────────────────────────────────────
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
    'other'
  ));

notify pgrst, 'reload schema';

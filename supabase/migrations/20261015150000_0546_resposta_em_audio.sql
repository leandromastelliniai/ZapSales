-- manifest: **Resposta em áudio (issue #91, parte da #86).** Tabela `voice_provider_credentials` (a chave de voz da organização, cifrada, server-side only como a 0504) e três colunas em `ai_agent_versions` — `audio_reply_enabled` (desligada por padrão), `audio_reply_voice_id` e `audio_reply_model_id` — cobertas pela trava de imutabilidade da versão publicada. O interruptor da organização mora em `organizations.settings.resposta_em_audio` (Zod, sem migration). Opcional: sem chave e sem agente ligado, nada muda.
-- 0546 — Resposta em ÁUDIO: a chave de voz da organização e a opção por agente.
--
-- O agente já ENTENDE o áudio do cliente (transcrição) e nunca respondia em
-- áudio. Esta migration dá o chão de dados do recurso, que nasce DESLIGADO:
--
--   * `voice_provider_credentials` — a chave do provedor de voz da organização
--     (compatível com a API de fala da OpenAI, ou ElevenLabs). Server-side only,
--     como `map_provider_credentials` (0504) e `ad_insights_connections` (0214):
--     RLS ligada, zero policies, grants revogados de anon/authenticated, chave
--     cifrada por `fn_encrypt_oauth`, e a tela vê só os 4 últimos caracteres.
--   * `ai_agent_versions.audio_reply_*` — por agente: "responder em áudio quando
--     o cliente mandar áudio" (padrão desligado) e a voz/modelo escolhidos entre
--     os que a chave do cliente devolve. É dado da VERSÃO (rascunho, diff,
--     histórico, desfazer), então a trava de imutabilidade passa a cobri-lo.
--
-- O interruptor da ORGANIZAÇÃO (ligado + provedor + aceite do administrador)
-- fica em `organizations.settings.resposta_em_audio`, lido por um Zod central
-- que falha DESLIGADO — o mesmo desenho do Jev. Por isso não há coluna aqui.
--
-- Função: só um `create or replace` de função que já existia
-- (`fn_ai_agent_version_content_immutable`), preservando `set search_path = ''`.
-- Nenhuma função NOVA em `public` ⇒ o item 9 da doutrina de migrations não é
-- acionado por este arquivo.

create table if not exists public.voice_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  api_key_encrypted bytea not null,
  -- Para a tela reconhecer QUAL chave está gravada sem ver a chave.
  api_key_last4 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint voice_provider_credentials_provider_conhecido
    check (provider in ('openai_compativel', 'elevenlabs'))
);

-- Uma chave por provedor por organização: trocar é gravar de novo (upsert).
create unique index if not exists voice_provider_credentials_org_provider_uk
  on public.voice_provider_credentials (organization_id, provider);

comment on table public.voice_provider_credentials is
  'Chave de voz da organização (resposta em áudio do agente): provedor compatível com a API de fala da OpenAI, ou ElevenLabs. Opcional. Server-side only: RLS ligada sem policies e grants revogados de anon/authenticated. A chave nunca volta ao browser.';
comment on column public.voice_provider_credentials.api_key_encrypted is
  'Cifrado por fn_encrypt_oauth (pgp_sym/aes256), a mesma cifra de channel_sessions, ad_platform_connections e map_provider_credentials.';

alter table public.voice_provider_credentials enable row level security;
revoke all on public.voice_provider_credentials from anon, authenticated;
grant select, insert, update, delete on public.voice_provider_credentials to service_role;

drop trigger if exists trg_voice_provider_credentials_updated_at on public.voice_provider_credentials;
create trigger trg_voice_provider_credentials_updated_at
  before update on public.voice_provider_credentials
  for each row execute function public.fn_set_updated_at();

-- ─── Por agente ─────────────────────────────────────────────────────────────

alter table public.ai_agent_versions
  add column if not exists audio_reply_enabled boolean not null default false,
  add column if not exists audio_reply_voice_id text,
  add column if not exists audio_reply_model_id text;

alter table public.ai_agent_versions drop constraint if exists ai_agent_versions_audio_reply_voice_len;
alter table public.ai_agent_versions
  add constraint ai_agent_versions_audio_reply_voice_len
  check (audio_reply_voice_id is null or char_length(audio_reply_voice_id) between 1 and 120);

alter table public.ai_agent_versions drop constraint if exists ai_agent_versions_audio_reply_model_len;
alter table public.ai_agent_versions
  add constraint ai_agent_versions_audio_reply_model_len
  check (audio_reply_model_id is null or char_length(audio_reply_model_id) between 1 and 120);

comment on column public.ai_agent_versions.audio_reply_enabled is
  'Responder em áudio (nota de voz) quando o cliente mandar áudio. Padrão desligado. Só vale com o interruptor da organização ligado (organizations.settings.resposta_em_audio) e uma chave de voz gravada. O texto da resposta é sempre gravado na conversa; falha de voz cai em texto.';
comment on column public.ai_agent_versions.audio_reply_voice_id is
  'A voz do agente, escolhida na lista que o provedor devolve para a chave da organização (ElevenLabs). Nulo = a voz padrão da organização.';
comment on column public.ai_agent_versions.audio_reply_model_id is
  'O modelo de voz do agente (ex.: o modelo multilíngue da ElevenLabs). Nulo = o modelo padrão da organização.';

-- ─── A trava de imutabilidade passa a cobrir as colunas novas ───────────────
-- Corpo idêntico ao da 0503, mais as três colunas de áudio. O invariante
-- `tests/unit/trigger-imutavel-cobre-todas-as-colunas-de-conteudo.test.ts`
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
    or new.proposal_ai_draft_enabled is distinct from old.proposal_ai_draft_enabled
    or new.inbound_debounce_ms    is distinct from old.inbound_debounce_ms
    or new.audio_reply_enabled    is distinct from old.audio_reply_enabled
    or new.audio_reply_voice_id   is distinct from old.audio_reply_voice_id
    or new.audio_reply_model_id   is distinct from old.audio_reply_model_id
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

notify pgrst, 'reload schema';

-- manifest: restringir temas por agente (#92) — chave `restrict_topics`, lista `allowed_topics` e resposta `off_topic_reply` viram colunas da versão publicável, cobertas pela trava de imutabilidade; desligada por padrão e sem backfill
-- ═══ Restringir temas do agente (0549, issue #92) ═══
--
-- Uma chave por agente com a lista de assuntos permitidos e a resposta padrão para
-- o que está fora. É dado da VERSÃO — rascunho, diff, histórico e desfazer valem
-- para ela como valem para o prompt e para o perfil guiado (0546) — e o que o
-- modelo recebe é a composição (lib/ai/agents/perfil.ts, `comporInstrucoes`).
--
-- Não cria uma 12ª conferência antes do envio e não altera nenhuma das 11: a
-- restrição é instrução ao modelo, aplicada na composição. O pedido de atendente
-- humano e o opt-out são declarados exceção ali, e seguem tendo os seus caminhos.
--
-- ADITIVA E SEM BACKFILL, de propósito: a chave nasce `false`, a lista nasce
-- vazia e a resposta nasce NULL. Agente existente recebe exatamente o que
-- recebia até alguém editá-lo — nenhuma linha antiga é tocada, então não há dado
-- a corrigir antes das constraints.
--
-- Colunas e não um jsonb: a UI e o diff leriam path de jsonb direto sem schema
-- central (anti-pattern 6), e os vizinhos da versão já são colunas tipadas.
-- Nenhuma função NOVA em `public` (só o `create or replace` de uma que já
-- existia), então o item 9 da doutrina de migrations não é acionado.

alter table public.ai_agent_versions
  add column if not exists restrict_topics boolean not null default false,
  add column if not exists allowed_topics  text[]  not null default '{}',
  add column if not exists off_topic_reply text;

-- Os tetos vivem em lib/ai/agents/perfil.ts (LIMITES_DOS_TEMAS) e no Zod; o
-- tamanho de CADA assunto (120) é checado só no Zod, porque CHECK não olha dentro
-- de array sem função auxiliar e o banco não precisa ser mais estrito que a API.
alter table public.ai_agent_versions drop constraint if exists ai_agent_versions_allowed_topics_check;
alter table public.ai_agent_versions
  add constraint ai_agent_versions_allowed_topics_check
  check (cardinality(allowed_topics) <= 20);

alter table public.ai_agent_versions drop constraint if exists ai_agent_versions_off_topic_reply_check;
alter table public.ai_agent_versions
  add constraint ai_agent_versions_off_topic_reply_check
  check (off_topic_reply is null or char_length(off_topic_reply) <= 500);

comment on column public.ai_agent_versions.restrict_topics is
  'Restringir temas (migration 0549): quando true E allowed_topics não está vazia, o agente só conversa sobre esses assuntos. Padrão false. Não é uma conferência antes do envio: entra na composição das instruções.';
comment on column public.ai_agent_versions.allowed_topics is
  'Assuntos permitidos (até 20, até 120 caracteres cada, validado no Zod). Só vale com restrict_topics ligada.';
comment on column public.ai_agent_versions.off_topic_reply is
  'Resposta padrão para o que está fora dos assuntos permitidos. NULL = o agente recusa com educação, no próprio tom.';

-- A trava de imutabilidade da versão publicada cobre as três colunas novas
-- (o invariante tests/unit/trigger-imutavel-cobre-todas-as-colunas-de-conteudo.test.ts
-- reprova coluna de conteúdo que ficar de fora). Corpo idêntico ao da 0548.
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
    or new.profile_persona        is distinct from old.profile_persona
    or new.profile_tone           is distinct from old.profile_tone
    or new.profile_objective      is distinct from old.profile_objective
    or new.profile_welcome        is distinct from old.profile_welcome
    or new.profile_language       is distinct from old.profile_language
    or new.temperature            is distinct from old.temperature
    or new.restrict_topics        is distinct from old.restrict_topics
    or new.allowed_topics         is distinct from old.allowed_topics
    or new.off_topic_reply        is distinct from old.off_topic_reply
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

-- manifest: perfil guiado do agente (persona, tom, objetivo, boas-vindas, idioma) e temperatura passam a ser colunas da versão publicável, com a trava de imutabilidade cobrindo-as (#89)
-- ═══ Perfil guiado do agente e temperatura funcional (0546, issue #89) ═══
--
-- Quem cria um agente passa a preencher um formulário (persona, tom, objetivo,
-- boas-vindas, idioma) em vez de depender só do prompt livre. O perfil é dado da
-- VERSÃO — rascunho, diff, histórico e desfazer valem para ele como valem para o
-- prompt — e o que o modelo recebe é a composição dos dois (lib/ai/agents/perfil.ts).
--
-- A temperatura vira campo da versão e chega à chamada ao modelo. NULL = padrão
-- do modelo. O campo ai_agents.config.temperature, que nenhum motor lia, deixa de
-- existir como controle: a chave que sobrar em jsonb de cliente é inerte.
--
-- ADITIVA E SEM BACKFILL, de propósito: toda coluna nova nasce NULL, e NULL
-- significa "sem perfil / padrão do modelo". Agente existente recebe exatamente o
-- que recebia até alguém editá-lo — nenhuma linha antiga é tocada, então não há
-- dado a corrigir antes das constraints.
--
-- Por que colunas e não um jsonb `profile`: tom e idioma são vocabulário fechado
-- (CHECK, não enum), e a UI/diff leriam path de jsonb direto sem schema central —
-- o anti-pattern 6. Os vizinhos da versão já são colunas tipadas.

alter table public.ai_agent_versions
  add column if not exists profile_persona   text,
  add column if not exists profile_tone      text,
  add column if not exists profile_objective text,
  add column if not exists profile_welcome   text,
  add column if not exists profile_language  text,
  add column if not exists temperature       numeric(3,2);

-- Vocabulário FECHADO em text + CHECK (não enum): tom em três níveis e os três
-- idiomas do produto. Os mesmos valores vivem em lib/ai/agents/perfil.ts
-- (TONS_DO_AGENTE, IDIOMAS_DO_AGENTE), e o invariante
-- tests/invariants/vocabulario-banco-x-typescript.test.ts cobra as duas listas.
-- Cada `add constraint` vem logo depois do seu `drop ... if exists`: é o que torna
-- a migration reaplicável (o update.sh de quem já aplicou a 0546 roda o apêndice
-- do baseline de novo).
alter table public.ai_agent_versions drop constraint if exists ai_agent_versions_profile_tone_check;
alter table public.ai_agent_versions
  add constraint ai_agent_versions_profile_tone_check
  check (profile_tone is null or profile_tone = any (array['formal','normal','descontraido']));

alter table public.ai_agent_versions drop constraint if exists ai_agent_versions_profile_language_check;
alter table public.ai_agent_versions
  add constraint ai_agent_versions_profile_language_check
  check (profile_language is null or profile_language = any (array['pt-BR','es','en']));

alter table public.ai_agent_versions drop constraint if exists ai_agent_versions_profile_persona_check;
alter table public.ai_agent_versions
  add constraint ai_agent_versions_profile_persona_check
  check (profile_persona is null or char_length(profile_persona) <= 600);

alter table public.ai_agent_versions drop constraint if exists ai_agent_versions_profile_objective_check;
alter table public.ai_agent_versions
  add constraint ai_agent_versions_profile_objective_check
  check (profile_objective is null or char_length(profile_objective) <= 600);

alter table public.ai_agent_versions drop constraint if exists ai_agent_versions_profile_welcome_check;
alter table public.ai_agent_versions
  add constraint ai_agent_versions_profile_welcome_check
  check (profile_welcome is null or char_length(profile_welcome) <= 500);

-- 0..1: a faixa que TODOS os provedores aceitam (a Anthropic recusa/trunca acima de 1).
alter table public.ai_agent_versions drop constraint if exists ai_agent_versions_temperature_check;
alter table public.ai_agent_versions
  add constraint ai_agent_versions_temperature_check
  check (temperature is null or (temperature >= 0 and temperature <= 1));

comment on column public.ai_agent_versions.profile_persona is
  'Perfil guiado (migration 0546): quem o agente é. NULL = sem perfil — o agente recebe só o prompt livre, exatamente como antes.';
comment on column public.ai_agent_versions.profile_tone is
  'Perfil guiado: tom de voz em três níveis fechados (formal, normal, descontraido). NULL = não definido.';
comment on column public.ai_agent_versions.profile_objective is
  'Perfil guiado: o que o agente persegue na conversa, em uma ou duas frases.';
comment on column public.ai_agent_versions.profile_welcome is
  'Perfil guiado: mensagem de boas-vindas para contato novo.';
comment on column public.ai_agent_versions.profile_language is
  'Perfil guiado: idioma em que o agente responde (pt-BR, es, en). NULL = não definido.';
comment on column public.ai_agent_versions.temperature is
  'Temperatura enviada ao modelo nas respostas deste agente (0 a 1). NULL = padrão do modelo (ou a da organização, se ela configurou uma). É o ÚNICO lugar do valor: o campo ai_agents.config.temperature era decorativo e saiu.';

-- A trava de imutabilidade da versão publicada cobre as seis colunas novas
-- (o invariante tests/unit/trigger-imutavel-cobre-todas-as-colunas-de-conteudo.test.ts
-- reprova coluna de conteúdo que ficar de fora).
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

notify pgrst, 'reload schema';

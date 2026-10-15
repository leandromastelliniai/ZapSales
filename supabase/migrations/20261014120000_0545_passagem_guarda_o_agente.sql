-- manifest: **A passagem guarda qual agente de IA passou a conversa.** Coluna `passagens_de_atendimento.agente_id` (FK para `ai_agents`, `on delete set null`) mais índice parcial. O motor a preenche quando o agente da vez é conhecido; a Inbox lê o nome por junção e escreve "Sofia (IA) transferiu para Ana" em vez de "IA". Nula = passagem antiga, ou sem agente resolvido (turno genérico, teto de orçamento): a tela segue dizendo "IA". Aditiva e idempotente.

-- 0545: a passagem guarda qual agente de IA passou a conversa.
--
-- ─── Por quê ────────────────────────────────────────────────────────────────
--
-- O dono do produto pediu (07/10/2026) que a Inbox diga quando um agente de IA
-- está atendendo, quando passou a conversa para uma pessoa, e QUAL agente era.
-- A passagem (`passagens_de_atendimento`) registrava o motivo, o resumo e quem
-- assumiu, mas não o agente: o motor o tinha em mãos no momento de gravar e o
-- descartava. `conversations.active_ai_agent_id` não serve de fonte — só existe
-- com roteador, e o próprio UPDATE da passagem o zera.
--
-- ─── Por que referência e não cópia do nome (DIRC: Referenciar) ─────────────
--
-- O nome vem de `ai_agents.name` por junção na leitura. Renomear o agente
-- renomeia o histórico, o que é o esperado de um nome de exibição. Apagar o
-- agente zera a referência (`set null`) e a tela volta ao rótulo genérico "IA";
-- a passagem em si, que é história do atendimento, nunca some por isso.
--
-- O índice parcial existe para o `set null`: apagar um agente procura as
-- passagens que apontam para ele.

alter table public.passagens_de_atendimento
  add column if not exists agente_id uuid references public.ai_agents(id) on delete set null;

create index if not exists idx_passagens_de_atendimento_agente
  on public.passagens_de_atendimento (agente_id)
  where agente_id is not null;

comment on column public.passagens_de_atendimento.agente_id is
  'O agente de IA que passou a conversa para uma pessoa (migration 0545). Nulo em passagens antigas ou sem agente resolvido; a Inbox então diz só "IA".';

notify pgrst, 'reload schema';

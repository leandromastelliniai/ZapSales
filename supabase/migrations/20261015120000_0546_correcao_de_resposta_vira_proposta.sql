-- manifest: **"Corrigir esta resposta" vira proposta do agente.** `flywheel_distiller_proposals` ganha `agent_id` (FK para `ai_agents`, `on delete cascade`, nulo = proposta da organização, como todas as anteriores) e o tipo `response_correction` no CHECK. A correção que a pessoa escreve na aba Teste ou em Execuções nasce como proposta pendente, presa ao agente de que fala, e só muda o comportamento quando alguém a aplica. Aditiva e idempotente; dado existente não é tocado.

-- 0546: a correção de uma resposta do agente vira proposta (issue #90, parte da #86).
--
-- ─── Por quê ────────────────────────────────────────────────────────────────
--
-- A aba Propostas já é o portão humano do agente: o flywheel destila melhorias
-- das conversas e NADA se aplica sozinho — o clique é o gate, e aplicar cria uma
-- versão nova pelo caminho de publicação por ponteiro. "Corrigir esta resposta"
-- entra por essa mesma porta, em vez de abrir uma segunda via de mudar o
-- agente.
--
-- ─── Por que `agent_id` (DIRC: Integrar, FK e não texto) ────────────────────
--
-- A tabela é da ORGANIZAÇÃO: as propostas do flywheel não dizem de que agente
-- falam, e a tela mostra todas em cada agente. Uma correção, ao contrário, é
-- sobre UM agente — e mostrá-la na aba de outro, com o botão "aplicar versão
-- nova" ao lado, mudaria o prompt do agente errado. Nulo continua significando
-- "da organização", então nenhuma linha existente muda de sentido.
--
-- `on delete cascade`, e não `set null`: uma correção sobre um agente apagado
-- não tem a quem se aplicar, e com `set null` ela viraria "da organização" e
-- apareceria em todos os outros agentes.
--
-- ─── Por que um tipo novo e não `playbook_bullet` ───────────────────────────
--
-- O `content` de uma correção cita uma fala do cliente (já mascarada), e a
-- tela precisa mostrar a conversa de origem. O tipo é o que separa as duas
-- coisas sem adivinhar pelo texto. `type` segue `text` + CHECK, não enum.

alter table public.flywheel_distiller_proposals
  add column if not exists agent_id uuid references public.ai_agents(id) on delete cascade;

create index if not exists idx_flywheel_distiller_proposals_agent
  on public.flywheel_distiller_proposals (organization_id, agent_id)
  where agent_id is not null;

alter table public.flywheel_distiller_proposals
  drop constraint if exists flywheel_distiller_proposals_type_check;
alter table public.flywheel_distiller_proposals
  add constraint flywheel_distiller_proposals_type_check
  check (type in ('playbook_bullet', 'golden_case', 'reentry_trigger', 'org_memory_entry', 'response_correction'));

comment on column public.flywheel_distiller_proposals.agent_id is
  'O agente de que a proposta fala (migration 0546). Nulo = proposta da organização (as do flywheel). Uma correção de resposta é sempre de um agente: a tela e o aplicar só a alcançam por ele.';

notify pgrst, 'reload schema';

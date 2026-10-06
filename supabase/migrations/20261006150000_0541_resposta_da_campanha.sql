-- manifest: **Resposta da campanha cai no funil e no agente (issue #11).** `campaigns` ganha `quem_assume` (`ia` | `humano` | `ia_e_humano`, CHECK, default `ia` = o comportamento de antes), `botoes_de_resposta` (jsonb array: cada rótulo de resposta rápida do modelo aciona mover para etapa, atribuir à IA, atribuir a humano, marcar perdido ou opt-out, validado por `lib/campanhas/destino-da-resposta.ts`) e `oferta` (texto que vai para o contexto do agente). Aditiva e idempotente; campanha existente segue igual.

-- 0541 — A RESPOSTA DA CAMPANHA CAI NO FUNIL E NO AGENTE
--
-- Três colunas em `campaigns`. A 0378 já deu à campanha o funil, a etapa e o
-- agente; faltava dizer QUEM ASSUME, o que cada BOTÃO faz, e o que a campanha
-- OFERECE — para o agente não responder a um "quero" sem saber a que veio.
--
-- ═══ `quem_assume` ═══
--
-- `ia` — o agente atende (o comportamento de antes desta migration, por isso o
-- default); `humano` — a IA fica calada nesta conversa e ela vai para a fila de
-- atendentes; `ia_e_humano` — o agente atende, e quando a regra de passagem
-- existente dispara, a conversa vai para a fila. `text` + CHECK, e não enum
-- (doutrina): o vocabulário é o de `QUEM_ASSUME` em
-- `lib/campanhas/destino-da-resposta.ts`, vigiado por
-- `tests/invariants/vocabulario-banco-x-typescript.test.ts`.
--
-- ═══ `botoes_de_resposta` ═══
--
-- `[{ botao, acao, stage_id? }]`. Quem lê é SEMPRE o Zod de
-- `destino-da-resposta.ts` (sem `jsonb` lido por caminho solto na tela): o banco
-- só garante que é uma lista. A etapa de "mover para etapa" é ponteiro que pode
-- envelhecer (etapa arquivada) — o executor confere a etapa na hora do clique,
-- dentro da organização, e não move para etapa que não existe mais.
--
-- ═══ `oferta` ═══
--
-- Texto livre do operador, até 2000 caracteres: o que a campanha oferece, nas
-- palavras de quem a montou. Vai para o contexto do agente junto com o nome da
-- campanha, o modelo e o texto que a pessoa recebeu.

alter table public.campaigns
  add column if not exists quem_assume text not null default 'ia',
  add column if not exists botoes_de_resposta jsonb not null default '[]'::jsonb,
  add column if not exists oferta text;

-- Valor fora do vocabulário antes da constraint: este bloco é re-aplicado na
-- atualização e não pode derrubar o update de um clone.
update public.campaigns
   set quem_assume = 'ia'
 where quem_assume not in ('ia', 'humano', 'ia_e_humano');
update public.campaigns
   set botoes_de_resposta = '[]'::jsonb
 where jsonb_typeof(botoes_de_resposta) <> 'array';
update public.campaigns
   set oferta = left(oferta, 2000)
 where char_length(oferta) > 2000;

alter table public.campaigns drop constraint if exists campaigns_quem_assume_check;
alter table public.campaigns
  add constraint campaigns_quem_assume_check
  check (quem_assume in ('ia', 'humano', 'ia_e_humano'));

alter table public.campaigns drop constraint if exists campaigns_botoes_de_resposta_lista;
alter table public.campaigns
  add constraint campaigns_botoes_de_resposta_lista
  check (jsonb_typeof(botoes_de_resposta) = 'array');

alter table public.campaigns drop constraint if exists campaigns_oferta_tamanho;
alter table public.campaigns
  add constraint campaigns_oferta_tamanho
  check (oferta is null or char_length(oferta) <= 2000);

comment on column public.campaigns.quem_assume is
  'Quem assume a resposta (issue #11): ia = o agente da campanha atende; humano = a IA fica calada na conversa e ela vai para a fila de atendentes; ia_e_humano = o agente atende e a passagem para humano (regra existente) manda a conversa para a fila. Vale na primeira resposta à campanha.';
comment on column public.campaigns.botoes_de_resposta is
  'Mapa dos botões de resposta rápida: [{ botao, acao, stage_id? }], acao em mover_etapa | atribuir_ia | atribuir_humano | marcar_perdido | opt_out. Lido só pelo Zod de lib/campanhas/destino-da-resposta.ts. O clique executa a ação sem chamar modelo de linguagem.';
comment on column public.campaigns.oferta is
  'O que a campanha oferece, nas palavras do operador (até 2000 caracteres). Vai para o contexto do agente que atende a resposta.';

notify pgrst, 'reload schema';

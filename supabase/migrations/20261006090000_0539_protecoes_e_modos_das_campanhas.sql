-- manifest: **Proteções e modos de envio das campanhas (issue #9).** `channel_sessions.meta_portfolio_id` guarda o portfólio de negócio da Meta dono da WABA (o limite diário é do portfólio). `campaigns` ganha o motivo da pausa automática (`pausa_motivo` com CHECK + `pausa_detalhe`), o aceite do risco de banimento do modo WAHA (`risco_de_banimento_aceito_em`/`_por`) e o número WAHA de atendimento do modo "dois números" (`numero_de_atendimento_id`, FK composta com a organização, só em campanha oficial). `fn_portfolio_contatos_alcancados` conta os contatos alcançados por modelo nas últimas 24 h em todos os números do portfólio, e `fn_campanha_reservar_lote_no_portfolio` reserva só o que cabe no limite, sob trava única da instalação — duas campanhas do mesmo portfólio, mesmo de organizações diferentes, somadas não passam do limite. Idempotente.

-- 0539: proteções e modos de envio das campanhas.
--
-- ─── O portfólio ─────────────────────────────────────────────────────────────
--
-- Desde 2025 o limite diário de mensagens é do PORTFÓLIO de negócio da Meta,
-- compartilhado por todos os números de todas as WABAs dele: rodar números não
-- multiplica o limite. A WABA não é o portfólio (um portfólio pode ter várias),
-- então a chave é outra coluna, lida da WABA (`owner_business_info`) na conexão.
-- Nula = não se sabe; o motor então junta o número com os oficiais da mesma
-- organização e os da mesma WABA — errar para o lado de mandar menos. Uma
-- organização tem UM número oficial, então dois números do mesmo portfólio são
-- de organizações diferentes: o grupo do portfólio cruza tenants, e só contagem
-- e faixa atravessam (`lib/campanhas/portfolio.ts`).
--
-- ─── A pausa automática ─────────────────────────────────────────────────────
--
-- Qualidade vermelha do número e modelo rejeitado, pausado, desativado ou
-- recategorizado pausam a campanha sozinhos, e o operador precisa ver POR QUÊ.
-- `pausa_motivo` é vocabulário NOSSO e fechado (CHECK, o mesmo de
-- `lib/campanhas/pausa-automatica.ts`); `pausa_detalhe` é a frase que a tela
-- mostra, com o número ou o modelo nomeados. Nulo = ninguém pausou sozinho (a
-- pausa manual e toda campanha anterior a esta migration).
--
-- ─── O aceite do risco do modo WAHA ─────────────────────────────────────────
--
-- Disparar em massa por número não oficial arrisca banimento, e a decisão é do
-- operador — mas tem de ser consciente e registrada. Quem e quando, por
-- campanha; a cópia de uma campanha não herda (é uma intenção nova). O mesmo
-- aceite vai para a auditoria (`campaign.ban_risk_accepted`).
--
-- ─── O modo "dois números" ──────────────────────────────────────────────────
--
-- O modelo sai pelo número oficial com um botão `wa.me` que abre conversa com um
-- número WAHA, onde a conversa segue fora da API Oficial. Doutrina DIRC: o modo
-- é CALCULADO desta coluna, como o oficial é calculado de `meta_template_id`.
-- Só faz sentido com modelo (o botão é do modelo) — CHECK. FK composta com a
-- organização: o número de outro tenant não é referenciável. Arquivar o número
-- não apaga a campanha: `set null` só na coluna do número.

alter table public.channel_sessions
  add column if not exists meta_portfolio_id text;

comment on column public.channel_sessions.meta_portfolio_id is
  'Portfólio de negócio da Meta dono da WABA do número (owner_business_info.id), lido na conexão. O limite diário de mensagens é do portfólio, compartilhado por todos os números dele (issue #9). Nulo = desconhecido: o motor de campanhas junta o número com os oficiais da mesma organização e os da mesma WABA.';

alter table public.campaigns
  add column if not exists pausa_motivo text,
  add column if not exists pausa_detalhe text,
  add column if not exists risco_de_banimento_aceito_em timestamptz,
  add column if not exists risco_de_banimento_aceito_por uuid,
  add column if not exists numero_de_atendimento_id uuid;

-- Valor fora do vocabulário antes da constraint: o bloco é re-aplicado na
-- atualização e não pode derrubar o update de um clone.
update public.campaigns
   set pausa_motivo = null
 where pausa_motivo is not null
   and pausa_motivo not in (
     'qualidade_vermelha', 'modelo_rejeitado', 'modelo_pausado', 'modelo_desativado', 'modelo_recategorizado'
   );

alter table public.campaigns drop constraint if exists campaigns_pausa_motivo_check;
alter table public.campaigns add constraint campaigns_pausa_motivo_check
  check (pausa_motivo is null or pausa_motivo in (
    'qualidade_vermelha', 'modelo_rejeitado', 'modelo_pausado', 'modelo_desativado', 'modelo_recategorizado'
  ));

alter table public.campaigns drop constraint if exists campaigns_risco_aceito_por_fk;
alter table public.campaigns add constraint campaigns_risco_aceito_por_fk
  foreign key (risco_de_banimento_aceito_por) references auth.users(id) on delete set null;

-- Número de atendimento sem modelo é campanha WAHA com um campo sem sentido.
update public.campaigns
   set numero_de_atendimento_id = null
 where numero_de_atendimento_id is not null
   and meta_template_id is null;

alter table public.campaigns drop constraint if exists campaigns_dois_numeros_exige_modelo;
alter table public.campaigns add constraint campaigns_dois_numeros_exige_modelo
  check (numero_de_atendimento_id is null or meta_template_id is not null);

alter table public.campaigns drop constraint if exists campaigns_numero_de_atendimento_org_fk;
alter table public.campaigns add constraint campaigns_numero_de_atendimento_org_fk
  foreign key (organization_id, numero_de_atendimento_id)
  references public.channel_sessions (organization_id, id)
  on delete set null (numero_de_atendimento_id);

comment on column public.campaigns.pausa_motivo is
  'Por que o sistema pausou a campanha sozinho (issue #9): qualidade_vermelha, modelo_rejeitado, modelo_pausado, modelo_desativado, modelo_recategorizado. Nulo = pausa manual ou nenhuma. Limpo ao retomar.';
comment on column public.campaigns.pausa_detalhe is
  'A frase da pausa automática que a tela mostra, com o número ou o modelo nomeados.';
comment on column public.campaigns.risco_de_banimento_aceito_em is
  'Quando o operador aceitou o aviso de risco de banimento do modo WAHA (issue #9). Sem aceite, campanha WAHA não inicia nem agenda.';
comment on column public.campaigns.risco_de_banimento_aceito_por is
  'Quem aceitou o aviso de risco de banimento do modo WAHA.';
comment on column public.campaigns.numero_de_atendimento_id is
  'Modo "dois números" (issue #9): o número WAHA que o botão wa.me do modelo abre. O modelo sai pelo número oficial; a conversa segue neste. O modo é calculado daqui.';

-- A contagem do portfólio: modelos que saíram dos números do portfólio nas
-- últimas 24 h. Parcial: só saída de modelo, a fração pequena de `messages`.
create index if not exists idx_messages_modelo_por_numero
  on public.messages (channel_session_id, created_at)
  where direction = 'outbound' and type = 'template';

-- ─── A reserva dentro do limite do portfólio ────────────────────────────────
--
-- A conta e a reserva precisam ser UMA operação: o laço do worker e o cron de
-- segurança rodam juntos, e duas campanhas do mesmo portfólio podem calcular a
-- mesma folga ao mesmo tempo — somadas, passariam do limite. A trava é
-- transacional e ÚNICA da instalação: o portfólio cruza organizações (uma
-- organização tem um número oficial; dois números do mesmo portfólio são de
-- organizações diferentes), e uma trava por chave deixaria o grupo de portfólio
-- conhecido e o de desconhecido correrem juntos. Dura só a conta e o UPDATE de
-- até 50 linhas — serializar isso entre campanhas não custa nada que se meça.
--
-- O que conta como alcançado (a Meta conta contatos ÚNICOS em 24 h móveis):
-- - modelo que saiu de um número do portfólio, menos o que falhou;
-- - destinatário já reservado (`sending`) de campanha do portfólio, que ainda
--   pode não ter mensagem — é o que impede a segunda reserva de não ver a
--   primeira.
-- A união é por contato, então quem está nos dois lados conta uma vez. Contato
-- que já recebeu modelo hoje e vai receber outro conta de novo na reserva — a
-- conta erra para o lado de mandar menos, nunca mais.
--
-- `security invoker` nas duas: só o `service_role` as executa, como a reserva
-- de 0538. A contagem é função própria porque a tela da campanha mostra o mesmo
-- número ("1.234 de 2.000 contatos nas últimas 24 h") — duas contas escritas em
-- dois lugares divergiriam na primeira correção.
--
-- Sem filtro de organização, de propósito: `p_sessoes` é o grupo do portfólio,
-- que o motor monta (`lib/campanhas/portfolio.ts`) e que pode ter números de
-- mais de uma organização. Só a CONTAGEM sai daqui — nenhuma linha.
create or replace function public.fn_portfolio_contatos_alcancados(
  p_sessoes uuid[],
  p_agora timestamptz
)
returns integer
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select count(distinct u.contact_id)::integer
    from (
      select m.contact_id
        from public.messages m
       where m.channel_session_id = any(p_sessoes)
         and m.direction = 'outbound'
         and m.type = 'template'
         and m.status <> 'failed'
         and m.created_at > p_agora - interval '24 hours'
      union
      select r.contact_id
        from public.campaign_recipients r
        join public.campaigns c on c.id = r.campaign_id
       where r.status = 'sending'
         and c.channel_session_id = any(p_sessoes)
    ) u;
$$;

comment on function public.fn_portfolio_contatos_alcancados(uuid[], timestamptz) is
  'Limite do portfólio (issue #9): contatos ÚNICOS alcançados por modelo nas últimas 24 h pelos números p_sessoes (menos os que falharam), mais os destinatários já reservados de campanhas desses números.';

revoke execute on function public.fn_portfolio_contatos_alcancados(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.fn_portfolio_contatos_alcancados(uuid[], timestamptz) to service_role;

create or replace function public.fn_campanha_reservar_lote_no_portfolio(
  p_campaign_id uuid,
  p_limite integer,
  p_agora timestamptz,
  p_sessoes uuid[],
  p_teto integer
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
  v_usado integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('zapsales.limite_do_portfolio', 0));

  v_usado := public.fn_portfolio_contatos_alcancados(p_sessoes, p_agora);

  return query
    select * from public.fn_campanha_reservar_lote(
      p_campaign_id,
      least(greatest(p_limite, 0), greatest(p_teto - v_usado, 0)),
      p_agora
    );
end
$$;

comment on function public.fn_campanha_reservar_lote_no_portfolio(uuid, integer, timestamptz, uuid[], integer) is
  'Campanha oficial (issue #9): sob trava única da instalação, conta os contatos alcançados nos números do portfólio (fn_portfolio_contatos_alcancados) e reserva só o que cabe em p_teto — duas campanhas do mesmo portfólio somadas não passam do limite.';

revoke execute on function public.fn_campanha_reservar_lote_no_portfolio(uuid, integer, timestamptz, uuid[], integer) from public, anon, authenticated;
grant execute on function public.fn_campanha_reservar_lote_no_portfolio(uuid, integer, timestamptz, uuid[], integer) to service_role;

notify pgrst, 'reload schema';

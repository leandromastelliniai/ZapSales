-- Dados FICTÍCIOS em volume, para a organização de demonstração parecer uma operação de verdade:
-- +48 contatos (total 60), um negócio aberto por contato novo, 10 ganhos e 5 perdidos nos últimos 28 dias,
-- e 34 conversas novas (total 39) com 3 a 7 mensagens cada, em 12 situações típicas de loja.
-- Uso:  psql -v ON_ERROR_STOP=1 -v org="'<uuid>'" -v usr="'<uuid>'" -f semear-massa.sql
-- Roda DEPOIS de semear.sql e semear-config.sql (para distribuir conversas e negócios pela equipe) e
-- ANTES de semear-ia-montar.sql: publicar um agente só depois de as mensagens já estarem no banco evita
-- que o motor do agente reaja a "mensagem recebida" de mentira.
-- Nomes, e-mails e telefones (+55 11 99999 02xx) são inventados e não existem de verdade.
-- Nada aqui envia mensagem: só grava linhas. O canal é o inerte criado por semear.sql.

select exists (select 1 from contacts where organization_id = :org and phone_number = '+5511999990201') as ja \gset
\if :ja
  \echo 'semear-massa.sql já foi aplicado nesta organização. Nada foi feito.'
  \quit
\endif

begin;

-- ===== Contatos =====
create temporary table massa_contato on commit drop as
select i,
  p || ' ' || s as nome,
  '+551199999' || lpad((200 + i)::text, 4, '0') as fone,
  case when i % 3 <> 0 then translate(lower(p || '.' || s), 'áàâãéêíóôõúüç ', 'aaaaeeiooouuc.') || '@exemplo.com.br' end as email,
  case i % 8
    when 0 then array['vip', 'recorrente']
    when 1 then array['novo']
    when 2 then array['recorrente']
    when 3 then array['indicação']
    when 4 then array['novo', 'instagram']
    when 5 then array[]::text[]
    when 6 then array['vip']
    else array['atacado']
  end as tags,
  case when i % 4 = 0 then 'manual' else 'whatsapp' end as origem
from (
  select i,
    (array['Alessandra','Bruno','Cíntia','Daniel','Eduarda','Felipe','Gabriela','Henrique','Isabela','João Pedro',
           'Karina','Leonardo','Mariana','Nicole','Otávio','Paula','Renata','Sérgio','Tatiane','Vanessa',
           'Wagner','Yasmin','Gustavo','Larissa','Matheus','Débora','Eduardo','Flávia','Guilherme','Helena',
           'Igor','Jéssica','Kleber','Luciana','Murilo','Natália','Pedro','Raquel','Sandra','Tiago',
           'Viviane','André','Bianca','Cristiano','Diana','Elisa','Fábio','Giovana'])[i] as p,
    (array['Silva','Souza','Oliveira','Santos','Pereira','Lima','Costa','Ribeiro','Almeida','Carvalho',
           'Gomes','Martins','Araújo','Barbosa','Cardoso','Rocha','Dias','Nascimento','Moreira','Teixeira',
           'Fernandes','Mendes','Freitas','Ramos','Vieira','Campos','Pinto','Correia','Monteiro','Cavalcanti',
           'Azevedo','Batista','Borges','Castro','Duarte','Farias','Guimarães','Lopes','Machado','Melo',
           'Miranda','Moura','Nogueira','Peixoto','Prado','Reis','Siqueira','Tavares'])[((i * 17) % 48) + 1] as s
  from generate_series(1, 48) as i
) x;

insert into contacts (organization_id, name, display_name, email, phone_number, tags, source, last_activity_at, created_at)
select :org, nome, nome, email, fone, tags, origem,
  now() - make_interval(mins => 30 + (i * 937) % 20000),
  now() - make_interval(days => 3 + (i * 5) % 55)
from massa_contato;

-- ===== Equipe e catálogo (só para distribuir) =====
create temporary table massa_equipe on commit drop as
select array_agg(user_id order by (user_id = :usr::uuid) desc, accepted_at) as ids
from user_organizations
where organization_id = :org and revoked_at is null and role in ('admin', 'manager', 'agent');

create temporary table massa_produto on commit drop as
select k, nome, cents from (values
  (1, 'Kit skincare completo', 32900),
  (2, 'Vestido midi floral', 24900),
  (3, 'Tênis esportivo', 39900),
  (4, 'Bolsa de couro', 45900),
  (5, 'Fone de ouvido sem fio', 21900),
  (6, 'Luminária de mesa', 14900),
  (7, 'Perfume importado 100ml', 31900),
  (8, 'Capa sob encomenda', 8900)
) v(k, nome, cents);

-- ===== Negócios =====
create temporary table massa_lead on commit drop as
select c.i, c.nome, p.nome as produto, p.cents, 1 + (c.i % 3) as qtd,
  (array['Carrinho abandonado','Aguardando pagamento','Carrinho abandonado','Em separação','Aguardando pagamento','Enviado',
         'Pós-venda','Em separação','Carrinho abandonado','Entregue','Aguardando pagamento','Enviado'])[(c.i % 12) + 1] as etapa
from massa_contato c
join massa_produto p on p.k = ((c.i * 3) % 8) + 1;

-- um negócio aberto por contato novo, espalhado pelas etapas
insert into crm_leads (organization_id, pipeline_id, stage_id, contact_id, title, value_cents, owner_user_id, status, position_in_stage, last_activity_at, source)
select :org, st.pipeline_id, st.id, ct.id,
  l.produto || case when l.qtd > 1 then ' (' || l.qtd || ' un.)' else '' end,
  l.cents * l.qtd,
  case when l.i % 7 = 0 then null else e.ids[(l.i % cardinality(e.ids)) + 1] end,
  'open', 10000 + l.i * 1000,
  now() - make_interval(mins => 20 + (l.i * 613) % 14000),
  'manual'
from massa_lead l
cross join massa_equipe e
join contacts ct on ct.organization_id = :org and ct.name = l.nome
join crm_pipelines p on p.organization_id = :org and p.slug = 'pedidos'
join crm_stages st on st.organization_id = :org and st.pipeline_id = p.id and st.name = l.etapa;

-- ganhos (múltiplos de 3 entre os 21 e 48) e perdidos (alguns), já fechados, nos últimos 28 dias
insert into crm_leads (organization_id, pipeline_id, stage_id, contact_id, title, value_cents, owner_user_id, status, position_in_stage, closed_at, last_activity_at, source, lost_reason, lost_from_stage_id)
select :org, p.id,
  case when f.fecho = 'won' then (select id from crm_stages where pipeline_id = p.id and is_won limit 1)
       else (select id from crm_stages where pipeline_id = p.id and is_lost limit 1) end,
  ct.id,
  'Pedido — ' || lower(l.produto),
  l.cents * l.qtd,
  e.ids[(l.i % cardinality(e.ids)) + 1],
  f.fecho, 1000 + l.i,
  now() - make_interval(days => 1 + (l.i * 7) % 28),
  now() - make_interval(days => 1 + (l.i * 7) % 28),
  'manual',
  case when f.fecho = 'lost' then case when l.i % 2 = 0 then 'price' else 'no_response' end end,
  case when f.fecho = 'lost' then (select id from crm_stages where pipeline_id = p.id and name = 'Aguardando pagamento' limit 1) end
from massa_lead l
cross join massa_equipe e
cross join lateral (
  select case when l.i >= 21 and l.i % 3 = 0 then 'won'
              when l.i >= 22 and l.i % 3 = 1 and l.i % 2 = 0 then 'lost' end as fecho
) f
join contacts ct on ct.organization_id = :org and ct.name = l.nome
join crm_pipelines p on p.organization_id = :org and p.slug = 'pedidos'
where f.fecho is not null;

-- ===== Conversas =====
create temporary table massa_cenario on commit drop as
select id, linhas from (values
 (1, array[
  'i|Oi, boa tarde! Vi no Instagram de vocês o item "{p}".',
  'o|Oi, {n}! Que bom ter você por aqui 😊 Esse é um dos mais pedidos da semana.',
  'i|Qual o valor com frete pra São Paulo?',
  'o|O frete pra capital sai R$ 14,90 e chega em até 3 dias úteis.',
  'i|Hmm, achei um pouco puxado. Tem algum desconto no Pix?',
  'o|Tem sim! Pagando no Pix você ganha 5% de desconto. Quer que eu gere o link?',
  'i|Pode gerar, por favor.']),
 (2, array[
  'i|Boa tarde, fiz um pedido na semana passada e ainda não chegou.',
  'o|Oi, {n}! Vou verificar agora. Pode me passar o número do pedido?',
  'i|É o #4821',
  'o|Achei! Seu pedido saiu para entrega hoje de manhã, deve chegar até o fim do dia 🚚',
  'i|Ah que bom, obrigado! Fiquei preocupado.',
  'o|Imagina! Qualquer coisa é só chamar.']),
 (3, array[
  'i|Oi, comprei o item "{p}" mas não serviu. Dá pra trocar?',
  'o|Claro, {n}! Temos 7 dias a partir do recebimento. Ele está sem uso e com etiqueta?',
  'i|Sim, tudo certinho.',
  'o|Perfeito. Vou te mandar a etiqueta de postagem reversa por aqui, tá?',
  'i|Pode mandar. Quanto tempo leva pra eu receber o novo?',
  'o|Assim que o produto chegar aqui, enviamos o novo em até 2 dias úteis.',
  'i|Combinado, obrigado!']),
 (4, array[
  'i|Oi, acabei de fazer o Pix do item "{p}".',
  'o|Oi, {n}! Recebi o aviso, só um instante que estou conferindo aqui 🙂',
  'o|Confirmado! Pagamento aprovado ✅ Seu pedido entra em separação agora.',
  'i|Maravilha, e quando envia?',
  'o|Hoje ainda sai pelos Correios. Te aviso com o código de rastreio.',
  'a|Seu pedido foi despachado! Código de rastreio: BR812345678AB.',
  'i|Recebi o código, valeu!']),
 (5, array[
  'i|Bom dia! O item "{p}" é original?',
  'o|Bom dia, {n}! Sim, é original, com nota fiscal e garantia de 12 meses.',
  'i|Vem com caixa?',
  'o|Vem sim, na embalagem lacrada do fabricante.',
  'i|Beleza, vou pensar e te falo.']),
 (6, array[
  'i|Olá, vocês vendem no atacado? Tenho uma loja em Campinas.',
  'o|Olá, {n}! Vendemos sim, a partir de 10 peças por modelo.',
  'i|Pode me mandar a tabela de preços?',
  'o|Claro! Vou pedir para a nossa gerente comercial te enviar ainda hoje.',
  'i|Fico no aguardo, obrigado.']),
 (7, array[
  'i|Recebi o item "{p}" e veio com um defeito 😕',
  'o|Poxa, {n}, sinto muito por isso! Pode me mandar uma foto do defeito?',
  'i|Mando sim, um minuto.',
  'i|Já te mando daqui a pouco, estou fora de casa.',
  'o|Sem pressa. Assim que receber eu abro a troca pra você.']),
 (8, array[
  'i|Recebi tudo, obrigada!',
  'o|Que bom, {n}! Se puder, conte o que achou — sua opinião ajuda muito 💜',
  'i|Amei! Já indiquei pra minha irmã.',
  'o|Que máximo! Quando ela vier, fala seu nome que damos um brinde pra vocês duas.']),
 (9, array[
  'i|Vocês têm loja física?',
  'o|Temos! Fica na Rua das Acácias, 120, em Pinheiros. Funcionamos de segunda a sábado, das 9h às 19h.',
  'i|Perfeito, passo aí amanhã.',
  'o|Te esperamos! 😊']),
 (10, array[
  'i|Quero cancelar o pedido do item "{p}".',
  'o|Oi, {n}. Posso saber o motivo? Se for algo que a gente resolva, fico feliz em ajudar.',
  'i|Encontrei mais barato em outro lugar.',
  'o|Entendo. Consigo fazer 10% de desconto pra fechar agora, o que acha?',
  'i|Não, obrigado. Prefiro cancelar mesmo.',
  'o|Tudo bem, cancelamento feito. O estorno cai em até 5 dias úteis.']),
 (11, array[
  'i|Vi a promoção de sexta, ainda está valendo?',
  'o|Oi, {n}! Está sim, até domingo. Frete grátis acima de R$ 250.',
  'i|E vale pro item "{p}"?',
  'o|Vale! Quer que eu reserve uma unidade?',
  'i|Quero sim.',
  'o|Reservado por 24h no seu nome 😉',
  'i|Obrigado! Passo o cartão ainda hoje.']),
 (12, array[
  'a|Oi, {n}! Você deixou o item "{p}" no carrinho. Quer ajuda para finalizar?',
  'i|Oi! Tinha esquecido, obrigada por avisar.',
  'o|Sem problema! Posso aplicar o frete grátis se fechar hoje.',
  'i|Fechou, pode mandar o link.'])
) v(id, linhas);

create temporary table massa_conversa on commit drop as
select c.i, c.nome, split_part(c.nome, ' ', 1) as primeiro, l.produto,
  ((c.i - 1) % 12) + 1 as cenario,
  case ((c.i - 1) % 12) + 1
    when 2 then 'resolved' when 8 then 'resolved' when 10 then 'resolved'
    when 9 then 'closed'
    when 5 then 'pending' when 7 then 'pending'
    else 'open' end as status_final,
  5 + ((c.i * 131) % 97) * (1 + (c.i % 5) * 20)
    + case when ((c.i - 1) % 12) + 1 in (2, 8, 9, 10) then 1440 else 0 end as minutos,
  case when ((c.i - 1) % 12) + 1 in (5, 7) and c.i % 2 = 0 then null
       else e.ids[(c.i % cardinality(e.ids)) + 1] end as dono
from massa_contato c
join massa_lead l on l.i = c.i
cross join massa_equipe e
where c.i <= 34;

-- nasce aberta (o banco bloqueia mensagem em conversa já encerrada) e é fechada depois das mensagens
insert into conversations (organization_id, contact_id, channel_session_id, channel, status, assigned_to_user_id, assigned_at, last_message_at)
select :org, ct.id, cs.id, 'whatsapp', 'open', mc.dono,
  case when mc.dono is not null then now() - make_interval(mins => mc.minutos + 30) end,
  now() - make_interval(mins => mc.minutos)
from massa_conversa mc
join contacts ct on ct.organization_id = :org and ct.name = mc.nome
join channel_sessions cs on cs.organization_id = :org;

insert into messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, status, body, sent_via, sent_by_user_id, sent_at)
select :org, cv.id, cv.channel_session_id, cv.contact_id, 'text',
  case when m.quem = 'i' then 'inbound' else 'outbound' end,
  case when m.quem = 'i' then 'received' when m.quem = 'a' then 'delivered' when m.n = m.total then 'delivered' else 'read' end,
  replace(replace(m.texto, '{p}', mc.produto), '{n}', mc.primeiro),
  case m.quem when 'i' then 'crm' when 'a' then 'automation' else 'user' end,
  case when m.quem = 'o' then coalesce(mc.dono, :usr::uuid) end,
  now() - make_interval(mins => mc.minutos + ((m.total - m.n) * (3 + (mc.i + m.n::int) % 9))::int)
from massa_conversa mc
join massa_cenario s on s.id = mc.cenario
cross join lateral (
  select split_part(t.l, '|', 1) as quem, substr(t.l, position('|' in t.l) + 1) as texto, t.n, array_length(s.linhas, 1) as total
  from unnest(s.linhas) with ordinality as t(l, n)
) m
join contacts ct on ct.organization_id = :org and ct.name = mc.nome
join conversations cv on cv.organization_id = :org and cv.contact_id = ct.id;

-- resumo de cada conversa nova, tirado das próprias mensagens, e o estado final
update conversations cv set
  last_inbound_at = x.li, last_outbound_at = x.lo, last_message_at = x.lm, last_message_preview = x.prev,
  unread_count_for_assignee = case when mc.status_final in ('open', 'pending') and mc.dono is not null then x.nao_lidas else 0 end,
  status = mc.status_final
from massa_conversa mc
join contacts ct on ct.organization_id = :org and ct.name = mc.nome
join (
  select m.conversation_id,
         max(m.sent_at) filter (where m.direction = 'inbound') as li,
         max(m.sent_at) filter (where m.direction = 'outbound') as lo,
         max(m.sent_at) as lm,
         (array_agg(left(m.body, 80) order by m.sent_at desc))[1] as prev,
         count(*) filter (where m.direction = 'inbound'
           and m.sent_at > coalesce((select max(o.sent_at) from messages o
                                     where o.conversation_id = m.conversation_id and o.direction = 'outbound'), '-infinity'))::int as nao_lidas
  from messages m
  where m.organization_id = :org
  group by m.conversation_id
) x on true
where cv.organization_id = :org and cv.contact_id = ct.id and x.conversation_id = cv.id;

commit;

select (select count(*) from contacts where organization_id = :org) as contatos,
       (select count(*) from crm_leads where organization_id = :org) as negocios,
       (select count(*) from crm_leads where organization_id = :org and status = 'won') as ganhos,
       (select count(*) from crm_leads where organization_id = :org and status = 'lost') as perdidos,
       (select count(*) from conversations where organization_id = :org) as conversas,
       (select count(*) from messages where organization_id = :org) as mensagens;

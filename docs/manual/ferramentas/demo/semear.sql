-- Dados FICTÍCIOS para a organização de demonstração do manual (veja criar.sh).
-- Uso:  psql -v ON_ERROR_STOP=1 -v org="'<uuid da org>'" -v usr="'<uuid do usuário>'" -f semear.sql
-- Nomes, e-mails e telefones (+55 11 9999-01xx) são inventados e não existem de verdade.
-- A sessão de canal usa o nome reservado `e2e-numero-conectado` com status STOPPED: o vigia de
-- saúde (`channel-health`) o ignora e o reconciliador só age em sessões que existem no WAHA,
-- então o seed NÃO mexe no WhatsApp real da VPS.
begin;

update organizations set display_name = 'Loja Aurora (demonstração)', legal_name = 'Loja Aurora Demonstração Ltda' where id = :org;

insert into channel_sessions (organization_id, waha_session_name, engine, webhook_secret_encrypted, status, phone_number, display_name)
values (:org, 'e2e-numero-conectado', 'NOWEB', '\x00', 'STOPPED', '+551140000000', 'WhatsApp da loja');

insert into contacts (organization_id, name, display_name, email, phone_number, tags, source, last_activity_at)
select :org, n, n, e, p, t, s, now() - (i || ' hours')::interval
from (values
 (1,'Ana Paula Ferreira','ana.ferreira@exemplo.com.br','+5511999990101', array['vip','recorrente'],'whatsapp'),
 (2,'Carlos Eduardo Lima','carlos.lima@exemplo.com.br','+5511999990102', array['novo'],'whatsapp'),
 (3,'Juliana Martins',null,'+5511999990103', array['novo'],'whatsapp'),
 (4,'Rafael Costa','rafael.costa@exemplo.com.br','+5511999990104', array['recorrente'],'manual'),
 (5,'Beatriz Oliveira','bia.oliveira@exemplo.com.br','+5511999990105', array['vip'],'whatsapp'),
 (6,'Marcos Vinícius Rocha',null,'+5511999990106', array[]::text[],'manual'),
 (7,'Fernanda Alves','fernanda.alves@exemplo.com.br','+5511999990107', array['recorrente'],'whatsapp'),
 (8,'Lucas Pereira',null,'+5511999990108', array['novo'],'manual'),
 (9,'Camila Santos','camila.santos@exemplo.com.br','+5511999990109', array['vip'],'whatsapp'),
 (10,'Rodrigo Nunes',null,'+5511999990110', array[]::text[],'manual'),
 (11,'Patrícia Gomes','patricia.gomes@exemplo.com.br','+5511999990111', array['recorrente'],'whatsapp'),
 (12,'Thiago Barbosa',null,'+5511999990112', array['novo'],'whatsapp')
) as v(i,n,e,p,t,s);

insert into crm_leads (organization_id, pipeline_id, stage_id, contact_id, title, value_cents, owner_user_id, status, position_in_stage, last_activity_at, source)
select :org, st.pipeline_id, st.id, c.id, v.title, v.valor, case when v.dono then :usr::uuid end, 'open', v.pos, now() - (v.h || ' hours')::interval, 'manual'
from (values
 ('Ana Paula Ferreira','Carrinho abandonado','Kit skincare completo',32900,true,1000,3),
 ('Carlos Eduardo Lima','Carrinho abandonado','Conjunto de toalhas',18900,false,2000,20),
 ('Juliana Martins','Aguardando pagamento','Vestido midi floral',24900,true,1000,5),
 ('Rafael Costa','Aguardando pagamento','Tênis esportivo',39900,false,2000,9),
 ('Beatriz Oliveira','Pago','Bolsa de couro',45900,true,1000,30),
 ('Marcos Vinícius Rocha','Em separação','Camisa social (2 un.)',27800,true,1000,26),
 ('Fernanda Alves','Em separação','Perfume importado',31900,false,2000,40),
 ('Lucas Pereira','Enviado','Fone de ouvido sem fio',21900,true,1000,50),
 ('Camila Santos','Enviado','Luminária de mesa',14900,false,2000,52),
 ('Rodrigo Nunes','Entregue','Mochila executiva',28900,true,1000,100),
 ('Patrícia Gomes','Pós-venda','Jogo de panelas',52900,true,1000,200),
 ('Thiago Barbosa','Pago','Relógio digital',35900,false,2000,28)
) as v(nome,etapa,title,valor,dono,pos,h)
join contacts c on c.organization_id = :org and c.name = v.nome
join crm_pipelines p on p.organization_id = :org and p.slug = 'pedidos'
join crm_stages st on st.organization_id = :org and st.pipeline_id = p.id and st.name = v.etapa;

-- conversas
insert into conversations (organization_id, contact_id, channel_session_id, channel, status, assigned_to_user_id, assigned_at, last_inbound_at, last_outbound_at, last_message_at, last_message_preview, unread_count_for_assignee)
select :org, c.id, cs.id, 'whatsapp', v.st, case when v.meu then :usr::uuid end, case when v.meu then now() end,
       now() - (v.h || ' minutes')::interval, now() - ((v.h+3) || ' minutes')::interval, now() - (v.h || ' minutes')::interval, v.prev, v.nao_lidas
from (values
 ('Ana Paula Ferreira','open',true,4,'Oi! Vocês ainda têm o kit no tamanho grande?',2),
 ('Juliana Martins','open',true,25,'Já fiz o Pix, pode confirmar?',1),
 ('Carlos Eduardo Lima','pending',false,90,'Bom dia, queria saber o prazo de entrega.',1),
 ('Beatriz Oliveira','open',true,180,'Perfeito, obrigada pelo atendimento!',0),
 ('Rafael Costa','resolved',true,1500,'Recebi o tênis, ficou ótimo.',0)
) as v(nome,st,meu,h,prev,nao_lidas)
join contacts c on c.organization_id = :org and c.name = v.nome
join channel_sessions cs on cs.organization_id = :org;

insert into messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, status, body, sent_via, sent_by_user_id, sent_at)
select :org, cv.id, cv.channel_session_id, cv.contact_id, 'text', m.dir, case when m.dir='inbound' then 'received' else 'read' end, m.corpo,
       case when m.dir='inbound' then 'crm' else 'user' end, case when m.dir='outbound' then :usr::uuid end,
       now() - (m.min || ' minutes')::interval
from (values
 ('Ana Paula Ferreira','inbound','Oi! Vocês ainda têm o kit skincare completo?',22),
 ('Ana Paula Ferreira','outbound','Oi, Ana! Temos sim 😊 Quer que eu separe um pra você?',20),
 ('Ana Paula Ferreira','inbound','Quero! E vocês têm no tamanho grande?',6),
 ('Ana Paula Ferreira','inbound','Oi! Vocês ainda têm o kit no tamanho grande?',4),
 ('Juliana Martins','inbound','Oi, quero o vestido midi floral, tem no M?',70),
 ('Juliana Martins','outbound','Tem sim! Te mandei o link de pagamento por Pix.',60),
 ('Juliana Martins','inbound','Já fiz o Pix, pode confirmar?',25),
 ('Carlos Eduardo Lima','inbound','Bom dia, queria saber o prazo de entrega.',90),
 ('Beatriz Oliveira','inbound','Recebi a bolsa hoje, chegou certinha!',200),
 ('Beatriz Oliveira','outbound','Que bom, Beatriz! Qualquer coisa é só chamar.',190),
 ('Beatriz Oliveira','inbound','Perfeito, obrigada pelo atendimento!',180),
 ('Rafael Costa','inbound','Recebi o tênis, ficou ótimo.',1500)
) as m(nome,dir,corpo,min)
join contacts c on c.organization_id = :org and c.name = m.nome
join conversations cv on cv.organization_id = :org and cv.contact_id = c.id;

commit;
select (select count(*) from contacts where organization_id=:org) c, (select count(*) from crm_leads where organization_id=:org) l, (select count(*) from conversations where organization_id=:org) cv, (select count(*) from messages where organization_id=:org) m;

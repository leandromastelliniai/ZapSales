-- Dados FICTÍCIOS de disparo em massa. Nenhuma campanha fica em `running` (o worker só toca nessa).
-- Uso: psql -v ON_ERROR_STOP=1 -v org="'<uuid>'" -v usr="'<uuid>'" -f semear-campanhas.sql
begin;
with cs as (select id from channel_sessions where organization_id = :org order by created_at limit 1)
insert into campaigns (organization_id, name, channel_session_id, base_legal, status, message_body, audience_filter, snapshot_eligible, snapshot_excluded, snapshot_total, prepared_at, started_at, completed_at, paused_at, cancelled_at, scheduled_at, risco_de_banimento_aceito_em, pausa_motivo, pausa_detalhe, created_at)
select :org, v.nome, cs.id, 'consent', v.st, v.msg, v.filtro::jsonb, v.el, v.ex, v.el + v.ex,
  case when v.st in ('ready','running','paused','completed','scheduled') then now() - v.d end,
  case when v.st in ('paused','completed') then now() - v.d + interval '10 minutes' end,
  case when v.st = 'completed' then now() - v.d + interval '3 hours' end,
  case when v.st = 'paused' then now() - v.d + interval '40 minutes' end,
  case when v.st = 'cancelled' then now() - v.d + interval '1 hour' end,
  case when v.st = 'scheduled' then now() + interval '2 days' end,
  case when v.st in ('paused','completed','scheduled') then now() - v.d end,
  v.pm, v.pd, now() - v.d - interval '1 hour'
from cs, (values
 ('Reativação de clientes parados','completed','{{saudacao}}, {{primeiro_nome}}! Faz um tempinho que você não passa por aqui. Preparamos uma condição especial de volta: 10% em qualquer pedido até sexta. Posso te mandar o link?','{"com_alguma_tag":["recorrente"],"sem_interacao_ha_dias":60,"limite":500}',10,2,interval '6 days',null,null),
 ('Lançamento coleção primavera','paused','Oi, {{primeiro_nome}}! Chegou a coleção primavera da Loja Aurora. Quer ver as novidades?','{"com_alguma_tag":["vip","novo"],"limite":300}',9,1,interval '2 days','teto_de_gasto','A campanha atingiu o teto de gasto: R$ 150,00 de R$ 150,00. Aumente o teto da campanha para retomar.'),
 ('Aniversariantes de outubro','ready','{{saudacao}}, {{primeiro_nome}}! A Loja Aurora deseja um feliz aniversário e preparou um presente para você. Responda QUERO que enviamos.','{"com_alguma_tag":["vip"],"limite":100}',5,0,interval '1 day',null,null),
 ('Black Friday — lista de espera','scheduled','Oi, {{primeiro_nome}}! Você está na lista de espera da Black Friday da Loja Aurora. Em breve mandamos o link exclusivo.','{"com_alguma_tag":["novo"],"limite":200}',4,0,interval '3 hours',null,null),
 ('Pesquisa de satisfação — setembro','cancelled','Oi, {{primeiro_nome}}, tudo bem? Pode nos contar o que achou da sua última compra?','{"sem_interacao_ha_dias":30,"limite":150}',7,0,interval '12 days',null,null),
 ('Novos clientes — boas-vindas','draft','Oi, {{primeiro_nome}}! Seja bem-vindo(a) à Loja Aurora. Qualquer dúvida é só chamar por aqui.','{"com_alguma_tag":["novo"],"limite":100}',0,0,interval '4 hours',null,null)
) as v(nome, st, msg, filtro, el, ex, d, pm, pd);

-- destinatários da campanha concluída (12 contatos: 10 elegíveis, 2 excluídos)
insert into campaign_recipients (organization_id, campaign_id, contact_id, status, eligibility_status, exclusion_reason, recipient_address, rendered_body, sent_at, delivered_at, read_at, replied_at, opted_out_at, last_error_detail)
select :org, c.id, ct.id, v.st, v.el, v.motivo, case when v.el = 'eligible' then ct.phone_number end,
  case when v.el = 'eligible' then 'Oi, ' || split_part(ct.name,' ',1) || '! Faz um tempinho que você não passa por aqui.' end,
  case when v.nivel >= 1 then now() - interval '6 days' + make_interval(mins => v.i) end,
  case when v.nivel >= 2 then now() - interval '6 days' + make_interval(mins => v.i + 1) end,
  case when v.nivel >= 3 then now() - interval '6 days' + make_interval(mins => v.i + 30) end,
  case when v.nivel >= 4 then now() - interval '6 days' + make_interval(mins => v.i + 90) end,
  case when v.st = 'opted_out' then now() - interval '6 days' + interval '3 hours' end,
  v.erro
from campaigns c
join (values
 ('Ana Paula Ferreira','replied','eligible',null,4,0,null),
 ('Carlos Eduardo Lima','read','eligible',null,3,5,null),
 ('Juliana Martins','read','eligible',null,3,10,null),
 ('Rafael Costa','delivered','eligible',null,2,15,null),
 ('Beatriz Oliveira','replied','eligible',null,4,20,null),
 ('Marcos Vinícius Rocha','sent','eligible',null,1,25,null),
 ('Fernanda Alves','delivered','eligible',null,2,30,null),
 ('Lucas Pereira','failed','eligible',null,1,35,'O número não tem WhatsApp.'),
 ('Camila Santos','opted_out','excluded','opt_out',1,40,null),
 ('Rodrigo Nunes','skipped','excluded','sem_telefone',0,0,null),
 ('Patrícia Gomes','delivered','eligible',null,2,45,null),
 ('Thiago Barbosa','read','eligible',null,3,50,null)
) as v(nome, st, el, motivo, nivel, i, erro) on true
join contacts ct on ct.organization_id = :org and ct.name = v.nome
where c.organization_id = :org and c.name = 'Reativação de clientes parados';

-- lista pronta da campanha "Aniversariantes": 5 pendentes
insert into campaign_recipients (organization_id, campaign_id, contact_id, status, eligibility_status, recipient_address, rendered_body)
select :org, c.id, ct.id, 'pending', 'eligible', ct.phone_number, 'Feliz aniversário, ' || split_part(ct.name,' ',1) || '!'
from campaigns c join contacts ct on ct.organization_id = :org and ct.name in ('Ana Paula Ferreira','Beatriz Oliveira','Camila Santos','Patrícia Gomes','Thiago Barbosa')
where c.organization_id = :org and c.name = 'Aniversariantes de outubro';

-- Configuração: textos salvos e lista de exclusão
insert into campaign_templates (organization_id, name, body) values
 (:org, 'Primeiro contato — varejo', 'Oi, {{primeiro_nome}}! Aqui é da Loja Aurora. Posso te mostrar as novidades da semana?'),
 (:org, 'Reativação — cupom', '{{saudacao}}, {{primeiro_nome}}! Sentimos sua falta. Use o cupom VOLTEI10 e ganhe 10% no próximo pedido.'),
 (:org, 'Pesquisa rápida', 'Oi, {{primeiro_nome}}! De 0 a 10, quanto você recomendaria a Loja Aurora a um amigo?');
insert into campaign_suppressions (organization_id, recipient_address_hash, address_tail, reason, source) values
 (:org, encode(digest('+5511900000001','sha256'),'hex'), '0001', 'Pediu por telefone para não receber promoções', 'manual'),
 (:org, encode(digest('+5511900000002','sha256'),'hex'), '0002', 'Número da equipe de testes', 'manual');
commit;

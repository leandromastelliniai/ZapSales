-- Dados FICTÍCIOS para a tela Desempenho: chances por etapa, previsão, ganhos e perdas dos últimos 30 dias.
-- Uso: psql -v ON_ERROR_STOP=1 -v org="'<uuid>'" -v usr="'<uuid>'" -f semear-desempenho.sql
begin;
update crm_stages s set win_probability = v.p
from (values ('Carrinho abandonado',10),('Aguardando pagamento',50),('Em separação',80),('Enviado',90),('Entregue',95),('Pós-venda',95)) v(n, p)
where s.organization_id = :org and s.name = v.n and not s.is_won and not s.is_lost;

update crm_leads set expected_close_date = (now() + make_interval(days => 5 + (abs(hashtext(id::text)) % 40)::int))::date
where organization_id = :org and status = 'open';

-- 5 negócios ganhos e 4 perdidos no período (inseridos já fechados)
insert into crm_leads (organization_id, pipeline_id, stage_id, contact_id, title, value_cents, owner_user_id, status, position_in_stage, closed_at, last_activity_at, source, lost_reason, lost_from_stage_id)
select :org, p.id, case when v.st = 'won' then (select id from crm_stages where pipeline_id = p.id and is_won limit 1) else (select id from crm_stages where pipeline_id = p.id and is_lost limit 1) end,
  c.id, v.titulo, v.valor, :usr::uuid, v.st, 1000, now() - make_interval(days => v.d), now() - make_interval(days => v.d), 'manual',
  v.motivo, case when v.st = 'lost' then (select id from crm_stages where pipeline_id = p.id and name = 'Aguardando pagamento' limit 1) end
from (values
 ('Ana Paula Ferreira','Pedido recorrente — kit skincare','won',32900,2,null),
 ('Carlos Eduardo Lima','Pedido — conjunto de toalhas','won',18900,5,null),
 ('Juliana Martins','Pedido — vestido midi','won',24900,9,null),
 ('Rafael Costa','Pedido — tênis','won',39900,14,null),
 ('Beatriz Oliveira','Pedido — bolsa de couro','won',45900,21,null),
 ('Marcos Vinícius Rocha','Pedido — camisas','lost',27800,3,'price'),
 ('Fernanda Alves','Pedido — perfume','lost',31900,8,'no_response'),
 ('Lucas Pereira','Pedido — fones','lost',21900,12,'no_response'),
 ('Camila Santos','Pedido — luminárias','lost',14900,18,'price')
) v(cliente, titulo, st, valor, d, motivo)
join contacts c on c.organization_id = :org and c.name = v.cliente
join crm_pipelines p on p.organization_id = :org and p.slug = 'pedidos';
commit;

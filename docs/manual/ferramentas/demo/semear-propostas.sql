-- Dados FICTÍCIOS de propostas (nada é enviado). Exige MODULO_PROPOSTAS ligado e settings.proposals.enabled=true.
-- Uso: psql -v ON_ERROR_STOP=1 -v org="'<uuid>'" -f semear-propostas.sql
begin;
insert into crm_proposals (organization_id, lead_id, contact_id, titulo, status, numero, ano, versao, total_cents, moeda, valid_until, sent_at, decided_at, decision_reason, condicoes, pagamento, prazo_dias_uteis, template_slug, template_version, drafted_by_agent_id, created_at, updated_at)
select :org, l.id, l.contact_id, v.titulo, v.st, v.num, case when v.num is null then null else 2026 end, 1, v.total, 'BRL',
  (now() + make_interval(days => v.valido))::date,
  case when v.st in ('enviada','aceita','recusada','vencida') then now() - make_interval(days => v.d) end,
  case when v.st in ('aceita','recusada') then now() - make_interval(days => v.d - 1) end,
  case when v.st = 'recusada' then 'Escolheu outro fornecedor' end,
  'Pagamento em até 3x sem juros no cartão ou 5% de desconto à vista via Pix.',
  case when v.st <> 'rascunho' or v.num is null then '50% no aceite e 50% na entrega' end,
  15,
  case when v.tpl then 'projeto_personalizado' end, case when v.tpl then 1 end,
  case when v.ia then (select id from ai_agents where organization_id = :org order by created_at limit 1) end,
  now() - make_interval(days => v.d), now() - make_interval(days => v.d)
from (values
 ('Rafael Costa','Proposta — Kit de tênis para a equipe','rascunho',null::int,39900,10,0,false,true),
 ('Juliana Martins','Orçamento — Vestidos para evento','rascunho',null,49800,12,1,true,false),
 ('Ana Paula Ferreira','Proposta — Linha skincare para revenda','enviada',1,329000,8,4,true,false),
 ('Camila Santos','Proposta — Iluminação da loja nova','enviada',2,149000,12,2,true,false),
 ('Beatriz Oliveira','Proposta — Bolsas corporativas','aceita',3,459000,-5,9,true,false),
 ('Marcos Vinícius Rocha','Proposta — Uniformes sociais','recusada',4,278000,-8,12,true,false),
 ('Fernanda Alves','Proposta — Perfumes para presente','vencida',5,319000,-3,20,true,false),
 ('Lucas Pereira','Orçamento — Fones corporativos','cancelada',null,219000,5,6,false,false)
) as v(cliente, titulo, st, num, total, valido, d, tpl, ia)
join contacts c on c.organization_id = :org and c.name = v.cliente
join crm_leads l on l.organization_id = :org and l.contact_id = c.id;
update crm_proposals set status = 'cancelada' where organization_id = :org and titulo like 'Orçamento — Fones%';

insert into crm_proposal_items (organization_id, proposal_id, descricao, position, preco_unitario_cents, quantidade, desconto_cents)
select :org, p.id, v.descr, v.pos, v.preco, v.qtd, v.desconto
from crm_proposals p join (values
 ('Proposta — Kit de tênis para a equipe','Tênis esportivo (par)',0,39900,1,0),
 ('Orçamento — Vestidos para evento','Vestido midi floral',0,24900,2,0),
 ('Proposta — Linha skincare para revenda','Kit skincare completo',0,32900,10,0),
 ('Proposta — Iluminação da loja nova','Luminária de mesa',0,14900,10,0)
) v(titulo, descr, pos, preco, qtd, desconto) on v.titulo = p.titulo
where p.organization_id = :org;

insert into crm_proposal_counters (organization_id, ano, ultimo_numero) values (:org, 2026, 5) on conflict do nothing;

-- um modelo da empresa e um modelo da plataforma desligado
insert into proposal_templates (organization_id, slug, nome, descricao, sections, section_order)
values (:org, 'empresa_locacao_por_temporada', 'Locação por temporada', 'Proposta para clientes de locação de fim de semana',
  '[{"id":"resumo","title":"Resumo da proposta","title_es":null,"body":"Proposta para {{client.company_or_name}} — {{project.name}}.","body_es":null,"required":true,"conditional":false},{"id":"servicos","title":"O que está incluído","title_es":null,"body":"{{included.list}}","body_es":null,"required":true,"conditional":false},{"id":"investimento","title":"Investimento","title_es":null,"body":"Valor total: {{investment.total_formatted}}.","body_es":null,"required":true,"conditional":false}]'::jsonb,
  array['resumo','servicos','investimento']);
update organizations set settings = jsonb_set(settings, '{proposals}', '{"enabled":true,"default_valid_days":15,"default_conditions":"Pagamento em até 3x sem juros no cartão.","followup_dias":3,"avisar_no_whatsapp":true,"modelos_ocultos":["ecommerce"]}'::jsonb, true) where id = :org;
commit;

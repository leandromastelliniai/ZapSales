-- Dados FICTÍCIOS: ~140 atividades nos últimos 20 dias (equipe, agente de IA e sistema).
-- Uso: psql -v ON_ERROR_STOP=1 -v org="'<uuid>'" -v usr="'<uuid>'" -f semear-atividades.sql
begin;
insert into crm_lead_activities (organization_id, lead_id, contact_id, source_module, type, payload, performed_at, performed_by_user_id, actor_kind, actor_agent_id, reason, evidence)
select :org, l.id, l.contact_id, 'crm', t.tipo, '{}'::jsonb,
  now() - make_interval(hours => (g.i * 3 + (abs(hashtext(l.id::text || g.i::text)) % 9))::int),
  case when t.ator = 'user' then :usr::uuid end,
  t.ator,
  case when t.ator = 'ai' then (select id from ai_agents where organization_id = :org order by created_at limit 1) end,
  case when t.tipo = 'note' then 'Cliente pediu orçamento por WhatsApp' when t.tipo = 'handoff_triggered' then 'Cliente pediu para falar com uma pessoa' end,
  case when t.ator = 'ai' then '{"run_ids":["00000000-0000-4000-8000-000000000001"]}'::jsonb end
from generate_series(1, 14) g(i)
cross join lateral (select * from crm_leads where organization_id = :org order by id limit 12) l
join (values
 (1,'stage_changed','user'),(2,'note','user'),(3,'ai_turn','ai'),(4,'followup_scheduled','system'),(5,'ai_turn','ai'),
 (6,'appointment_scheduled','user'),(7,'handoff_triggered','ai'),(8,'lead_edited','user'),(9,'task_created','user'),(10,'lead_cooled','system'),
 (11,'conversation_claimed','user'),(12,'proposal_sent','user'),(13,'ai_turn','ai'),(14,'stage_changed','system')
) as t(n, tipo, ator) on t.n = g.i;
commit;

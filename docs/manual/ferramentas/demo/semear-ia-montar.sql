-- Dados FICTÍCIOS: IA (montar o agente) para a organização de demonstração do manual.
-- Uso:  psql -v ON_ERROR_STOP=1 -v org=<uuid da org> -v uid=<uuid do usuário> -f semear-ia-montar.sql
--       (aqui os uuid vão SEM aspas: o arquivo usa :'org' e :'uid')
-- Roda DEPOIS de semear.sql e semear-ia-acompanhar.sql.
--
-- SEGURANÇA — leia antes de rodar numa instalação com WORKER ligado:
--  * As credenciais têm chave cifrada de mentira: a chave só seria decifrada se um agente de verdade
--    rodasse, e não há conversa chegando para ele.
--  * Todas as datas de próximo disparo dos follow-ups estão no FUTURO (3 a 5 dias). Apague a
--    organização de demonstração antes disso.
--  * O canal usa o nome reservado `e2e-numero-conectado` (o vigia de saúde o ignora).
--  * Não clique, nos prints, em "Salvar e validar", "Revalidar", "Executar teste", "Testar
--    classificação", "Testar" (mapas) nem "Ligar o Jev": esses botões chamam serviços externos.

-- o canal inerte criado por semear.sql passa a "conectado" (só para poder publicar um agente)
select id as cs from channel_sessions where organization_id = :'org' limit 1 \gset
update channel_sessions set status = 'WORKING', display_name = 'Atendimento da loja', phone_number = '+551140000000' where id = :'cs';

-- ===== Credenciais =====
insert into public.ai_provider_credentials
  (id, organization_id, provider, label, api_key_encrypted, api_key_iv, api_key_tag, api_key_last4,
   validated_at, validation_error, models_available, is_active, created_by, created_at)
values
  ('c0000000-0000-4000-8000-000000000001', :'org', 'anthropic', 'Chave da loja',
   decode('00','hex'), decode('000000000000000000000000','hex'), decode('00000000000000000000000000000000','hex'), 'a1B2',
   now(), null, array['claude-sonnet-5','claude-haiku-4-5','claude-opus-5'], true, :'uid', now() - interval '20 days'),
  ('c0000000-0000-4000-8000-000000000002', :'org', 'openai', 'OpenAI - testes',
   decode('00','hex'), decode('000000000000000000000000','hex'), decode('00000000000000000000000000000000','hex'), 'x9Zq',
   null, 'auth_failed_401', null, true, :'uid', now() - interval '3 days'),
  ('c0000000-0000-4000-8000-000000000003', :'org', 'google', 'Google (reserva)',
   decode('00','hex'), decode('000000000000000000000000','hex'), decode('00000000000000000000000000000000','hex'), 'Kp7w',
   now() - interval '10 days', null, array['gemini-2.5-flash'], false, :'uid', now() - interval '10 days'),
  ('c0000000-0000-4000-8000-000000000004', :'org', 'openrouter', 'OpenRouter - experimento',
   decode('00','hex'), decode('000000000000000000000000','hex'), decode('00000000000000000000000000000000','hex'), 'q2Lm',
   null, null, null, true, :'uid', now() - interval '1 day')
on conflict (organization_id, provider, label) do nothing;

-- ===== Agentes =====
insert into public.ai_agents
  (id, organization_id, name, description, is_active, is_default, model, system_prompt, kind, priority, operation_mode, created_by, archived_at)
values
  ('a0000000-0000-4000-8000-000000000001', :'org', 'Atendente da Loja',
   'Responde dúvidas, confirma pedidos e chama a equipe quando precisa.', false, true,
   'claude-sonnet-5', 'Você é a atendente virtual da Loja Aurora. Seja cordial, objetiva e nunca prometa desconto sem confirmar com a equipe.',
   'mcp_agent', 10, 'automatic', :'uid', null),
  ('a0000000-0000-4000-8000-000000000002', :'org', 'Vendas - Pedidos',
   'Qualifica quem quer comprar e move o negócio no funil.', false, false,
   'claude-haiku-4-5', 'Você é uma consultora de vendas. Descubra o que o cliente procura antes de falar em preço.',
   'mcp_agent', 5, 'automatic', :'uid', null),
  ('a0000000-0000-4000-8000-000000000003', :'org', 'Agente antigo (arquivado)',
   null, false, false, 'claude-haiku-4-5', 'Agente descontinuado.', 'mcp_agent', 0, 'automatic', :'uid', now() - interval '10 days');

insert into public.ai_agent_versions
  (id, organization_id, agent_id, version_number, system_prompt, provider, model, credential_id, channel_session_id,
   tool_ids, handoff_keywords, cases_enabled, status, created_by, created_at)
values
  ('d0000000-0000-4000-8000-000000000001', :'org', 'a0000000-0000-4000-8000-000000000001', 1,
   'Você é a atendente virtual da Loja Aurora. Seja cordial, objetiva e nunca prometa desconto sem confirmar com a equipe.',
   'anthropic', 'claude-sonnet-5', 'c0000000-0000-4000-8000-000000000001', :'cs',
   array['crm_search_contacts','crm_get_contact','crm_get_conversation_history','crm_list_event_types','crm_find_free_slots','crm_list_available_attendants','crm_manage_tags'],
   array['falar com humano','atendente','pessoa real'], true, 'draft', :'uid', now() - interval '45 days'),
  ('d0000000-0000-4000-8000-000000000002', :'org', 'a0000000-0000-4000-8000-000000000001', 2,
   'Você é a atendente virtual da Loja Aurora. Seja cordial e objetiva. Nunca prometa desconto sem confirmar com a equipe. Ofereça sempre o frete grátis acima de R$ 299.',
   'anthropic', 'claude-sonnet-5', 'c0000000-0000-4000-8000-000000000001', :'cs',
   array['crm_search_contacts','crm_get_contact','crm_get_conversation_history','crm_list_event_types','crm_find_free_slots','crm_list_available_attendants','crm_manage_tags','crm_schedule_followup'],
   array['falar com humano','atendente','pessoa real'], true, 'draft', :'uid', now() - interval '1 day'),
  ('d0000000-0000-4000-8000-000000000003', :'org', 'a0000000-0000-4000-8000-000000000002', 1,
   'Você é uma consultora de vendas. Descubra o que o cliente procura antes de falar em preço.',
   'anthropic', 'claude-haiku-4-5', null, null,
   array['crm_list_leads','crm_create_lead','crm_move_lead_stage'], array['atendente'], false, 'draft', :'uid', now() - interval '2 days');

select * from public.fn_publish_ai_agent_version(:'org', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', false, null);

-- ===== Execuções do agente e uso das capacidades =====
insert into public.ai_agent_runs
  (id, organization_id, agent_id, agent_version_id, status, tokens_in, tokens_out, cost_cents, latency_ms, steps_count, tool_calls, is_dry_run, started_at, completed_at)
values
  ('e0000000-0000-4000-8000-000000000001', :'org', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'completed', 1840, 212, 0.4130, 4200, 2,
   '[{"step":1,"tool_name":"crm_search_contacts","args":{"query":"Maria"},"result":{"matches":1},"latency_ms":320,"started_at":"2026-10-14T13:00:00Z","ended_at":"2026-10-14T13:00:01Z"},
     {"step":2,"tool_name":"crm_find_free_slots","args":{"days":3},"result":{"slots":4},"latency_ms":510,"started_at":"2026-10-14T13:00:02Z","ended_at":"2026-10-14T13:00:03Z"}]'::jsonb,
   false, now() - interval '2 hours', now() - interval '2 hours' + interval '4 seconds'),
  ('e0000000-0000-4000-8000-000000000002', :'org', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'completed', 960, 140, 0.2000, 2900, 1,
   '[{"step":1,"tool_name":"crm_get_contact","args":{"contact_id":"demo"},"result":{"ok":true},"latency_ms":210}]'::jsonb,
   true, now() - interval '1 day', now() - interval '1 day' + interval '3 seconds'),
  ('e0000000-0000-4000-8000-000000000003', :'org', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'failed', 700, 0, 0.0800, 1500, 1,
   '[{"step":1,"tool_name":"crm_find_free_slots","args":{"days":3},"error":"Agenda indisponível"}]'::jsonb,
   false, now() - interval '3 days', now() - interval '3 days' + interval '2 seconds');
update public.ai_agent_runs set error_code = 'tool_error', error_message = 'A ferramenta de agenda não respondeu.'
 where id = 'e0000000-0000-4000-8000-000000000003';

insert into public.api_audit_log (organization_id, action, request_id, metadata, created_at) values
  (:'org','mcp.tool_called','e0000000-0000-4000-8000-000000000001','{"tool_name":"crm_search_contacts","success":true}', now() - interval '2 hours'),
  (:'org','mcp.tool_called','e0000000-0000-4000-8000-000000000001','{"tool_name":"crm_find_free_slots","success":true}',  now() - interval '2 hours'),
  (:'org','mcp.tool_called','e0000000-0000-4000-8000-000000000002','{"tool_name":"crm_get_contact","success":true}',      now() - interval '1 day'),
  (:'org','mcp.tool_called','e0000000-0000-4000-8000-000000000003','{"tool_name":"crm_find_free_slots","success":false}', now() - interval '3 days');

-- ===== Propostas do agente (flywheel) =====
insert into public.flywheel_distiller_proposals (organization_id, run_id, dataset, type, target, content, evidence, proposed_at, applied_at) values
  (:'org', gen_random_uuid(), 'demo', 'playbook_bullet', 'atendimento',
   'Quando o cliente perguntar o prazo de entrega, explique que depende do CEP e peça o CEP antes de citar dias.',
   '{"trace_ids":[],"run_ids":[],"taxa":0.82,"amostra":40}'::jsonb, now() - interval '2 days', null),
  (:'org', gen_random_uuid(), 'demo', 'golden_case', 'troca',
   'Caso exemplar: cliente pede troca; o agente confirma o pedido, explica o prazo de 30 dias e envia as instruções por escrito.',
   '{"trace_ids":[],"run_ids":[],"taxa":0.9,"amostra":25}'::jsonb, now() - interval '5 days', null),
  (:'org', gen_random_uuid(), 'demo', 'org_memory_entry', 'regras da empresa',
   'A loja atende de segunda a sábado, das 9h às 18h; domingo só mensagens, sem atendimento.',
   '{"trace_ids":[],"run_ids":[],"taxa":1,"amostra":12}'::jsonb, now() - interval '1 day', null);

-- ===== Follow-ups =====
insert into public.followup_flow_versions (id, organization_id, graph) values
 ('f1000000-0000-4000-8000-000000000001', :'org', '{
  "nodes":[
   {"id":"inicio","type":"trigger","label":"Início","position":{"x":0,"y":0},"config":{}},
   {"id":"espera-1","type":"wait","label":"Espera 1 dia","position":{"x":260,"y":0},"config":{"mode":"fixed","duration_ms":86400000}},
   {"id":"msg-1","type":"action","label":"Retoma a conversa","position":{"x":520,"y":0},"config":{"mode":"text","body":"Oi! Passando para saber se ainda posso ajudar com o seu pedido."}},
   {"id":"fim-esgotou","type":"end","label":"Fim: sem resposta","position":{"x":780,"y":0},"config":{"outcome":"exhausted"}}],
  "edges":[
   {"id":"e1","source":"inicio","target":"espera-1","priority":0,"condition":{"type":"always"}},
   {"id":"e2","source":"espera-1","target":"msg-1","priority":0,"condition":{"type":"always"}},
   {"id":"e3","source":"msg-1","target":"fim-esgotou","priority":0,"condition":{"type":"always"}}]}'::jsonb);

insert into public.followup_flow_pointers (id, organization_id, name, status, active_version_id, draft_graph, handoff_policy, trigger_config, surface)
select 'f2000000-0000-4000-8000-000000000001', :'org', 'Recuperação de carrinho abandonado', 'active',
       'f1000000-0000-4000-8000-000000000001', v.graph, 'pause',
       '{"kind":"silence","params":{"threshold_minutes":1440},"cancel_on_reply":true}'::jsonb, 'followup'
  from public.followup_flow_versions v where v.id = 'f1000000-0000-4000-8000-000000000001';
update public.followup_flow_versions set pointer_id = 'f2000000-0000-4000-8000-000000000001' where id = 'f1000000-0000-4000-8000-000000000001';

insert into public.followup_flow_pointers (id, organization_id, name, status, draft_graph, handoff_policy, trigger_config, surface)
select 'f2000000-0000-4000-8000-000000000002', :'org', 'Boas-vindas ao cliente novo', 'draft', v.graph, 'pause', '{"kind":"lead_created"}'::jsonb, 'followup'
  from public.followup_flow_versions v where v.id = 'f1000000-0000-4000-8000-000000000001';
insert into public.followup_flow_pointers (id, organization_id, name, status, draft_graph, handoff_policy, trigger_config, surface)
select 'f2000000-0000-4000-8000-000000000003', :'org', 'Cobrança suave (desativado)', 'disabled', v.graph, 'cancel', '{"kind":"manual"}'::jsonb, 'followup'
  from public.followup_flow_versions v where v.id = 'f1000000-0000-4000-8000-000000000001';

insert into public.followup_enrollments
  (id, organization_id, pointer_id, version_id, contact_id, current_node_id, status, next_eval_at, steps_taken, outcome, completed_at, cancel_reason, last_error, agent_id, started_at)
select x.id::uuid, :'org', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', c.id,
       x.no, x.st, x.prox, x.passos, x.res, x.fim, null, null, x.ag::uuid, x.ini
from (values
  ('f3000000-0000-4000-8000-000000000001','Ana Paula Ferreira','espera-1','active', now() + interval '3 days', 1, null::text, null::timestamptz, 'a0000000-0000-4000-8000-000000000001', now() - interval '1 day'),
  ('f3000000-0000-4000-8000-000000000002','Carlos Eduardo Lima','msg-1','waiting_reply', now() + interval '4 days', 2, null, null, 'a0000000-0000-4000-8000-000000000001', now() - interval '3 days'),
  ('f3000000-0000-4000-8000-000000000003','Fernanda Alves','espera-1','paused_manual', null::timestamptz, 1, null, null, null, now() - interval '2 days'),
  ('f3000000-0000-4000-8000-000000000004','Beatriz Oliveira','fim-esgotou','completed', null::timestamptz, 3, 'converted', now() - interval '1 day', null, now() - interval '6 days')
) as x(id, nome, no, st, prox, passos, res, fim, ag, ini)
join contacts c on c.organization_id = :'org' and c.name = x.nome;

insert into public.followup_enrollment_events (organization_id, enrollment_id, node_id, event_type, payload, created_at) values
  (:'org','f3000000-0000-4000-8000-000000000001','inicio','node_advanced','{"next_node_id":"espera-1"}', now() - interval '1 day'),
  (:'org','f3000000-0000-4000-8000-000000000001','espera-1','wait_started', jsonb_build_object('next_eval_at', (now() + interval '3 days')::text, 'mode', 'fixed'), now() - interval '1 day' + interval '1 second'),
  (:'org','f3000000-0000-4000-8000-000000000002','msg-1','action_sent','{}', now() - interval '3 days' + interval '2 hours'),
  (:'org','f3000000-0000-4000-8000-000000000004','fim-esgotou','flow_completed','{"outcome":"converted"}', now() - interval '1 day');

insert into public.cron_jobs (organization_id, contact_id, kind, job_kind, payload, next_run_at, enabled, tz)
select :'org', c.id, 'at', 'followup_turn', '{"reason":"Cliente pediu retorno na quinta de manhã","promise":"Retorno na quinta às 9h"}'::jsonb,
       now() + interval '5 days', true, 'America/Sao_Paulo'
from contacts c where c.organization_id = :'org' and c.name = 'Ana Paula Ferreira';

-- ===== Roteador =====
insert into public.ai_routers (id, organization_id, name, channel_session_id, is_active, fallback_agent_id, created_by)
values ('70000000-0000-4000-8000-000000000001', :'org', 'Roteador de vendas e suporte', :'cs', true, 'a0000000-0000-4000-8000-000000000001', :'uid');
insert into public.ai_router_members (organization_id, router_id, agent_id, intent_name, intent_description, examples, position) values
  (:'org','70000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','quer comprar',
   'O cliente pede preço, disponibilidade ou quer fazer um pedido.', array['quanto custa?','quero fazer um pedido'], 0),
  (:'org','70000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','já é cliente',
   'O cliente já comprou e quer acompanhar o pedido, trocar ou reclamar.', array['onde está meu pedido?'], 1);

-- ===== Provedores =====
update public.organizations
   set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{llm}', '{"provider":"anthropic","default_model":"claude-sonnet-5"}'::jsonb)
 where id = :'org';
insert into public.ai_purpose_bindings (organization_id, purpose, provider, credential_id, model_id)
values (:'org', 'intent_router', 'anthropic', 'c0000000-0000-4000-8000-000000000001', 'claude-haiku-4-5')
on conflict (organization_id, purpose) do update set model_id = excluded.model_id;

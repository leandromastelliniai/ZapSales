-- Dados FICTÍCIOS: IA (ensinar e acompanhar) para a organização de demonstração do manual.
-- Uso:  psql -v ON_ERROR_STOP=1 -v org="'<uuid da org>'" -v usr="'<uuid do usuário>'" -f semear-ia-acompanhar.sql
-- Roda DEPOIS de semear.sql (precisa dos contatos, conversas e cartões dele).
-- Não chama provedor de IA nem envia mensagem: só grava linhas. Os vetores dos trechos são
-- constantes (sem embedding de verdade), suficientes para a tela "Ver o que ele aprendeu".

-- ===== Conhecimento =====
insert into ai_knowledge_sources (organization_id, source_type, name, status, is_active, source_metadata, last_index_status, last_index_error, last_indexed_at, chunks_count, ingested_at, created_at) values
 (:org,'faq','Perguntas frequentes da loja','ready',true,'{}','success',null, now()-interval '3 hours',6, now()-interval '2 days', now()-interval '2 days'),
 (:org,'documento','Política de troca','ready',true,'{"filename":"politica-de-troca.pdf","ext":"pdf","size_bytes":184320}','success',null, now()-interval '1 day',4, now()-interval '3 days', now()-interval '3 days'),
 (:org,'documento','Tabela de preços','ready',true,'{"filename":"tabela-de-precos.pdf","ext":"pdf","size_bytes":96256}','failed','O PDF não tem texto selecionável', now()-interval '5 hours',0, now()-interval '5 hours', now()-interval '5 hours'),
 (:org,'documento','Catálogo antigo (2025)','archived',false,'{"filename":"catalogo-2025.pdf","ext":"pdf","size_bytes":402000}','success',null, now()-interval '40 days',9, now()-interval '60 days', now()-interval '60 days');

insert into ai_knowledge_versions (organization_id, version_number, is_active, status, knowledge_source_id, embedding_model, embedding_dims, total_chunks, activated_at, indexed_at)
select :org, 1, true, 'ready', s.id, 'text-embedding-3-small', 1536, s.chunks_count, now(), now()
from ai_knowledge_sources s where s.organization_id = :org and s.name in ('Perguntas frequentes da loja','Política de troca');

update ai_knowledge_sources s set active_kb_version_id = v.id
from ai_knowledge_versions v where v.knowledge_source_id = s.id and s.organization_id = :org;

insert into ai_chunks (organization_id, knowledge_source_id, kb_version_id, position, content, content_hash, token_count, embedding)
select :org, s.id, s.active_kb_version_id, g.n, g.txt, md5(g.txt), 40 + g.n * 7, array_fill(0.001::real, array[1536])::vector
from ai_knowledge_sources s
join lateral (values
 ('Perguntas frequentes da loja', 0, 'Pergunta: Qual o prazo de entrega? Resposta: De 2 a 3 dias úteis após a confirmação do pagamento, para capitais. Interior: até 7 dias úteis.'),
 ('Perguntas frequentes da loja', 1, 'Pergunta: Vocês aceitam Pix? Resposta: Sim. Pagando por Pix o pedido é liberado na hora e você ganha 5% de desconto.'),
 ('Perguntas frequentes da loja', 2, 'Pergunta: Posso trocar um produto? Resposta: Pode, em até 30 dias após o recebimento, com a embalagem original e a nota fiscal.'),
 ('Perguntas frequentes da loja', 3, 'Pergunta: Como acompanho meu pedido? Resposta: Assim que o pedido é enviado, mandamos o código de rastreio aqui pelo WhatsApp.'),
 ('Perguntas frequentes da loja', 4, 'Pergunta: Vocês parcelam no cartão? Resposta: Parcelamos em até 6 vezes sem juros nas compras acima de R$ 150.'),
 ('Perguntas frequentes da loja', 5, 'Pergunta: O frete é grátis? Resposta: Frete grátis para compras acima de R$ 299 em todo o Brasil.'),
 ('Política de troca', 0, 'Política de troca. O cliente tem até 30 dias corridos, contados do recebimento, para solicitar a troca ou a devolução do produto.'),
 ('Política de troca', 1, 'Produtos de higiene e cosméticos abertos não podem ser trocados, salvo defeito de fabricação comprovado.'),
 ('Política de troca', 2, 'O frete da primeira troca é por nossa conta. A partir da segunda troca no mesmo pedido, o frete é do cliente.'),
 ('Política de troca', 3, 'O reembolso é feito na mesma forma de pagamento, em até 10 dias úteis após recebermos o produto de volta.')
) as g(nome, n, txt) on g.nome = s.name
where s.organization_id = :org;

insert into ai_faq_items (organization_id, knowledge_source_id, question, answer, locale, position)
select :org, s.id, q.q, q.a, 'pt-BR', q.p
from ai_knowledge_sources s, (values
 ('Qual o prazo de entrega?','De 2 a 3 dias úteis após a confirmação do pagamento, para capitais. Interior: até 7 dias úteis.',0),
 ('Vocês aceitam Pix?','Sim. Pagando por Pix o pedido é liberado na hora e você ganha 5% de desconto.',1),
 ('Posso trocar um produto?','Pode, em até 30 dias após o recebimento, com a embalagem original e a nota fiscal.',2),
 ('Como acompanho meu pedido?','Assim que o pedido é enviado, mandamos o código de rastreio aqui pelo WhatsApp.',3),
 ('Vocês parcelam no cartão?','Parcelamos em até 6 vezes sem juros nas compras acima de R$ 150.',4),
 ('O frete é grátis?','Frete grátis para compras acima de R$ 299 em todo o Brasil.',5)
) as q(q,a,p)
where s.organization_id = :org and s.name = 'Perguntas frequentes da loja';

-- ===== Memória =====
insert into org_memory_versions (organization_id, version_number, content, created_by, created_at) values
 (:org, 1, 'Chame o cliente pelo primeiro nome. Horário de atendimento: 9h às 18h, de segunda a sexta.', :usr, now()-interval '20 days'),
 (:org, 2, 'Chame o cliente pelo primeiro nome. Horário de atendimento: 9h às 18h, de segunda a sexta. Nunca prometa desconto sem confirmar com uma pessoa.', :usr, now()-interval '9 days'),
 (:org, 3, E'Chame o cliente pelo primeiro nome.\nHorário de atendimento: 9h às 18h, de segunda a sexta; sábado, das 9h às 13h.\nNunca prometa desconto sem confirmar com uma pessoa.\nSe o cliente pedir para falar com um atendente, passe a conversa na hora.\nNunca informe prazo de entrega sem consultar o CEP.', :usr, now()-interval '2 days');
insert into org_memory_pointers (organization_id, version_id)
select :org, id from org_memory_versions where organization_id = :org and version_number = 3;
insert into org_memory_entries (organization_id, title, body, source, status, created_by, created_at) values
 (:org, 'Não oferecer frete grátis no primeiro contato', 'O frete grátis só vale para compras acima de R$ 299. Não ofereça antes de o cliente escolher os produtos.', 'manual', 'active', :usr, now()-interval '6 days'),
 (:org, 'Clientes de Pix preferem o link direto', 'Quando o cliente disser que vai pagar por Pix, envie o link de pagamento na mesma mensagem, sem perguntar de novo.', 'flywheel', 'active', null, now()-interval '4 days'),
 (:org, 'Cliente pediu o endereço da loja física', 'Não temos loja física: o atendimento é só online. Explique isso com simpatia e ofereça ajuda por aqui.', 'agent', 'active', null, now()-interval '1 day'),
 (:org, 'Promoção de agosto', 'A promoção de agosto terminou. Não mencione mais descontos dessa campanha.', 'manual', 'archived', :usr, now()-interval '30 days');

-- ===== Skills =====
insert into skill_versions (organization_id, name, description, body, matcher, forked_from_version_id)
select :org, 'agendamento', v.description, v.body, v.matcher, v.id
from skill_pointers p join skill_versions v on v.id = p.version_id
where p.organization_id is null and p.name = 'agendamento';
insert into skill_pointers (organization_id, name, version_id)
select :org, 'agendamento', v.id from skill_versions v where v.organization_id = :org and v.name = 'agendamento';

insert into skill_versions (organization_id, name, description, body, matcher)
values (:org, 'saudacao-da-loja', 'Como abrir a conversa com quem chega pela primeira vez na Loja Aurora.',
 E'# Saudação da Loja Aurora\n\n1. Cumprimente pelo primeiro nome, se souber.\n2. Diga que é a assistente virtual da Loja Aurora.\n3. Pergunte em que pode ajudar, em uma frase curta.\n4. Nunca mande mais de 3 linhas na primeira mensagem.',
 '{"any_keywords":["oi","olá","bom dia","boa tarde"]}');
insert into skill_pointers (organization_id, name, version_id)
select :org, 'saudacao-da-loja', id from skill_versions where organization_id = :org and name = 'saudacao-da-loja';

-- ===== Casos =====
insert into agent_cases (organization_id, conversation_id, lead_id, status, title, summary, blocker, kind, source, opened_at, closed_at)
select :org, cv.id, (select id from crm_leads l where l.contact_id = c.id and l.organization_id = :org limit 1),
       x.status, x.titulo, x.resumo, x.bloqueio, x.tipo, x.origem, now() - (x.h || ' hours')::interval,
       case when x.status in ('resolved','escalated') then now() - (x.h || ' hours')::interval + interval '40 minutes' end
from (values
 ('Juliana Martins','awaiting_human','Cliente diz que já pagou e quer confirmação','A cliente fez um Pix de R$ 249 há 30 minutos e quer saber se o pedido foi liberado.','Não consigo ver o extrato bancário para confirmar o pagamento.','financeiro','agent',2),
 ('Ana Paula Ferreira','awaiting_human','Pergunta sobre kit em tamanho grande','A cliente quer o kit skincare no tamanho grande e eu não encontrei essa variação no catálogo.','O material não diz se o kit existe no tamanho grande.','duvida','agent',5),
 ('Carlos Eduardo Lima','awaiting_lead','Prazo de entrega para o interior','O cliente pediu o prazo de entrega, mas ainda não informou o CEP.','Preciso do CEP para calcular o prazo.','outro','agent',20),
 ('Beatriz Oliveira','resolved','Troca de bolsa com defeito no zíper','A cliente recebeu a bolsa com o zíper emperrado e pediu a troca.','A política de troca por defeito exige aprovação de uma pessoa.','problema','agent',72),
 ('Rafael Costa','escalated','Cliente pediu para falar com um atendente','O cliente quer negociar o valor de um pedido grande.','Negociação de valor está fora do que posso fazer.','outro','guardrail_autofallback',110)
) as x(nome, status, titulo, resumo, bloqueio, tipo, origem, h)
join contacts c on c.organization_id = :org and c.name = x.nome
join conversations cv on cv.organization_id = :org and cv.contact_id = c.id;

insert into agent_case_events (organization_id, case_id, kind, actor_kind, body, created_at)
select :org, ac.id, 'opened', 'agent', 'A IA abriu o caso: ' || ac.title, ac.opened_at from agent_cases ac where ac.organization_id = :org and ac.source = 'agent';
insert into agent_case_events (organization_id, case_id, kind, actor_kind, body, created_at)
select :org, ac.id, 'opened', 'system', 'O sistema abriu o caso automaticamente.', ac.opened_at from agent_cases ac where ac.organization_id = :org and ac.source = 'guardrail_autofallback';
insert into agent_case_events (organization_id, case_id, kind, actor_kind, human_action, actor_user_id, body, created_at)
select :org, ac.id, 'human_replied', 'human', 'resolved', :usr, 'Trocamos a bolsa; o novo pedido já saiu.', ac.closed_at from agent_cases ac where ac.organization_id = :org and ac.status = 'resolved';
insert into agent_case_events (organization_id, case_id, kind, actor_kind, body, created_at)
select :org, ac.id, 'lead_asked', 'agent', 'Perguntei o CEP ao cliente.', ac.opened_at + interval '3 minutes' from agent_cases ac where ac.organization_id = :org and ac.status = 'awaiting_lead';

-- ===== Alertas (Central de avisos) =====
insert into agent_inbox_items (organization_id, kind, severity, title, body, ref_kind, ref_id, status, created_at, resolved_at)
select :org, x.kind, x.sev, x.titulo, x.corpo, x.rk,
       case x.rk when 'agent_case' then (select id from agent_cases where organization_id = :org and title like x.ref || '%' limit 1)
                 when 'ai_knowledge_source' then (select id from ai_knowledge_sources where organization_id = :org and name = x.ref limit 1)
                 else (:org)::uuid end,
       x.st, now() - (x.h || ' hours')::interval, case when x.st = 'resolved' then now() - (x.h || ' hours')::interval + interval '3 hours' end
from (values
 ('qr_rescan','critical','Conexão do WhatsApp caiu — precisa escanear o QR de novo','O número da Loja Aurora parou de receber mensagens.','organization','',  'open', 1),
 ('case_stale','warn','Um atendimento espera decisão da equipe','Cliente diz que já pagou e quer confirmação.','agent_case','Cliente diz que já pagou','open', 2),
 ('conhecimento_nao_indexado','warn','Um material que você enviou não entrou na base de conhecimento','O agente ainda não sabe o que está neste material. Motivo: O PDF não tem texto selecionável.','ai_knowledge_source','Tabela de preços','open', 5),
 ('budget_warning','info','O gasto de IA passou do aviso que você definiu','O gasto do mês chegou a 72% do limite.','organization','','open', 26),
 ('case_stale','warn','Um atendimento espera decisão da equipe','Troca de bolsa com defeito no zíper.','agent_case','Troca de bolsa','resolved', 74),
 ('message_send_stuck','warn','Uma resposta ficou presa e não chegou ao cliente','Uma mensagem ficou presa por mais de 5 minutos.','organization','','resolved', 120)
) as x(kind, sev, titulo, corpo, rk, ref, st, h);

-- ===== Sugestões da IA (próximas ações) =====
insert into lead_state (organization_id, contact_id, stage, next_action, next_action_seq, updated_at)
select :org, c.id, x.etapa, x.acao, 1, now() - (x.h || ' hours')::interval
from (values
 ('Ana Paula Ferreira','qualified','Responder que o kit skincare grande chega na semana que vem e oferecer reservar um.',3),
 ('Juliana Martins','negotiating','Confirmar o recebimento do Pix de R$ 249 e liberar o pedido do vestido.',1),
 ('Marcos Vinícius Rocha','negotiating','Perguntar se o cliente prefere receber as camisas na sexta ou no sábado.',30),
 ('Fernanda Alves','negotiating','Retomar contato na sexta com a condição de frete grátis para o perfume.',50)
) as x(nome, etapa, acao, h)
join contacts c on c.organization_id = :org and c.name = x.nome;

insert into crm_lead_activities (organization_id, lead_id, contact_id, source_module, type, payload, performed_at, performed_by_user_id)
select :org, l.id, l.contact_id, 'agent', x.tipo, jsonb_build_object('next_action', x.acao), now() - (x.h || ' hours')::interval, :usr
from (values
 ('Beatriz Oliveira','next_action_approved','Perguntar se a bolsa chegou sem defeitos e oferecer a pós-venda.',60),
 ('Rafael Costa','next_action_dismissed','Oferecer 10% de desconto para a próxima compra.',90),
 ('Lucas Pereira','next_action_approved','Enviar o código de rastreio do fone de ouvido.',130)
) as x(nome, tipo, acao, h)
join contacts c on c.organization_id = :org and c.name = x.nome
join crm_leads l on l.organization_id = :org and l.contact_id = c.id;

-- ===== Execuções e uso (llm_calls) =====
insert into llm_calls (organization_id, purpose, provider, model, input_tokens, output_tokens, cost_cents, latency_ms, status, origem_da_escolha, created_at)
select :org,
       (array['agent_turn','agent_turn','agent_turn','sentiment_classify','intent_router'])[1 + g % 5],
       'anthropic',
       case when g % 5 = 3 then 'claude-haiku-4-5' else 'claude-sonnet-4-6' end,
       900 + (g * 137) % 4200, 120 + (g * 53) % 700,
       round((4 + (g * 7) % 11)::numeric, 2), 1400 + (g * 391) % 6200, 'ok',
       case when g % 4 = 0 then 'padrao_da_organizacao' else 'agente_publicado' end,
       now() - ((g * 21) || ' hours')::interval
from generate_series(1, 30) g;
insert into llm_calls (organization_id, purpose, provider, model, input_tokens, output_tokens, latency_ms, status, error_code, error_message, http_status, origem_da_escolha, created_at) values
 (:org,'agent_turn','anthropic','claude-sonnet-4-6',0,0,812,'erro','credencial_recusada','401 invalid x-api-key',401,'agente_publicado', now()-interval '27 hours'),
 (:org,'agent_turn','anthropic','claude-sonnet-4-6',0,0,30012,'erro','provedor_indisponivel','529 overloaded_error: Overloaded',529,'agente_publicado', now()-interval '75 hours'),
 (:org,'intent_router','anthropic','claude-haiku-4-5',0,0,640,'erro','limite_ou_saldo','429 rate_limit_error: Your credit balance is too low',429,'padrao_da_organizacao', now()-interval '160 hours');

insert into ai_budgets (organization_id, monthly_limit_cents, alarm_threshold_pct, enforcement_mode)
values (:org, 500, 70, 'avisar')
on conflict (organization_id) do update set monthly_limit_cents = 500, alarm_threshold_pct = 70, enforcement_mode = 'avisar';

-- ===== Evolução =====
insert into skill_activations (organization_id, skill_name, trigger, created_at)
select :org, (array['agendamento','agendamento','saudacao-da-loja'])[1 + g % 3], 'hard', now() - ((g * 17) || ' hours')::interval from generate_series(1, 26) g;
insert into ai_router_decisions (organization_id, intent_name, confidence, outcome, created_at)
select :org, (array['Dúvida sobre entrega','Pagamento e Pix','Troca e devolução','Dúvida sobre entrega','Preço e desconto'])[1 + g % 5], 0.8, 'classified', now() - ((g * 13) || ' hours')::interval from generate_series(1, 30) g;
insert into knowledge_searches (organization_id, hits, top_score, threshold, author_kind, created_at)
select :org, case when g % 6 = 0 then 0 else 3 end, case when g % 6 = 0 then 0.41 else 0.78 end, 0.5, case when g % 5 = 0 then 'human' else 'ai' end, now() - ((g * 19) || ' hours')::interval from generate_series(1, 22) g;
insert into lead_state_transitions (organization_id, contact_id, from_stage, to_stage, created_at)
select :org, c.id, x.de, x.para, now() - (x.h || ' hours')::interval
from (values ('Beatriz Oliveira','qualified','won',60),('Lucas Pereira','negotiating','won',130),('Rodrigo Nunes','negotiating','won',200),('Rafael Costa','negotiating','lost',90),('Ana Paula Ferreira','nova','qualified',20)) x(nome,de,para,h)
join contacts c on c.organization_id = :org and c.name = x.nome;
insert into flywheel_distiller_proposals (organization_id, run_id, dataset, type, target, content, evidence, applied_at)
values (:org, gen_random_uuid(), 'demo', 'org_memory_entry', 'org_memory', 'Clientes de Pix preferem o link direto', '{}', now() - interval '4 days');

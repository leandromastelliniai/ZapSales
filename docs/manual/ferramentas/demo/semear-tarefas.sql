-- Dados FICTÍCIOS: tarefas (prazos relativos a hoje).
-- Uso: psql -v ON_ERROR_STOP=1 -v org="'<uuid>'" -v usr="'<uuid>'" -f semear-tarefas.sql
begin;
insert into crm_tasks (organization_id, title, description, due_date, priority, status, assigned_to, created_by) values
 (:org, 'Ligar para a Ana Paula sobre o kit skincare', 'Ela deixou o carrinho parado. Oferecer frete grátis até sexta.', date_trunc('day', now()) - interval '1 day' + interval '14 hours', 'urgent', 'pending', :usr::uuid, :usr::uuid),
 (:org, 'Cobrar comprovante do Pix da Juliana', null, date_trunc('day', now()) - interval '2 days' + interval '10 hours', 'high', 'pending', :usr::uuid, :usr::uuid),
 (:org, 'Conferir estoque da luminária de mesa', 'O sistema mostra 0 unidades; confirmar com o fornecedor.', date_trunc('day', now()) + interval '16 hours', 'medium', 'in_progress', :usr::uuid, :usr::uuid),
 (:org, 'Enviar catálogo novo para os clientes VIP', null, date_trunc('day', now()) + interval '2 days' + interval '9 hours', 'medium', 'pending', :usr::uuid, :usr::uuid),
 (:org, 'Renovar o contrato da maquininha', 'Pedir a taxa nova antes de assinar.', date_trunc('day', now()) + interval '5 days' + interval '11 hours', 'low', 'pending', :usr::uuid, :usr::uuid),
 (:org, 'Montar a promoção da Black Friday', 'Definir descontos e a lista de espera.', date_trunc('day', now()) + interval '12 days' + interval '9 hours', 'high', 'pending', :usr::uuid, :usr::uuid),
 (:org, 'Atualizar as fotos dos produtos', null, null, 'low', 'pending', :usr::uuid, :usr::uuid),
 (:org, 'Responder a avaliação no Google', null, date_trunc('day', now()) - interval '3 days' + interval '9 hours', 'medium', 'done', :usr::uuid, :usr::uuid),
 (:org, 'Treinar a nova atendente', 'Mostrar o Inbox e as respostas rápidas.', date_trunc('day', now()) + interval '4 days' + interval '15 hours', 'medium', 'pending', :usr::uuid, :usr::uuid),
 (:org, 'Fechar o caixa do mês', null, date_trunc('day', now()) + interval '15 days' + interval '18 hours', 'high', 'pending', :usr::uuid, :usr::uuid);
commit;

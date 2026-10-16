-- Dados FICTÍCIOS: contas, formas de pagamento, plano de contas, comissão, recorrências e comandas.
-- Uso: psql -v ON_ERROR_STOP=1 -v org="'<uuid>'" -v usr="'<uuid>'" -f semear-financeiro.sql
begin;
insert into financial_accounts (organization_id, name, kind) values
 (:org,'Caixa da loja','cash'), (:org,'Banco Itaú','bank'), (:org,'Maquininha','other');

insert into payment_methods (organization_id, name, account_id)
select :org, v.n, a.id from (values ('Dinheiro','Caixa da loja'),('Pix','Banco Itaú'),('Cartão de crédito','Maquininha')) v(n, c)
join financial_accounts a on a.organization_id = :org and a.name = v.c;
insert into payment_methods (organization_id, name) values (:org,'Boleto');

insert into account_plans (organization_id, name, direction) values
 (:org,'Vendas de produtos','in'), (:org,'Serviços','in'), (:org,'Aluguel','out'), (:org,'Comissão','out');

insert into commission_rules (organization_id, name, percent, event_type_id)
select :org, 'Comissão de consulta', 30, id from calendar_event_types where organization_id = :org and slug = 'consulta';

insert into recurring_entries (organization_id, name, account_id, direction, amount_cents, day_of_month)
select :org, v.n, a.id, 'out', v.valor, v.dia from (values ('Aluguel da loja',350000,5),('Internet e telefone',19990,10)) v(n, valor, dia)
join financial_accounts a on a.organization_id = :org and a.name = 'Banco Itaú';

-- preços padrão dos serviços (a "Reunião" fica sem preço de propósito)
update calendar_event_types set default_price_cents = 15000 where organization_id = :org and slug = 'consulta';
update calendar_event_types set default_price_cents = 8000 where organization_id = :org and slug = 'atendimento';

-- comandas
insert into sales (organization_id, number, status, total_cents, currency, contact_id, attendant_user_id, payment_method_id, finalized_at, cancelled_at, reversed_at, reverse_reason, created_at)
select :org, v.num, v.st, v.total, 'BRL', c.id, :usr::uuid, pm.id,
  case when v.st = 'finalized' then now() - make_interval(days => v.d) end,
  case when v.st = 'cancelled' then now() - make_interval(days => v.d) end,
  case when v.rev then now() - make_interval(days => v.d) + interval '2 hours' end,
  case when v.rev then 'Cliente devolveu o produto' end,
  now() - make_interval(days => v.d)
from (values
 (1, 'finalized', 32900, 6, 'Ana Paula Ferreira', 'Pix', false),
 (2, 'finalized', 24900, 5, 'Juliana Martins', 'Cartão de crédito', false),
 (3, 'finalized', 45900, 4, 'Beatriz Oliveira', 'Pix', true),
 (4, 'finalized', 15000, 3, 'Carlos Eduardo Lima', 'Dinheiro', false),
 (5, 'open', 0, 1, 'Marcos Vinícius Rocha', null, false),
 (6, 'open', 0, 0, null, null, false),
 (7, 'cancelled', 0, 2, null, null, false)
) as v(num, st, total, d, cliente, forma, rev)
left join contacts c on c.organization_id = :org and c.name = v.cliente
left join payment_methods pm on pm.organization_id = :org and pm.name = v.forma;

insert into sale_items (organization_id, sale_id, description, quantity, unit_price_cents, total_cents, commission_percent)
select :org, s.id, v.descr, 1, v.valor, v.valor, v.pct
from sales s join (values
 (1,'Kit skincare completo',32900,0),
 (2,'Vestido midi floral',24900,0),
 (3,'Bolsa de couro',45900,0),
 (4,'Consulta',15000,30),
 (5,'Camisa social (2 un.)',27800,0),
 (5,'Embalagem para presente',1500,0),
 (6,'Atendimento',8000,0)
) as v(num, descr, valor, pct) on v.num = s.number
where s.organization_id = :org;
update sales s set total_cents = coalesce((select sum(total_cents) from sale_items i where i.sale_id = s.id), 0) where s.organization_id = :org and s.status = 'open';

-- lançamentos das comandas finalizadas (e o estorno da #3)
insert into financial_entries (organization_id, account_id, direction, amount_cents, status, paid_at, origin, sale_id, description, account_plan_id)
select :org, pm.account_id, 'in', s.total_cents, 'paid', s.finalized_at, 'sale', s.id, 'Comanda #' || s.number,
  (select id from account_plans where organization_id = :org and name = 'Vendas de produtos')
from sales s join payment_methods pm on pm.id = s.payment_method_id
where s.organization_id = :org and s.status = 'finalized';
insert into financial_entries (organization_id, account_id, direction, amount_cents, status, paid_at, origin, sale_id, description, reverses_entry_id)
select :org, e.account_id, 'out', e.amount_cents, 'paid', s.reversed_at, 'reversal', s.id, 'Estorno da comanda #' || s.number, e.id
from sales s join financial_entries e on e.sale_id = s.id and e.origin = 'sale'
where s.organization_id = :org and s.reversed_at is not null;
commit;

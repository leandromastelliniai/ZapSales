-- Dados FICTÍCIOS: agenda, respostas rápidas e prospecção da organização de demonstração.
-- Uso:  psql -v ON_ERROR_STOP=1 -v org="'<uuid>'" -v usr="'<uuid>'" -f semear-crm-a1.sql
begin;

-- Agenda: compromissos espalhados pela semana corrente (fuso de São Paulo)
with base as (select date_trunc('week', now() at time zone 'America/Sao_Paulo') as seg),
tipos as (
  select slug, id from calendar_event_types where organization_id = :org
)
insert into calendar_appointments (organization_id, title, starts_at, ends_at, status, event_type_id, owner_user_id, contact_id, location_details, description, cancelled_at, time_zone)
select :org, v.titulo,
  ((select seg from base) + (v.dia || ' days')::interval + (v.hora || ' hours')::interval) at time zone 'America/Sao_Paulo',
  ((select seg from base) + (v.dia || ' days')::interval + (v.hora || ' hours')::interval + (v.min || ' minutes')::interval) at time zone 'America/Sao_Paulo',
  v.st, (select id from tipos where slug = v.tipo), :usr::uuid, c.id, v.local, v.obs,
  case when v.st = 'cancelled' then now() end, 'America/Sao_Paulo'
from (values
 ('Consulta — Ana Paula Ferreira',      0, 9.0,  30, 'confirmed', 'consulta',    'Ana Paula Ferreira',   'Loja Aurora — Av. Paulista, 1000', 'Trazer o pedido anterior'),
 ('Reunião — Carlos Eduardo Lima',      0, 14.5, 30, 'completed', 'reuniao',     'Carlos Eduardo Lima',  null, null),
 ('Atendimento — Juliana Martins',      1, 10.0, 30, 'completed', 'atendimento', 'Juliana Martins',      null, null),
 ('Consulta — Rafael Costa',            1, 16.0, 30, 'no_show',   'consulta',    'Rafael Costa',         null, null),
 ('Reunião — Beatriz Oliveira',         2, 11.0, 30, 'cancelled', 'reuniao',     'Beatriz Oliveira',     null, null),
 ('Atendimento — Marcos Vinícius Rocha',2, 15.0, 30, 'completed', 'atendimento', 'Marcos Vinícius Rocha', null, null),
 ('Consulta — Fernanda Alves',          3, 9.5,  30, 'pending',   'consulta',    'Fernanda Alves',       null, 'Cliente pediu o primeiro horário da manhã'),
 ('Atendimento — Lucas Pereira',        3, 13.0, 30, 'confirmed', 'atendimento', 'Lucas Pereira',        null, null),
 ('Reunião — Camila Santos',            3, 17.0, 30, 'pending',   'reuniao',     'Camila Santos',        null, null),
 ('Consulta — Rodrigo Nunes',           4, 10.5, 30, 'confirmed', 'consulta',    'Rodrigo Nunes',        'Loja Aurora — Av. Paulista, 1000', null),
 ('Atendimento — Patrícia Gomes',       4, 15.5, 30, 'confirmed', 'atendimento', 'Patrícia Gomes',       null, null),
 ('Reunião — Thiago Barbosa',           5, 9.0,  30, 'confirmed', 'reuniao',     'Thiago Barbosa',       null, null)
) as v(titulo, dia, hora, min, st, tipo, nome, local, obs)
join contacts c on c.organization_id = :org and c.name = v.nome;

-- Respostas rápidas
insert into message_templates (organization_id, owner_user_id, title, body, shortcut, created_by_user_id, created_at, updated_at) values
 (:org, null, 'Saudação inicial', 'Oi {{primeiro_nome}}, tudo bem? Aqui é da Loja Aurora. Como posso te ajudar hoje?', 'oi', :usr::uuid, now() - interval '9 days', now() - interval '1 day'),
 (:org, null, 'Horário de funcionamento', 'Atendemos de segunda a sábado, das 9h às 19h. Aos domingos a loja fica fechada, mas respondemos mensagens na segunda cedo.', 'horario', :usr::uuid, now() - interval '8 days', now() - interval '2 days'),
 (:org, null, 'Formas de pagamento', 'Aceitamos Pix, cartão de crédito em até 6x sem juros e boleto. No Pix você ganha 5% de desconto.', 'pagamento', :usr::uuid, now() - interval '7 days', now() - interval '3 days'),
 (:org, :usr::uuid, 'Pix: enviar a chave', 'Perfeito, {{primeiro_nome}}! Nossa chave Pix é o CNPJ 00.000.000/0001-00 (Loja Aurora). Assim que fizer, me manda o comprovante por aqui.', 'pix', :usr::uuid, now() - interval '6 days', now() - interval '4 days'),
 (:org, :usr::uuid, 'Acompanhar entrega', 'Oi {{primeiro_nome}}! Seu pedido já saiu para entrega. Qualquer coisa me chama por aqui.', 'entrega', :usr::uuid, now() - interval '5 days', now() - interval '5 days'),
 (:org, :usr::uuid, 'Agradecimento pós-venda', 'Muito obrigada pela compra, {{primeiro_nome}}! Se puder, conta pra gente o que achou. Sua opinião ajuda muito.', null, :usr::uuid, now() - interval '4 days', now() - interval '6 days');

commit;

-- Dados FICTÍCIOS do módulo B2B (empresas, pessoas, importações). CNPJs e telefones inventados.
-- Uso: psql -v ON_ERROR_STOP=1 -v org="'<uuid>'" -f semear-b2b.sql   (exige MODULO_CRM_B2B ligado para as telas abrirem)
begin;
insert into companies (organization_id, trade_name, legal_name, cnpj, normalized_cnpj, registration_status, enrichment_status, company_size, main_cnae_code, main_cnae_description, street, number, district, city, state, zip_code, updated_at) values
 (:org,'Padaria Estrela','Estrela Alimentos LTDA','12.345.678/0001-95','12345678000195','ATIVA','completed','MICRO EMPRESA','1091101','Fabricação de produtos de panificação industrial','Rua das Flores','120','Centro','Juiz de Fora','MG','36010-000', now() - interval '1 hour'),
 (:org,'Clínica Bem Viver','Bem Viver Serviços Médicos S/A','23.456.789/0001-10','23456789000110','ATIVA','completed','EMPRESA DE PEQUENO PORTE','8630503','Atividade médica ambulatorial restrita a consultas','Av. Brasil','905','Funcionários','Belo Horizonte','MG','30140-002', now() - interval '3 hours'),
 (:org,'Mercado Boa Compra','Boa Compra Comércio de Alimentos LTDA','34.567.890/0001-25','34567890000125','ATIVA','completed','MICRO EMPRESA','4711302','Comércio varejista de mercadorias em geral','Rua das Acácias','45','Jardim América','Campinas','SP','13015-100', now() - interval '1 day'),
 (:org,'Oficina Torque','Torque Mecânica Automotiva LTDA','45.678.901/0001-30','45678901000130','BAIXADA','failed','MICRO EMPRESA',null,null,null,null,null,null,null,null, now() - interval '2 days'),
 (:org,'Studio Pilates Corpo','Corpo em Movimento Estúdio LTDA','56.789.012/0001-45','56789012000145','ATIVA','pending',null,null,null,null,null,null,null,null,null, now() - interval '3 days');
update companies set enrichment_error = 'not_found: CNPJ não encontrado na BrasilAPI.' where organization_id = :org and normalized_cnpj = '45678901000130';

insert into people (organization_id, full_name, normalized_name, email, updated_at) values
 (:org,'Marina Souza','marina souza','marina@estrela.example', now() - interval '1 hour'),
 (:org,'Dr. Henrique Prado','dr. henrique prado','henrique@bemviver.example', now() - interval '3 hours'),
 (:org,'Luciana Prates','luciana prates','luciana@boacompra.example', now() - interval '1 day'),
 (:org,'Renato Dias','renato dias',null, now() - interval '2 days');

insert into company_people (organization_id, company_id, person_id, job_title, is_decision_maker, is_primary)
select :org, c.id, p.id, v.cargo, true, true
from (values ('12345678000195','Marina Souza','Diretora'),('23456789000110','Dr. Henrique Prado','Sócio-administrador'),('34567890000125','Luciana Prates','Gerente de compras'),('45678901000130','Renato Dias','Proprietário')) v(cnpj, pessoa, cargo)
join companies c on c.organization_id = :org and c.normalized_cnpj = v.cnpj
join people p on p.organization_id = :org and p.full_name = v.pessoa;

insert into contacts (organization_id, name, phone_number, person_id, source)
select :org, p.full_name, v.tel, p.id, 'import_csv'
from (values ('Marina Souza','+5532984790001'),('Dr. Henrique Prado','+5531984790002'),('Luciana Prates','+5519984790003')) v(nome, tel)
join people p on p.organization_id = :org and p.full_name = v.nome;

insert into import_batches (id, organization_id, filename, status, total_rows, processed_rows, successful_rows, conflict_rows, failed_rows, completed_at, created_at)
values ('00000000-0000-4000-8000-0000000000b1', :org, 'clientes-b2b.xlsx', 'completed', 5, 5, 3, 1, 1, now() - interval '2 days', now() - interval '2 days'),
       ('00000000-0000-4000-8000-0000000000b2', :org, 'leads-feira-setembro.csv', 'completed', 2, 2, 2, 0, 0, now() - interval '9 days', now() - interval '9 days');
insert into import_rows (organization_id, batch_id, row_number, status, error, company_id, person_id)
select :org, '00000000-0000-4000-8000-0000000000b1', v.n, v.st, v.err, c.id, p.id
from (values (2,'success',null,'12345678000195','Marina Souza'),(3,'success',null,'23456789000110','Dr. Henrique Prado'),(4,'success',null,'34567890000125','Luciana Prates'),(5,'conflict','Telefone já vinculado a outra pessoa.','45678901000130','Renato Dias'),(6,'failed','Telefone inválido.',null,null)) v(n, st, err, cnpj, pessoa)
left join companies c on c.organization_id = :org and c.normalized_cnpj = v.cnpj
left join people p on p.organization_id = :org and p.full_name = v.pessoa;
commit;

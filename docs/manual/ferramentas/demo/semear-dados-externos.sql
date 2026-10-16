-- Conexões fictícias (bytes falsos na senha: nada conecta a lugar nenhum). Só para o manual.
insert into public.external_db_connections
  (organization_id, label, host, port, database_name, username, password_encrypted, password_iv, password_tag, ssl_mode, enabled, last_tested_at, last_test_ok, last_test_error, created_by)
values
 (:org::uuid, 'ERP de pedidos',        'erp.exemplo.com.br',     5432, 'pedidos',     'leitor', '\x00', '\x000000000000000000000000', '\x00000000000000000000000000000000', 'require',     true,  now() - interval '2 hours', true,  null, :usr::uuid),
 (:org::uuid, 'CRM de assinaturas',    'assinaturas.exemplo.com',5432, 'outro_crm',   'leitor', '\x00', '\x000000000000000000000000', '\x00000000000000000000000000000000', 'verify-full', true,  now() - interval '1 day',   false, 'password authentication failed for user "leitor"', :usr::uuid),
 (:org::uuid, 'Planilha de matrículas','10.0.0.25',              5432, 'matriculas',  'leitor', '\x00', '\x000000000000000000000000', '\x00000000000000000000000000000000', 'disable',     true,  null, null, null, :usr::uuid),
 (:org::uuid, 'Base antiga (2023)',    'legado.exemplo.com.br',  5432, 'base_antiga', 'leitor', '\x00', '\x000000000000000000000000', '\x00000000000000000000000000000000', 'require',     false, now() - interval '30 days', true,  null, :usr::uuid);
select count(*) from public.external_db_connections where organization_id = :org::uuid;

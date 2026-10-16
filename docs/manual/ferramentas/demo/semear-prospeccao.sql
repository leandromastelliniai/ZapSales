-- Dados FICTÍCIOS de prospecção (nada aqui chama Apify, WhatsApp ou IA).
-- Uso: psql -v ON_ERROR_STOP=1 -v org="'<uuid>'" -f semear-prospeccao.sql
-- Campanhas ficam em rascunho (`draft`) com busca concluída: o worker só age em `running`.
begin;
insert into prospecting_settings (organization_id, credential_encrypted) values (:org, '\x00') on conflict do nothing;

insert into prospecting_campaigns (organization_id, request_id, name, search, status, search_status, cost_usd, result_count, skipped_count)
values
 (:org, gen_random_uuid(), 'Clínicas de estética · São Paulo, SP', '{"name":"Clínicas de estética · São Paulo, SP","niche":"clínicas de estética","location":"São Paulo, SP","limit":20,"budget_usd":1,"enrich":true}', 'draft', 'succeeded', 0.37, 14, 3),
 (:org, gen_random_uuid(), 'Lojas de decoração · Campinas, SP', '{"name":"Lojas de decoração · Campinas, SP","niche":"lojas de decoração","location":"Campinas, SP","limit":10,"budget_usd":1,"enrich":false}', 'draft', 'succeeded', 0.12, 6, 0);

insert into prospecting_candidates (organization_id, campaign_id, place_id, phone, data, status, selected, error)
select :org, c.id, 'demo-' || v.i, v.phone,
  jsonb_build_object('key','demo-' || v.i,'name',v.nome,'phone',v.phone,'website','https://exemplo.com.br/' || v.i,'category',v.cat,'address',v.ender,'maps_url','https://maps.example/' || v.i,'rating',v.nota,'reviews',v.aval,'emails',case when v.email is null then '[]'::jsonb else jsonb_build_array(v.email) end,'socials','[]'::jsonb),
  v.st, v.sel, v.err
from prospecting_campaigns c
join (values
 (1,'Clínica Bela Forma','+5511988880001','Clínica de estética','Rua das Flores, 120 — São Paulo','4.8',212,'contato@belaforma.example','new',true,null),
 (2,'Espaço Pele Viva','+5511988880002','Clínica de estética','Av. Brasil, 905 — São Paulo','4.6',131,'oi@peleviva.example','new',true,null),
 (3,'Estética Renove','+5511988880003','Clínica de estética','Rua Augusta, 77 — São Paulo','4.9',302,null,'new',true,null),
 (4,'Instituto Harmonia','+5511988880004','Clínica de estética','Rua Oscar Freire, 410 — São Paulo','4.7',88,'atendimento@harmonia.example','new',true,null),
 (5,'Studio Dermis','+5511988880005','Clínica de estética','Al. Santos, 1500 — São Paulo','4.5',64,null,'new',true,null),
 (6,'Clínica Luz & Corpo','+5511988880006','Clínica de estética','Rua Vergueiro, 2100 — São Paulo','4.4',51,null,'new',true,null),
 (7,'Aura Estética','+5511988880007','Clínica de estética','Rua Haddock Lobo, 333 — São Paulo','4.8',177,'contato@aura.example','queued',true,null),
 (8,'Corpo em Foco','+5511988880008','Clínica de estética','Av. Rebouças, 800 — São Paulo','4.3',45,null,'queued',true,null),
 (9,'Bem Estar Spa','+5511988880009','Clínica de estética','Rua Pamplona, 55 — São Paulo','4.6',99,null,'queued',true,null),
 (10,'Clínica Sorriso & Pele','+5511988880010','Clínica de estética','Rua da Consolação, 2000 — São Paulo','4.7',140,null,'skipped',true,'Contato já existe no CRM; atendimento preservado.'),
 (11,'Espaço Zen','+5511988880011','Clínica de estética','Rua Pinheiros, 210 — São Paulo','4.2',33,null,'skipped',false,'Não selecionada pelo operador.'),
 (12,'Renova Care','+5511988880012','Clínica de estética','Rua Cardeal Arcoverde, 90 — São Paulo','4.5',72,null,'failed',true,'Falha ao preparar a abordagem; revise a empresa.'),
 (13,'Beleza Pura','+5511988880013','Clínica de estética','Av. Paulista, 1800 — São Paulo','4.6',120,'oi@belezapura.example','new',true,null),
 (14,'Clínica Vita','+5511988880014','Clínica de estética','Rua Teodoro Sampaio, 700 — São Paulo','4.4',58,null,'new',true,null)
) as v(i,nome,phone,cat,ender,nota,aval,email,st,sel,err) on true
where c.organization_id = :org and c.name like 'Clínicas%';

insert into prospecting_candidates (organization_id, campaign_id, place_id, phone, data, status, selected)
select :org, c.id, 'demo-d' || v.i, v.phone,
  jsonb_build_object('key','demo-d' || v.i,'name',v.nome,'phone',v.phone,'website',null,'category','Loja de decoração','address',v.ender,'maps_url','https://maps.example/d' || v.i,'rating',v.nota,'reviews',v.aval,'emails','[]'::jsonb,'socials','[]'::jsonb),
  'new', true
from prospecting_campaigns c
join (values
 (1,'Casa & Estilo','+5519977770001','Rua Barão de Jaguara, 400 — Campinas','4.7',90),
 (2,'Ateliê do Lar','+5519977770002','Av. Norte-Sul, 1200 — Campinas','4.5',60),
 (3,'Decor Ponto Azul','+5519977770003','Rua Culto à Ciência, 15 — Campinas','4.8',130),
 (4,'Móveis & Cia Campinas','+5519977770004','Av. Brasil, 2100 — Campinas','4.2',40),
 (5,'Lar Doce Detalhe','+5519977770005','Rua Dr. Quirino, 90 — Campinas','4.6',75),
 (6,'Toque Final Decoração','+5519977770006','Rua Marechal Deodoro, 310 — Campinas','4.4',52)
) as v(i,nome,phone,ender,nota,aval) on true
where c.organization_id = :org and c.name like 'Lojas%';
commit;

-- Dados FICTÍCIOS: catálogo de produtos e histórico de chamadas (nada liga para ninguém).
-- Uso: psql -v ON_ERROR_STOP=1 -v org="'<uuid>'" -f semear-produtos-chamadas.sql
begin;
insert into catalog_products (organization_id, codigo, nome, marca, categoria, preco_cents, custo_cents, controla_estoque, quantidade, ativo) values
 (:org,'KIT-SKIN','Kit skincare completo','Aurora Beauty','Cosméticos',32900,18000,true,14,true),
 (:org,'VEST-MIDI','Vestido midi floral','Aurora Moda','Roupas',24900,11000,true,9,true),
 (:org,'TEN-ESP','Tênis esportivo','Corre+','Calçados',39900,21000,true,6,true),
 (:org,'BOLSA-COURO','Bolsa de couro','Aurora Moda','Acessórios',45900,24000,true,3,true),
 (:org,'FONE-BT','Fone de ouvido sem fio','SoundPro','Eletrônicos',21900,12000,true,22,true),
 (:org,'LUM-MESA','Luminária de mesa','Casa Luz','Casa',14900,7000,true,0,true),
 (:org,'PERF-IMP','Perfume importado 100ml','Maison','Perfumaria',31900,17500,true,11,true),
 (:org,'CAPA-ENC','Capa sob encomenda',null,'Acessórios',8900,null,false,0,true),
 (:org,'RELOG-DIG','Relógio digital','TimeFit','Acessórios',35900,19000,true,5,false);

insert into voice_calls (organization_id, provider, direction, status, end_reason, peer_phone, handled_by, started_at, answered_at, ended_at, duration_ms, transcript) values
 (:org,'sip','outbound','ended','user_ended','+5511999990101','ai', now()-interval '2 hours', now()-interval '2 hours'+interval '8 s', now()-interval '2 hours'+interval '2 min 5 s', 125000,
  '[{"speaker":"agent","text":"Olá, aqui é a Iara, da Loja Aurora. Posso falar com a Ana Paula?","ts":"2026-10-15T20:00:09Z"},{"speaker":"customer","text":"Sou eu, pode falar.","ts":"2026-10-15T20:00:14Z"},{"speaker":"agent","text":"Estou ligando sobre o kit skincare que você deixou no carrinho. Ainda tem interesse?","ts":"2026-10-15T20:00:20Z"},{"speaker":"customer","text":"Tenho sim, só queria saber o prazo de entrega.","ts":"2026-10-15T20:00:31Z"}]'::jsonb),
 (:org,'sip','inbound','ended','timeout','+5511999990102','ai', now()-interval '1 day', null, now()-interval '1 day'+interval '30 s', 30000, null),
 (:org,'sip','outbound','ended','busy','+5511999990103','ai', now()-interval '3 days', null, now()-interval '3 days'+interval '12 s', 12000, null),
 (:org,'sip','outbound','ended','failed','+5511999990104','ai', now()-interval '4 days', null, now()-interval '4 days'+interval '5 s', 5000, null),
 (:org,'sip','inbound','ended','user_ended','+5511999990105','ai', now()-interval '5 days', now()-interval '5 days'+interval '4 s', now()-interval '5 days'+interval '1 min 20 s', 80000,
  '[{"speaker":"customer","text":"Oi, queria saber o horário da loja no sábado.","ts":"2026-10-10T15:00:05Z"},{"speaker":"agent","text":"No sábado atendemos das 9h às 13h.","ts":"2026-10-10T15:00:09Z"}]'::jsonb);
commit;

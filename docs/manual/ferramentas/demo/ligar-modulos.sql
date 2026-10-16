-- LIGA, por alguns minutos, os módulos opcionais da instalação para fotografar as telas.
-- Estado original (2026-10-15): só existia MODULO_BANCO_EXTERNO='desligado'. Reverta com desligar-modulos.sql.
insert into platform_config (chave, valor) values
 ('MODULO_CRM_B2B','ligado'), ('MODULO_PROPOSTAS','ligado'), ('MODULO_FLUXOS_DE_ATENDIMENTO','ligado')
on conflict (chave) do update set valor = 'ligado';
update platform_config set valor = 'ligado' where chave = 'MODULO_BANCO_EXTERNO';

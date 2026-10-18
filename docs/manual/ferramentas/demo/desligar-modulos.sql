-- Desfaz ligar-modulos.sql: volta ao estado original (só MODULO_BANCO_EXTERNO existia, desligado).
delete from platform_config where chave in ('MODULO_CRM_B2B','MODULO_PROPOSTAS','MODULO_FLUXOS_DE_ATENDIMENTO');
update platform_config set valor = 'desligado' where chave = 'MODULO_BANCO_EXTERNO';

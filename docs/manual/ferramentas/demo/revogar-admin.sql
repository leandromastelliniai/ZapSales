-- Revoga o acesso ao painel /admin concedido ao usuário de demonstração.
update public.platform_admins set revoked_at = now(), revoked_by = user_id, revoke_reason = 'Fim das capturas do manual'
 where user_id = :usr::uuid and revoked_at is null;
select user_id, scope, revoked_at from public.platform_admins where user_id = :usr::uuid;

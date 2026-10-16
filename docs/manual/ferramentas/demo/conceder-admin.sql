-- Concede ao usuário de demonstração acesso SOMENTE LEITURA ao painel /admin (temporário; revogar com revogar-admin.sql).
insert into public.platform_admins (user_id, granted_by, scope, mfa_required, reason)
values (:usr::uuid, :usr::uuid, 'support_readonly', false, 'Manual do usuário (temporário) - capturas do painel')
on conflict (user_id) do update set revoked_at = null, revoked_by = null, revoke_reason = null, scope = 'support_readonly', mfa_required = false;
select user_id, scope, revoked_at from public.platform_admins;
select id, slug, display_name, status from public.organizations order by created_at;
select email from auth.users order by created_at;

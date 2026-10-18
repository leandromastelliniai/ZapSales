select uo.user_id, uo.role, uo.accepted_at, uo.revoked_at, u.email, u.raw_user_meta_data->>'full_name' as nome
from public.user_organizations uo join auth.users u on u.id = uo.user_id where uo.organization_id = :org::uuid;
select count(*) as convites from public.team_invites where organization_id = :org::uuid;
select id, email from auth.users where email like '%example.com' limit 20;
select interface_settings, settings->'routing' as routing, settings->'visibility_mode' as vis from public.organizations where id = :org::uuid;

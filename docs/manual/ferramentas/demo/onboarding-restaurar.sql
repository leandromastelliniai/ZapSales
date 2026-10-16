update public.organizations o set onboarded_at = b.onboarded_at from public._manual_demo_onboarding_bak b where o.id = b.org and o.id = :org::uuid;
drop table if exists public._manual_demo_onboarding_bak;
select id, onboarded_at, onboarding_state from public.organizations where id = :org::uuid;

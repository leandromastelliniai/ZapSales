-- Reabre o onboarding da org de demonstração (só para fotografar as telas) e guarda o instante original.
create table if not exists public._manual_demo_onboarding_bak (org uuid primary key, onboarded_at timestamptz);
insert into public._manual_demo_onboarding_bak select id, onboarded_at from public.organizations where id = :org::uuid on conflict (org) do nothing;
update public.organizations set onboarded_at = null where id = :org::uuid;
select id, onboarded_at, onboarding_state from public.organizations where id = :org::uuid;

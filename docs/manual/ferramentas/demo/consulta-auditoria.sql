select count(*) as linhas, min(created_at) as primeira, max(created_at) as ultima from public.api_audit_log where organization_id = :org::uuid;
select action, count(*) from public.api_audit_log where organization_id = :org::uuid group by 1 order by 2 desc limit 15;
select user_id, role from public.organization_members where organization_id = :org::uuid;
select id from public.crm_leads where organization_id = :org::uuid limit 3;
select id from public.contacts where organization_id = :org::uuid limit 3;

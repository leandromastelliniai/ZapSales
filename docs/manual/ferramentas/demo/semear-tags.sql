update public.contacts set tags = array_append(coalesce(tags,'{}'), 'orçamento')
 where id in (select id from public.contacts where organization_id = :org::uuid order by created_at limit 6);
update public.contacts set tags = array_append(coalesce(tags,'{}'), 'Cliente Novo')
 where id in (select id from public.contacts where organization_id = :org::uuid order by created_at desc limit 5);
update public.contacts set tags = array_append(coalesce(tags,'{}'), 'cliente novo')
 where id in (select id from public.contacts where organization_id = :org::uuid order by created_at desc limit 2 offset 5);
update public.crm_leads set tags = array_append(coalesce(tags,'{}'), 'orçamento')
 where id in (select id from public.crm_leads where organization_id = :org::uuid order by created_at limit 4);
update public.crm_leads set tags = array_append(coalesce(tags,'{}'), 'vip')
 where id in (select id from public.crm_leads where organization_id = :org::uuid order by created_at desc limit 3);
select count(*) from public.contacts where organization_id = :org::uuid and 'orçamento' = any(tags);

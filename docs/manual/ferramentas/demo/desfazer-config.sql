-- Apaga os 4 usuários fictícios criados por semear-config.sql (os vínculos caem em cascata).
delete from public.user_organizations where user_id in (select id from auth.users where email like '%@equipe-demo.example.com');
delete from auth.users where email like '%@equipe-demo.example.com';
select count(*) as restantes from auth.users where email like '%@equipe-demo.example.com';

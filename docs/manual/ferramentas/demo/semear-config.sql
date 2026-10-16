-- Semente das telas de Configurações (org de demonstração). Cria 4 usuários FICTÍCIOS (@equipe-demo.example.com);
-- eles são apagados por desfazer-config.sql no fim.
select set_config('demo.org', :org, false), set_config('demo.usr', :usr, false);
do $$
declare
  v_org uuid := current_setting('demo.org')::uuid;
  v_usr uuid := current_setting('demo.usr')::uuid;
  u1 uuid := 'a0000000-0000-4000-8000-000000000001';
  u2 uuid := 'a0000000-0000-4000-8000-000000000002';
  u3 uuid := 'a0000000-0000-4000-8000-000000000003';
  u4 uuid := 'a0000000-0000-4000-8000-000000000004';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
  values
   (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rafael.lima@equipe-demo.example.com', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Rafael Lima"}', now() - interval '40 days', now(), now() - interval '2 hours'),
   (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'camila.nunes@equipe-demo.example.com', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Camila Nunes"}', now() - interval '30 days', now(), now() - interval '1 day'),
   (u3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bruno.alves@equipe-demo.example.com', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Bruno Alves"}', now() - interval '20 days', now(), now() - interval '5 days'),
   (u4, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tereza.rocha@equipe-demo.example.com', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Tereza Rocha"}', now() - interval '60 days', now(), now() - interval '20 days')
  on conflict (id) do nothing;

  insert into public.user_organizations (user_id, organization_id, role, invited_at, accepted_at, revoked_at, interface_settings)
  values
   (u1, v_org, 'agent',   now() - interval '40 days', now() - interval '40 days', null, '{"preset":"completa"}'),
   (u2, v_org, 'manager', now() - interval '30 days', now() - interval '30 days', null, '{"preset":"completa"}'),
   (u3, v_org, 'agent',   now() - interval '20 days', now() - interval '20 days', null, '{"preset":"simplificada"}'),
   (u4, v_org, 'viewer',  now() - interval '60 days', now() - interval '60 days', now() - interval '3 days', '{"preset":"completa"}')
  on conflict (user_id, organization_id) do nothing;

  insert into public.attendant_availability (organization_id, user_id, is_available, capacity, schedule, last_heartbeat_at)
  values
   (v_org, v_usr, true, 8, '{"timezone":"America/Sao_Paulo","windows":[{"dow":1,"start":"08:00","end":"18:00"},{"dow":2,"start":"08:00","end":"18:00"},{"dow":3,"start":"08:00","end":"18:00"},{"dow":4,"start":"08:00","end":"18:00"},{"dow":5,"start":"08:00","end":"17:00"}]}', now()),
   (v_org, u1, true, 5, '{"timezone":"America/Sao_Paulo","windows":[{"dow":1,"start":"09:00","end":"19:00"},{"dow":2,"start":"09:00","end":"19:00"},{"dow":3,"start":"09:00","end":"19:00"}]}', now() - interval '20 minutes'),
   (v_org, u2, false, 5, '{}', null),
   (v_org, u3, true, 6, '{"timezone":"America/Sao_Paulo","windows":[{"dow":6,"start":"08:00","end":"12:00"}]}', null)
  on conflict (organization_id, user_id) do nothing;

  insert into public.team_invites (organization_id, email, role, interface_settings, invited_by, inviter_name, email_dispatched, created_at, last_sent_at, resend_count, expires_at, accepted_at, accepted_by, revoked_at, revoked_by)
  values
   (v_org, 'paula.mendes@equipe-demo.example.com', 'agent', '{"preset":"completa"}', v_usr, 'Marina Souza', false, now() - interval '2 hours', now() - interval '2 hours', 0, now() + interval '22 hours', null, null, null, null),
   (v_org, 'diego.ramos@equipe-demo.example.com',  'manager','{"preset":"completa"}', v_usr, 'Marina Souza', true,  now() - interval '3 days', now() - interval '3 days', 1, now() - interval '2 days', null, null, null, null),
   (v_org, 'rafael.lima@equipe-demo.example.com',  'agent',  '{"preset":"completa"}', v_usr, 'Marina Souza', true,  now() - interval '41 days', now() - interval '41 days', 0, now() - interval '40 days', now() - interval '40 days', u1, null, null),
   (v_org, 'joao.pires@equipe-demo.example.com',   'viewer', '{"preset":"completa"}', v_usr, 'Marina Souza', true,  now() - interval '10 days', now() - interval '10 days', 0, now() - interval '9 days', null, null, now() - interval '9 days', v_usr);

  -- Distribuição e assinatura
  update public.organizations set settings = settings
    || jsonb_build_object('routing', jsonb_build_object('mode','round_robin','max_retries',5,'backoff_seconds',60))
  where id = v_org;

  -- Tags com cor
  update public.organizations set settings = settings
    || jsonb_build_object('tags', '[{"tag":"vip","cor":"#ab4aba"},{"tag":"orçamento","cor":"#0091ff"},{"tag":"Cliente Novo","cor":"#12a594"}]'::jsonb)
  where id = v_org;

  -- LGPD
  insert into public.lgpd_requests (organization_id, request_type, source, contact_id, status, attempts, received_at, due_at, completed_at, emergency, scope, error_message)
  select v_org, x.tp, 'manual', (select id from public.contacts where organization_id = v_org order by created_at limit 1 offset x.off), x.st, 0, x.rec, x.due, x.comp, false, 'contact', x.err
  from (values
    ('data_request','received',    now() - interval '2 days',  date_trunc('day', now() + interval '5 days') at time zone 'utc', null::timestamptz, null::text, 0),
    ('redact',      'received',    now() - interval '14 days', date_trunc('day', now() + interval '1 day')  at time zone 'utc', null, null, 1),
    ('redact',      'processing',  now() - interval '6 days',  date_trunc('day', now() + interval '9 days') at time zone 'utc', null, null, 2),
    ('data_request','completed',   now() - interval '12 days', date_trunc('day', now() - interval '5 days') at time zone 'utc', now() - interval '6 days', null, 3),
    ('redact',      'failed',      now() - interval '8 days',  date_trunc('day', now() + interval '7 days') at time zone 'utc', null, 'Falha ao remover a mídia do contato (exemplo).', 4)
  ) as x(tp, st, rec, due, comp, err, off);
end $$;

-- Chaves de API fictícias (hash de zeros: nenhuma chave real existe)
insert into public.api_tokens (organization_id, created_by, name, prefix, token_hash, scopes, expires_at, revoked_at)
values
 (:org::uuid, :usr::uuid, 'Integração do ERP',   'zps_a1b2c3d4', decode(repeat('00',32),'hex'), '["contacts:read","leads:write"]', now() + interval '90 days', null),
 (:org::uuid, :usr::uuid, 'Agente externo (MCP)','zps_e5f6a7b8', decode(repeat('11',32),'hex'), '["mcp:read","mcp:write","role:manager"]', null, null),
 (:org::uuid, :usr::uuid, 'Teste antigo',        'zps_c9d0e1f2', decode(repeat('22',32),'hex'), '["messages:read"]', null, now() - interval '5 days');

-- Linha telefônica fictícia (senha com bytes falsos)
insert into public.voip_trunk_settings (organization_id, host, port, username, password_encrypted, password_iv, password_tag, password_last4, endpoint_name, is_active, updated_by)
values (:org::uuid, 'sip.exemplo.com.br', 5060, '1000', '\x00', '\x000000000000000000000000', '\x00000000000000000000000000000000', '4821', 'org-' || :org || '-trunk-endpoint', true, :usr::uuid)
on conflict (organization_id) do nothing;

select (select count(*) from public.user_organizations where organization_id = :org::uuid) as membros,
       (select count(*) from public.team_invites where organization_id = :org::uuid) as convites,
       (select count(*) from public.lgpd_requests where organization_id = :org::uuid) as lgpd,
       (select count(*) from public.api_tokens where organization_id = :org::uuid) as tokens;

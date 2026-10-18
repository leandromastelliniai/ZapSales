-- Linhas de auditoria fictícias, só para o manual (org de demonstração).
insert into public.api_audit_log (organization_id, actor_user_id, action, resource_type, resource_id, request_id, metadata, created_at)
values
 (:org::uuid, :usr::uuid, 'lead.moved',            'lead',         gen_random_uuid(), 'a1b2c3d4-0001', '{"de":"Novo","para":"Proposta"}', now() - interval '25 minutes'),
 (:org::uuid, :usr::uuid, 'contact.merged',        'contact',      gen_random_uuid(), 'a1b2c3d4-0002', '{"unidos":2}', now() - interval '1 hour'),
 (:org::uuid, :usr::uuid, 'lead.created',          'lead',         gen_random_uuid(), 'a1b2c3d4-0003', '{"origem":"manual"}', now() - interval '2 hours'),
 (:org::uuid, :usr::uuid, 'conversation.transferred','conversation', gen_random_uuid(), 'a1b2c3d4-0004', '{"para":"Rafael Lima"}', now() - interval '3 hours'),
 (:org::uuid, :usr::uuid, 'campaign.paused',       'campaign',     gen_random_uuid(), 'a1b2c3d4-0005', '{"motivo":"manual"}', now() - interval '5 hours'),
 (:org::uuid, :usr::uuid, 'token.created',         'token',        gen_random_uuid(), 'a1b2c3d4-0006', '{"nome":"Integração do site"}', now() - interval '1 day'),
 (:org::uuid, :usr::uuid, 'member.invited',        'member',       gen_random_uuid(), 'a1b2c3d4-0007', '{"papel":"agent"}', now() - interval '1 day 2 hours'),
 (:org::uuid, :usr::uuid, 'team.role_changed',     'member',       gen_random_uuid(), 'a1b2c3d4-0008', '{"de":"agent","para":"manager"}', now() - interval '2 days'),
 (:org::uuid, :usr::uuid, 'org.branding_updated',  'organization', :org::uuid,        'a1b2c3d4-0009', '{"campo":"cor"}', now() - interval '3 days'),
 (:org::uuid, null,       'automation.rule_executed','automation_rule_run', gen_random_uuid(), null, '{"resultado":"sucesso"}', now() - interval '3 days 4 hours'),
 (:org::uuid, :usr::uuid, 'agenda.appointment_cancelled','appointment', gen_random_uuid(), 'a1b2c3d4-0010', '{"motivo":"cliente pediu"}', now() - interval '4 days'),
 (:org::uuid, :usr::uuid, 'contact.blocked',       'contact',      gen_random_uuid(), 'a1b2c3d4-0011', '{"motivo":"pediu para sair"}', now() - interval '6 days'),
 (:org::uuid, :usr::uuid, 'proposal.sent',         'proposal',     gen_random_uuid(), 'a1b2c3d4-0012', '{"valor_cents":450000}', now() - interval '8 days');
select count(*) from public.api_audit_log where organization_id = :org::uuid;

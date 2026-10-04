-- manifest: **Canal oficial no modelo novo de contas da Meta e contato identificado por BSUID (issue #4).** `channel_sessions.meta_messaging_account_id` guarda a conta de mensagens que vai em toda chamada à API de mensagens da Graph v26. `contacts.wa_bsuid` guarda o identificador de usuário com escopo de portfólio (BSUID, `BR.123…`), com formato conferido e único por organização entre contatos vivos; `fn_upsert_meta_contact` acha ou cria o contato por BSUID e/ou telefone e grava os dois na mesma ficha (quando o telefone já é de OUTRA ficha viva, não funde no webhook: estaciona `telefone_em_conflito` para a tela de duplicados, como a ingestão do WhatsApp já faz); gatilhos levam o BSUID do perdedor ao vencedor numa fusão e o apagam na anonimização. Idempotente.

-- 0535: conta de mensagens (Graph v26) e BSUID.
--
-- ─── Conta de mensagens ─────────────────────────────────────────────────────
--
-- No modelo novo de contas da Meta um número pode carregar mais de uma "conta de
-- mensagens" (cada parceiro tem a sua; é ela que guarda modelos e cobrança). O
-- token que alcança mais de uma precisa NOMEAR qual paga cada mensagem — o
-- `messaging_account_id` no corpo da chamada. Nullable: com uma conta só no
-- número a Meta resolve sozinha, e instalação antiga segue funcionando.
--
-- ─── BSUID ──────────────────────────────────────────────────────────────────
--
-- Quem ativa nome de usuário no WhatsApp pode chegar SEM telefone: o webhook traz
-- `user_id`/`from_user_id` (o BSUID, `<país>.<até 128 alfanuméricos>`, ou o BSUID
-- pai `<país>.ENT.<…>`) e omite `wa_id`/`from`. O BSUID é estável por portfólio
-- de negócio + usuário, então ele é identidade — índice único parcial, como o
-- `wa_lid` da 0122. Coluna própria, não `source_metadata`: identidade lida em
-- consulta não mora em jsonb (anti-pattern 6).
--
-- ─── Por que o webhook NÃO funde ─────────────────────────────────────────────
--
-- "BSUID e telefone chegam juntos → ficam no mesmo contato". Quando o telefone
-- que chegou já está em OUTRA ficha viva (a pessoa falou primeiro só por nome de
-- usuário e a lista importada trouxe o telefone), juntar é FUSÃO — e fusão é
-- irreversível e decidida por quem opera, na tela de duplicados. A ingestão do
-- WhatsApp já trata o `@lid` assim (`fn_upsert_wa_contact`): segue na ficha da
-- identidade e estaciona o número em `source_metadata.telefone_em_conflito`, que
-- `lib/contacts/duplicados.ts` lê e oferece para fundir. Quando o operador funde,
-- o gatilho abaixo leva o BSUID para a ficha vencedora.

alter table public.channel_sessions
  add column if not exists meta_messaging_account_id text;

comment on column public.channel_sessions.meta_messaging_account_id is
  'Conta de mensagens da Meta (modelo novo de contas, Graph v26): vai como messaging_account_id em toda chamada à API de mensagens. Null = a Meta resolve pela única conta que o token alcança no número.';

alter table public.contacts
  add column if not exists wa_bsuid text;

comment on column public.contacts.wa_bsuid is
  'BSUID do WhatsApp (identificador de usuário com escopo do portfólio de negócio, ex.: BR.13491208655302741918). Identidade: único por organização entre contatos vivos. Apagado na anonimização.';

-- Formato antes da constraint: a coluna é nova, mas o bloco é re-aplicado na
-- atualização — e um valor fora do formato não pode derrubar o update.sh.
update public.contacts
   set wa_bsuid = null
 where wa_bsuid is not null
   and wa_bsuid !~ '^[A-Z]{2}\.(ENT\.)?[A-Za-z0-9]{1,128}$';

alter table public.contacts drop constraint if exists contacts_wa_bsuid_formato;
alter table public.contacts add constraint contacts_wa_bsuid_formato
  check (wa_bsuid is null or wa_bsuid ~ '^[A-Z]{2}\.(ENT\.)?[A-Za-z0-9]{1,128}$');

-- Duplicata viva antes do índice (auto-curativo): fica o mais antigo.
with ranqueados as (
  select id,
         row_number() over (partition by organization_id, wa_bsuid order by created_at, id) as posicao
    from public.contacts
   where wa_bsuid is not null and is_merged_into is null
)
update public.contacts c
   set wa_bsuid = null
  from ranqueados r
 where r.id = c.id and r.posicao > 1;

create unique index if not exists uniq_contacts_org_wa_bsuid
  on public.contacts (organization_id, wa_bsuid)
  where wa_bsuid is not null and is_merged_into is null;

-- ─── Fusão herda o BSUID ────────────────────────────────────────────────────
--
-- A lápide (`is_merged_into` de null para alguém) solta o BSUID do índice
-- parcial; sem herança, a próxima mensagem daquela pessoa não acharia ficha viva
-- e abriria outra — refazendo a duplicata que a fusão desfez. Mesma razão do
-- `waha_lid` e da identidade social dentro da `fn_mesclar_contatos`; gatilho em
-- vez de mais uma cópia da função porque o BSUID é a ÚNICA coisa nova.
create or replace function public.fn_contato_herda_bsuid_na_fusao()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.contacts v
     set wa_bsuid = new.wa_bsuid,
         updated_at = now()
   where v.id = new.is_merged_into
     and v.organization_id = new.organization_id
     and v.wa_bsuid is null
     and not exists (
       select 1 from public.contacts o
        where o.organization_id = new.organization_id
          and o.is_merged_into is null
          and o.wa_bsuid = new.wa_bsuid
          and o.id <> v.id
     );
  return null;
end; $$;

revoke execute on function public.fn_contato_herda_bsuid_na_fusao() from public, anon, authenticated;

drop trigger if exists trg_contacts_herda_bsuid_na_fusao on public.contacts;
create trigger trg_contacts_herda_bsuid_na_fusao
  after update of is_merged_into on public.contacts
  for each row
  when (old.is_merged_into is null and new.is_merged_into is not null and new.wa_bsuid is not null)
  execute function public.fn_contato_herda_bsuid_na_fusao();

-- ─── Anonimização apaga o BSUID ─────────────────────────────────────────────
--
-- O BSUID identifica a pessoa tanto quanto o telefone. A cascata LGPD apaga o
-- telefone; sem isto o BSUID sobreviveria na ficha anonimizada e a próxima
-- mensagem reencontraria "Cliente Anonimizado #N" pelo identificador.
create or replace function public.fn_contato_anonimizado_perde_bsuid()
returns trigger language plpgsql set search_path = public as $$
begin
  new.wa_bsuid := null;
  return new;
end; $$;

revoke execute on function public.fn_contato_anonimizado_perde_bsuid() from public, anon, authenticated;

drop trigger if exists trg_contacts_anonimizado_perde_bsuid on public.contacts;
create trigger trg_contacts_anonimizado_perde_bsuid
  before update of is_anonymized on public.contacts
  for each row
  when (new.is_anonymized is true and new.wa_bsuid is not null)
  execute function public.fn_contato_anonimizado_perde_bsuid();

-- ─── fn_upsert_meta_contact ─────────────────────────────────────────────────
--
-- A porta de identidade do canal oficial. Telefone sozinho continua decidido
-- pela regra que já existe (`fn_upsert_wa_contact`: nono dígito, conflito de
-- telefone); o que esta função acrescenta é o BSUID:
--
--   * só BSUID      → acha a ficha pelo BSUID, ou cria uma sem telefone;
--   * BSUID achado  → é a pessoa. Se a ficha não tem telefone e o telefone que
--                     chegou está livre, ele entra; se está noutra ficha viva,
--                     fica estacionado em `telefone_em_conflito` (sem fusão);
--   * BSUID novo    → resolve pelo telefone e grava o BSUID na ficha.
--
-- BSUID fora do formato é IGNORADO, não erro: o CHECK recusaria a escrita, e uma
-- mensagem com telefone não pode se perder por causa do identificador extra.
create or replace function public.fn_upsert_meta_contact(
  p_org uuid, p_phone text, p_bsuid text, p_chat_id text, p_notify text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_bsuid text := nullif(btrim(coalesce(p_bsuid, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_notify text := nullif(btrim(coalesce(p_notify, '')), '');
  v_por_bsuid uuid;
  v_telefone_da_ficha text;
  v_por_telefone uuid;
  v_digits text;
  v_alt text;
  v_id uuid;
begin
  if v_bsuid is not null and v_bsuid !~ '^[A-Z]{2}\.(ENT\.)?[A-Za-z0-9]{1,128}$' then
    v_bsuid := null;
  end if;
  if v_bsuid is null and v_phone is null then
    raise exception using errcode = '22023', message = 'contato_sem_identidade';
  end if;

  if v_bsuid is not null then
    select id, phone_number into v_por_bsuid, v_telefone_da_ficha
      from public.contacts
     where organization_id = p_org and wa_bsuid = v_bsuid and is_merged_into is null
     limit 1;
  end if;

  -- BSUID novo (ou ausente): o telefone decide, pela regra de sempre.
  if v_por_bsuid is null then
    if v_phone is null then
      begin
        insert into public.contacts
          (organization_id, phone_number, wa_bsuid, source, consent, tags, source_metadata, display_name)
        values
          (p_org, null, v_bsuid, 'whatsapp', '{}'::jsonb, '{}'::text[],
           jsonb_build_object('notify_name', v_notify), v_notify)
        returning id into v_id;
      exception when unique_violation then
        select id into v_id from public.contacts
         where organization_id = p_org and wa_bsuid = v_bsuid and is_merged_into is null
         limit 1;
      end;
      return v_id;
    end if;

    v_id := public.fn_upsert_wa_contact(p_org, 'phone', v_phone, null, p_chat_id, p_notify);
    if v_bsuid is not null and v_id is not null then
      update public.contacts
         set wa_bsuid = v_bsuid, updated_at = now()
       where id = v_id and wa_bsuid is null;
      -- A ficha do telefone já tem OUTRO BSUID: o número mudou de dono, ou é o
      -- BSUID pai. Não sobrescreve identidade; registra para quem investigar.
      if not found then
        update public.contacts
           set source_metadata = source_metadata || jsonb_build_object('bsuid_em_conflito', v_bsuid)
         where id = v_id and wa_bsuid is distinct from v_bsuid;
      end if;
    end if;
    return v_id;
  end if;

  -- O BSUID achou a pessoa. O nome de perfil entra se a ficha não tiver.
  update public.contacts
     set display_name = coalesce(display_name, v_notify),
         source_metadata = source_metadata
           || case when v_notify is not null then jsonb_build_object('notify_name', v_notify) else '{}'::jsonb end,
         updated_at = now()
   where id = v_por_bsuid;

  -- Sem telefone novo, ou a ficha já tem o dela: é esta ficha.
  if v_phone is null or v_telefone_da_ficha is not null then
    return v_por_bsuid;
  end if;

  -- O telefone chegou junto e a ficha não tem. Mesma canonização do nono dígito
  -- que `fn_upsert_wa_contact` usa, para achar a grafia antiga também.
  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  if v_digits ~ '^55[1-9][0-9][6-9][0-9]{7}$' then
    v_alt := '+' || v_digits;
    v_phone := '+55' || substring(v_digits from 3 for 2) || '9' || substring(v_digits from 5);
  elsif v_digits ~ '^55[1-9][0-9]9[6-9][0-9]{7}$' then
    v_phone := '+' || v_digits;
    v_alt := '+55' || substring(v_digits from 3 for 2) || substring(v_digits from 6);
  else
    v_phone := '+' || v_digits;
  end if;

  select id into v_por_telefone from public.contacts
   where organization_id = p_org and is_merged_into is null
     and id <> v_por_bsuid
     and phone_number in (v_phone, v_alt)
   order by case when phone_number = v_phone then 0 else 1 end, created_at
   limit 1;

  if v_por_telefone is null then
    update public.contacts
       set phone_number = v_phone, updated_at = now()
     where id = v_por_bsuid;
    return v_por_bsuid;
  end if;

  -- O telefone é de OUTRA ficha viva: provavelmente a mesma pessoa, mas fundir é
  -- decisão de quem opera (ver o cabeçalho). A conversa segue na ficha do BSUID e
  -- o número fica estacionado para a tela de duplicados.
  update public.contacts
     set source_metadata = source_metadata || jsonb_build_object('telefone_em_conflito', v_phone),
         updated_at = now()
   where id = v_por_bsuid;
  return v_por_bsuid;
end; $$;

revoke execute on function public.fn_upsert_meta_contact(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_upsert_meta_contact(uuid, text, text, text, text) to service_role;

-- manifest: **Campanha oficial (issue #8).** `campaigns` ganha `meta_template_id` (o modelo aprovado, FK composta com a organização para `meta_templates`) e `template_variables` (jsonb objeto: slotKey → fonte do valor — campo do contato, campo personalizado ou texto fixo); com modelo a campanha sai pela API Oficial, sem modelo segue no modo WAHA. `fn_campanha_reservar_lote` reserva destinatários em lote com `FOR UPDATE SKIP LOCKED` (dois workers nunca pegam o mesmo). `fn_campanha_sincroniza_ack` passa a ler `delivered_at`/`read_at` além de `status`, porque o canal oficial grava entrega e leitura nessas colunas e mantém `status = 'sent'`. Idempotente.

-- 0538: a campanha pela API Oficial.
--
-- ─── O modo é CALCULADO, não guardado ───────────────────────────────────────
--
-- Doutrina DIRC: com `meta_template_id` a campanha é oficial; sem ele, é WAHA.
-- Uma coluna `modo` ao lado diria a mesma coisa de outro jeito, e no dia em que
-- as duas discordassem não haveria fonte da verdade. A coerência com o número
-- (modelo só em conexão `meta_cloud`) é conferida na rota, que é quem sabe o
-- provedor da conexão; um CHECK não alcança outra tabela.
--
-- ─── Por que FK para o modelo, e não nome + idioma ──────────────────────────
--
-- O nome + idioma é a identidade do modelo NA META, e é ela que o envio usa. Mas
-- a campanha guarda a ESCOLHA do operador, e escolha guardada por nome vira
-- inferência por nome (anti-pattern nº 4) no dia em que dois números de contas
-- diferentes tiverem modelos homônimos. A linha de `meta_templates` é única por
-- (organização, conta, nome, idioma) e nunca é apagada — a sincronização marca
-- `DISABLED` em vez de apagar —, então a FK não trava a sincronização.
-- Composta com a organização: o modelo de outro tenant não é referenciável.
--
-- ─── `template_variables` ───────────────────────────────────────────────────
--
-- Chave = `slotKey` (`lib/channels/meta/build-components.ts`), a mesma de
-- `template_values` no envio. Valor = `{tipo:'contato',campo}`,
-- `{tipo:'campo_personalizado',chave}` ou `{tipo:'fixo',valor}`. Schema central:
-- `mapaDeVariaveisSchema` em `lib/campanhas/variaveis-do-modelo.ts`.
--
-- ─── A reserva em lote ──────────────────────────────────────────────────────
--
-- O modo WAHA manda UM por número por rodada, de propósito (o ritmo anti-ban é o
-- produto) e reserva com compare-and-set. O modo oficial manda em LOTES
-- paralelos, e lote precisa de `SKIP LOCKED`: o laço contínuo do worker e o cron
-- de segurança podem rodar ao mesmo tempo, e o segundo deve pular as linhas que
-- o primeiro já pegou em vez de esperar por elas ou enviá-las de novo. O
-- PostgREST não expressa `SKIP LOCKED`; por isso a função.
--
-- `security invoker`: só o `service_role` a executa, e ele já ignora RLS. Uma
-- `security definer` aqui ampliaria o poder de quem chama sem necessidade.
--
-- ─── O ack do canal oficial ─────────────────────────────────────────────────
--
-- `lib/channels/meta/status-update.ts` mantém `messages.status` em
-- `sent | failed` de propósito (é o domínio que o resto do produto lê) e grava a
-- entrega e a leitura em `delivered_at` / `read_at`. A função comparava só
-- `status` e saía cedo quando ele não mudava — e por isso o destinatário de
-- campanha oficial nunca passava de "enviado". Agora ela compara o status
-- EFETIVO (`read` > `delivered` > o status gravado); o WAHA, que grava
-- `status = 'delivered' | 'read'` direto, chega ao mesmo resultado de antes.
-- As duas colunas de carimbo entram também no `update of`: o webhook de hoje
-- sempre escreve `status` (e `update of status` dispara mesmo sem mudança de
-- valor), mas uma escrita que só carimbe não pode passar despercebida.

alter table public.campaigns
  add column if not exists meta_template_id uuid,
  add column if not exists template_variables jsonb not null default '{}'::jsonb;

alter table public.campaigns drop constraint if exists campaigns_template_variables_objeto;
alter table public.campaigns
  add constraint campaigns_template_variables_objeto
  check (jsonb_typeof(template_variables) = 'object');

create unique index if not exists meta_templates_org_id_uniq
  on public.meta_templates (organization_id, id);

alter table public.campaigns drop constraint if exists campaigns_modelo_org_fk;
alter table public.campaigns
  add constraint campaigns_modelo_org_fk
  foreign key (organization_id, meta_template_id)
  references public.meta_templates (organization_id, id);

-- As campanhas de um modelo — o que a pausa por modelo rejeitado (issue #9) consulta.
create index if not exists idx_campaigns_modelo
  on public.campaigns (meta_template_id)
  where meta_template_id is not null;

comment on column public.campaigns.meta_template_id is
  'Modelo aprovado da Meta que a campanha envia (issue #8). Com ele a campanha é OFICIAL (lotes paralelos, sem ritmo anti-ban); sem ele, é do modo WAHA (texto em message_body). O modo é calculado daqui — não há coluna de modo.';
comment on column public.campaigns.template_variables is
  'De onde sai cada variável do modelo, por slotKey (lib/channels/meta/build-components.ts): {tipo:contato,campo} | {tipo:campo_personalizado,chave} | {tipo:fixo,valor}. Schema central: mapaDeVariaveisSchema (lib/campanhas/variaveis-do-modelo.ts).';

create or replace function public.fn_campanha_reservar_lote(
  p_campaign_id uuid,
  p_limite integer,
  p_agora timestamptz
)
returns table (
  id uuid,
  contact_id uuid,
  recipient_address text,
  attempt_count integer,
  variables jsonb,
  rendered_body text
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  with alvo as (
    select r.id
      from public.campaign_recipients r
     where r.campaign_id = p_campaign_id
       and r.status = 'pending'
       and (r.next_attempt_at is null or r.next_attempt_at <= p_agora)
     order by r.created_at, r.id
     limit greatest(p_limite, 0)
     for update of r skip locked
  )
  update public.campaign_recipients r
     set status = 'sending',
         sending_at = p_agora,
         last_attempt_at = p_agora,
         attempt_count = r.attempt_count + 1
    from alvo
   where r.id = alvo.id
  returning r.id, r.contact_id, r.recipient_address, r.attempt_count, r.variables, r.rendered_body;
$$;

comment on function public.fn_campanha_reservar_lote(uuid, integer, timestamptz) is
  'Campanha oficial (issue #8): reserva até p_limite destinatários pendentes e vencidos (pending → sending, attempt_count + 1) com FOR UPDATE SKIP LOCKED. Dois workers nunca pegam o mesmo destinatário.';

revoke execute on function public.fn_campanha_reservar_lote(uuid, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_campanha_reservar_lote(uuid, integer, timestamptz) to service_role;

create or replace function public.fn_campanha_sincroniza_ack() returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  -- O status EFETIVO da mensagem: o canal oficial grava entrega e leitura nas
  -- colunas de carimbo e mantém `status = 'sent'`; o WAHA grava no `status`.
  v_novo text := case
    when new.status = 'failed' then 'failed'
    when new.status = 'read' or (new.status in ('sent', 'delivered') and new.read_at is not null) then 'read'
    when new.status = 'delivered' or (new.status = 'sent' and new.delivered_at is not null) then 'delivered'
    else new.status end;
  v_velho text := case
    when old.status = 'failed' then 'failed'
    when old.status = 'read' or (old.status in ('sent', 'delivered') and old.read_at is not null) then 'read'
    when old.status = 'delivered' or (old.status = 'sent' and old.delivered_at is not null) then 'delivered'
    else old.status end;
  -- O destinatário que a mensagem diz ser o dela. Texto que não é uuid vira
  -- NULL: um metadata torto não pode abortar a gravação do ack.
  v_destinatario uuid := case
    when new.metadata->>'campaign_recipient_id' ~ '^[0-9a-fA-F-]{36}$'
      then (new.metadata->>'campaign_recipient_id')::uuid
    end;
begin
  if v_novo is not distinct from v_velho then
    return new;
  end if;

  update public.campaign_recipients r
     set message_id = coalesce(r.message_id, new.id),
         delivered_at = case
           when v_novo in ('delivered', 'read')
             then coalesce(r.delivered_at, new.delivered_at, now())
           else r.delivered_at end,
         read_at = case
           when v_novo = 'read' then coalesce(r.read_at, new.read_at, now())
           else r.read_at end,
         sent_at = case
           when v_novo in ('sent', 'delivered', 'read')
             then coalesce(r.sent_at, new.sent_at, now())
           else r.sent_at end,
         status = case
           when r.status in ('replied', 'opted_out', 'cancelled') then r.status
           when v_novo = 'read' then 'read'
           when v_novo = 'delivered' and r.status in ('queued', 'sending', 'sent') then 'delivered'
           when v_novo = 'sent' and r.status in ('queued', 'sending') then 'sent'
           when v_novo = 'failed' and r.status in ('queued', 'sending', 'sent') then 'failed'
           else r.status end,
         last_error_code = case
           when v_novo = 'failed' then coalesce(new.error_code, r.last_error_code)
           else r.last_error_code end,
         last_error_detail = case
           when v_novo = 'failed' then coalesce(new.error_message, r.last_error_detail)
           else r.last_error_detail end,
         updated_at = now()
   where r.message_id = new.id
      -- O ack que chega ANTES de o worker gravar `message_id` (a Meta aceitou e
      -- já mandou entregue/lido/falhou enquanto o worker ainda não voltou da
      -- chamada): o destinatário é achado pelo `campaign_recipient_id` que a
      -- própria mensagem carrega. Só ack ASSÍNCRONO (com `external_id`): o
      -- desfecho síncrono do envio é do worker, que o grava com o relógio dele.
      or (r.message_id is null
          and r.status = 'sending'
          and v_novo in ('delivered', 'read', 'failed')
          and new.external_id is not null
          and r.organization_id = new.organization_id
          and r.id = v_destinatario);

  return new;
end
$$;

comment on function public.fn_campanha_sincroniza_ack() is
  'Trigger de messages: leva o ack do canal (sent/delivered/read/failed) ao campaign_recipients daquela mensagem — por message_id, ou pelo campaign_recipient_id da mensagem quando o ack assíncrono chega antes de o worker gravar o vínculo. Lê o status efetivo (status, delivered_at, read_at). Status analítico nunca retrocede.';

revoke execute on function public.fn_campanha_sincroniza_ack() from public, anon, authenticated;
grant execute on function public.fn_campanha_sincroniza_ack() to service_role;

drop trigger if exists trg_messages_sincroniza_campanha on public.messages;
create trigger trg_messages_sincroniza_campanha
  after update of status, delivered_at, read_at on public.messages
  for each row
  when (new.direction = 'outbound')
  execute function public.fn_campanha_sincroniza_ack();

notify pgrst, 'reload schema';

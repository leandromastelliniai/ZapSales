-- manifest: **Os canais Zernio (WhatsApp e redes sociais) e Datafy saem do produto.** O produto passa a falar com o WhatsApp por QR (WAHA) e pela API oficial da Meta (Cloud API), mais a voz; os dois intermediários deixam de existir no código e no banco. Apaga as sessões `zernio`/`zernio_social`/`datafy` e tudo o que depende delas (varredura de FKs no catálogo), as conversas de rede social e o arquivo de webhook dos provedores que saíram (incluindo `nuvemshop`); derruba as colunas `zernio_*`/`datafy_*` de `channel_sessions` e seus índices únicos, `conversations.provider_conversation_id` (thread do intermediário) e a tabela `channel_integrations` (credencial do perfil social); reconstrói `channel_sessions_provider_check`/`_ref_check`, `conversations_channel_check` e `webhook_events_log_provider_check` com o vocabulário final. Idempotente.
-- remove-do-vocabulario: channel_sessions_provider_check = zernio, zernio_social, datafy | os três providers intermediários saem do produto; as sessões deles (e o que depende delas) são apagadas no passo 1, antes da reconstrução
-- remove-do-vocabulario: conversations_channel_check = instagram, facebook | as conversas de rede social só existiam pelo intermediário social que sai; o passo 1 as apaga antes da reconstrução
-- remove-do-vocabulario: webhook_events_log_provider_check = zernio, datafy, nuvemshop | o arquivo cru dos provedores que saíram do produto (os dois canais e a integração de loja da 0533) é apagado no passo 1, antes da reconstrução

-- 0534: remoção dos canais Zernio e Datafy.
--
-- ─── O que sai ──────────────────────────────────────────────────────────────
--
--   * `channel_sessions.provider` perde `zernio`, `zernio_social` e `datafy`;
--     as colunas `zernio_account_id`, `zernio_token_encrypted`,
--     `datafy_phone_number_id`, `datafy_waba_id` e `datafy_token_encrypted`
--     somem, com os dois índices únicos parciais que as travavam (0165, 0387);
--   * `conversations.provider_conversation_id` (0132) — a thread que o
--     intermediário inventava e devolvia pelo webhook. Os canais que ficam
--     derivam o destinatário do contato;
--   * `conversations.channel` volta a aceitar só `whatsapp` (as redes sociais
--     da 0368 só chegavam pelo intermediário social);
--   * `channel_integrations` (0368) — a credencial do perfil social;
--   * `webhook_events_log.provider` perde `zernio`, `datafy` e `nuvemshop`.
--
-- `contacts.social_identity` FICA: é uma chave de identidade opaca e neutra,
-- coberta pela fusão de contatos e pela cascata LGPD; tirá-la exigiria reescrever
-- essas funções sem ganho para quem fica.
--
-- ─── Ordem ──────────────────────────────────────────────────────────────────
--
--   1. DADOS antes de DDL: as linhas que violariam o vocabulário novo saem
--      primeiro (doutrina, item 8), senão a reconstrução das constraints falha;
--   2. a constraint que cita as colunas sai antes delas;
--   3. índices, colunas e tabela;
--   4. as quatro constraints com o vocabulário final, cada uma `drop if exists`
--      + `add` (re-aplicável).
--
-- ─── Por que a varredura de dependentes é pelo CATÁLOGO ─────────────────────
--
-- `conversations`, `messages`, `campaigns`, `ai_agent_versions` e outras
-- apontam para `channel_sessions` com `on delete restrict`/`no action`, e os
-- filhos delas têm os mesmos tipos de FK. Uma lista escrita à mão fica velha na
-- próxima tabela que ganhar FK para a sessão. O bloco abaixo lê `pg_constraint`
-- a partir de cada raiz, segue toda FK `restrict`/`no action`/`cascade` (as
-- `set null` o Postgres resolve sozinho), e apaga de baixo para cima. Em banco
-- sem nenhuma linha dos providers removidos — o caso de toda instalação nova —
-- o bloco sai na primeira consulta, sem montar nada.
--
-- Os limites (profundidade 8, 2000 passos) não truncam: se forem atingidos, o
-- bloco LANÇA e nada é apagado, porque apagar só metade deixaria a reconstrução
-- falhar adiante com a tabela já sem parte do histórico.

-- ─── 1. Dados ───────────────────────────────────────────────────────────────
do $remocao_0534$
declare
  v_raiz_tab regclass[] := array[]::regclass[];
  v_raiz_fil text[] := array[]::text[];
  v_tabelas regclass[] := array[]::regclass[];
  v_filtros text[] := array[]::text[];
  v_niveis int[] := array[]::int[];
  v_tem boolean;
  v_i int;
  v_fk record;
begin
  if to_regclass('public.channel_sessions') is not null then
    v_raiz_tab := v_raiz_tab || to_regclass('public.channel_sessions');
    v_raiz_fil := v_raiz_fil || $f$provider not in ('waha', 'meta_cloud', 'wacalls')$f$::text;
  end if;
  if to_regclass('public.conversations') is not null then
    v_raiz_tab := v_raiz_tab || to_regclass('public.conversations');
    v_raiz_fil := v_raiz_fil || $f$channel <> 'whatsapp'$f$::text;
  end if;
  if to_regclass('public.webhook_events_log') is not null then
    v_raiz_tab := v_raiz_tab || to_regclass('public.webhook_events_log');
    v_raiz_fil := v_raiz_fil || $f$provider not in ('waha', 'generic', 'meta_cloud')$f$::text;
  end if;

  for v_i in 1 .. coalesce(array_length(v_raiz_tab, 1), 0) loop
    execute format('select exists (select 1 from %s where %s)', v_raiz_tab[v_i], v_raiz_fil[v_i])
      into v_tem;
    if v_tem then
      v_tabelas := v_tabelas || v_raiz_tab[v_i];
      v_filtros := v_filtros || v_raiz_fil[v_i];
      v_niveis := v_niveis || 0;
    end if;
  end loop;

  if coalesce(array_length(v_tabelas, 1), 0) = 0 then
    return;
  end if;

  -- Largura primeiro: todo filho entra DEPOIS do pai na lista, então apagar a
  -- lista de trás para frente apaga sempre os filhos antes.
  v_i := 1;
  while v_i <= array_length(v_tabelas, 1) loop
    if array_length(v_tabelas, 1) > 2000 then
      raise exception '0534: a varredura de dependentes passou de 2000 passos — nada foi apagado';
    end if;
    for v_fk in
      select c.conrelid::regclass as filho,
             (select string_agg(format('%I', a.attname), ', ' order by k.ord)
                from unnest(c.conkey) with ordinality as k(attnum, ord)
                join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols_filho,
             (select string_agg(format('%I', a.attname), ', ' order by k.ord)
                from unnest(c.confkey) with ordinality as k(attnum, ord)
                join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as cols_pai
        from pg_constraint c
       where c.contype = 'f'
         and c.conparentid = 0
         and c.confrelid = v_tabelas[v_i]
         and c.conrelid <> c.confrelid
         and c.confdeltype in ('a', 'r', 'c')
       order by c.conname
    loop
      if v_niveis[v_i] >= 8 then
        raise exception '0534: dependência mais funda que 8 níveis a partir de % — nada foi apagado',
          v_tabelas[v_i];
      end if;
      v_tabelas := v_tabelas || v_fk.filho;
      v_filtros := v_filtros || format('(%s) in (select %s from %s where %s)',
        v_fk.cols_filho, v_fk.cols_pai, v_tabelas[v_i], v_filtros[v_i]);
      v_niveis := v_niveis || (v_niveis[v_i] + 1);
    end loop;
    v_i := v_i + 1;
  end loop;

  for v_i in reverse array_length(v_tabelas, 1) .. 1 loop
    execute format('delete from %s where %s', v_tabelas[v_i], v_filtros[v_i]);
  end loop;
end
$remocao_0534$;

-- ─── 2. A constraint que cita as colunas sai antes delas ────────────────────
alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_ref_check;

-- ─── 3. Índices, colunas e tabela ───────────────────────────────────────────
drop index if exists public.channel_sessions_zernio_account_id_ativo_unique;
drop index if exists public.channel_sessions_datafy_phone_number_id_ativo_unique;
drop index if exists public.idx_conversations_provider_conversation_id;

alter table public.channel_sessions
  drop column if exists zernio_account_id,
  drop column if exists zernio_token_encrypted,
  drop column if exists datafy_phone_number_id,
  drop column if exists datafy_waba_id,
  drop column if exists datafy_token_encrypted;

alter table public.conversations
  drop column if exists provider_conversation_id;

drop table if exists public.channel_integrations;

-- ─── 4. O vocabulário final ─────────────────────────────────────────────────
alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_check;
alter table public.channel_sessions
  add constraint channel_sessions_provider_check
  check (provider in ('waha', 'meta_cloud', 'wacalls'));

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_ref_check;
alter table public.channel_sessions
  add constraint channel_sessions_provider_ref_check check (
    (provider = 'waha'       and waha_session_name    is not null) or
    (provider = 'meta_cloud' and meta_phone_number_id is not null) or
    (provider = 'wacalls'    and wacalls_session_id   is not null)
  );

alter table public.conversations
  drop constraint if exists conversations_channel_check;
alter table public.conversations
  add constraint conversations_channel_check
  check (channel in ('whatsapp'));

alter table public.webhook_events_log
  drop constraint if exists webhook_events_log_provider_check;
alter table public.webhook_events_log
  add constraint webhook_events_log_provider_check
  check (provider in ('waha', 'generic', 'meta_cloud'));

notify pgrst, 'reload schema';

-- manifest: **Cabeçalho de modelo sem uso sai do storage (issue #21).** `fn_enfileirar_midia_vencida` (passo 2) passa a tratar como órfão o arquivo de `<org>/templates/` com mais de 7 dias que nenhum slot de `meta_templates.header_media` cita (`jsonb_each(header_media) → value->>'path'`). Antes a pasta nunca era podada, e trocar o arquivo no editor, abandonar o editor ou recriar um modelo desativado deixava o anterior no bucket para sempre. Idempotente.

-- 0542: os órfãos da pasta de cabeçalho de modelo entram na poda.
--
-- ─── O defeito ──────────────────────────────────────────────────────────────
--
-- A cópia da mídia do cabeçalho (0537, issue #7) mora no bucket
-- `whatsapp-media`, em `<org>/templates/<uuid>.<ext>`, e o modelo a cita por
-- CAMINHO em `header_media`, por slot do envio (`header:1`, `card0:header:1`).
-- O passo 2 desta função só olhava `<org>/<conversa>/…` e `<org>/avatars/…`.
-- Três caminhos deixavam arquivo sem dono, na mesma cota do bucket:
--
--   1. o operador troca o arquivo no editor — o anterior já tinha subido;
--   2. o operador abandona o editor depois do upload;
--   3. um modelo DESATIVADO é recriado e o envio troca `header_media` inteiro.
--
-- ─── O conserto ─────────────────────────────────────────────────────────────
--
-- A pasta `templates` entra no passo 2 com duas diferenças das outras:
--
--   · CARÊNCIA DE 7 DIAS, não 1. O editor sobe o arquivo antes de o modelo
--     existir (o caminho volta no corpo da criação), e o operador pode levar
--     dias para submeter. Apagar antes seria o pior desfecho: o modelo nasce
--     citando um arquivo que já não está lá, e o primeiro disparo falha.
--   · QUEM SEGURA O CAMINHO é qualquer slot de qualquer linha de
--     `meta_templates.header_media`. Não importa o status do modelo: um
--     PAUSED ou PENDING volta a disparar, e o arquivo é o que ele assina.
--     O `not exists` vira anti-join com hash — uma passada por `meta_templates`
--     por rodada, não uma por objeto.
--
-- Slot malformado (valor que não é objeto) não derruba a rodada: `->>` em
-- escalar devolve null, e null não segura caminho nenhum. O CHECK da 0537
-- garante que a coluna em si é objeto, então `jsonb_each` não estoura.
--
-- O resto do corpo é a 0483 sem mudança. A contagem desses órfãos entra em
-- `orfas`: é a mesma categoria — arquivo sem ponteiro — e a chave de retorno
-- não muda.
--
-- Prova: tests/invariants/poda-de-midia-cabecalho-de-modelo.test.ts.

create or replace function public.fn_enfileirar_midia_vencida(p_limite integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_lim integer := greatest(1, least(coalesce(p_limite, 500), 5000));
  v_vencidas integer := 0;
  v_orfas integer := 0;
  -- Órfãos do bucket PRÓPRIO da nota interna (0483). Contam em `v_orfas`:
  -- é a mesma categoria — arquivo sem ponteiro — e a chave de retorno não
  -- muda (o `toEqual` congelado de `poda-de-midia.test.ts` mede as três).
  v_orfas_nota integer := 0;
  -- O que o expurgo apagou NESTA chamada (#1765). Começa em 0 para que a
  -- rodada sem nada a expurgar devolva 0 — e não null, que o cron somaria
  -- como se fosse apagado.
  v_expurgadas integer := 0;
  -- Janela do expurgo, em UM lugar só: é a constante que se muda amanhã.
  v_janela_deleted interval := interval '90 days';
begin
  -- 0. EXPURGO: a linha `deleted` da RETENÇÃO já cumpriu o papel (o arquivo
  --    saiu do bucket) e nada mais precisa dela — sem isto a fila cresce sem
  --    teto (#1739, item 2). Só `deleted`: `skipped` é «o objeto já não
  --    existe», `failed` é a prova de uma remoção que nunca passou das 3
  --    tentativas, e a issue manda não mexer em nenhuma das duas.
  --    E só a de retenção (`request_id is null`): a linha de pedido LGPD é o
  --    ÚNICO registro por objeto de que a mídia do titular saiu do bucket — o
  --    worker só troca o `status` e nada audita a remoção física. Ela sai
  --    sozinha se o pedido for apagado (FK `on delete set null`).
  --    O `GET DIAGNOSTICS` conta o que o DELETE apagou NESTA chamada (#1765):
  --    sem ele a rodada que só expurgou é indistinguível, na trilha, da rodada
  --    que não tinha o que fazer.
  delete from public.storage_redaction_queue
   where status = 'deleted'
     and request_id is null
     and coalesce(processed_at, enqueued_at) < now() - v_janela_deleted;
  get diagnostics v_expurgadas = row_count;

  -- 1. VENCIDAS: arquivo de mensagem mais velho que a retenção da organização.
  --    A mensagem fica (texto, status, horário); só o arquivo sai, e a tela
  --    mostra «Mídia indisponível». O piso de 30 dias é o mesmo do formulário.
  with alvo as (
    select m.id, m.organization_id, m.media_storage_path as caminho
      from public.messages m
      join public.organizations o on o.id = m.organization_id
     where m.media_storage_path is not null
       and m.created_at < now() - make_interval(days => greatest(coalesce(o.media_retention_days, 365), 30))
     order by m.created_at
     limit v_lim
     for update of m skip locked
  ), fila as (
    -- O arquivo só vai para a fila quando nenhuma OUTRA mensagem o usa: a foto
    -- de catálogo tem caminho fixo por conversa e é reaproveitada a cada
    -- reenvio (`fotos-do-produto.ts`), então a mensagem de ontem pode apontar
    -- para o mesmo arquivo da vencida. A vencida perde o caminho do mesmo
    -- jeito; o arquivo sai quando a última referência vencer (aqui) ou no
    -- passo 2, como órfão.
    --
    -- O `do update` é o conserto do #1739: se aquele caminho já saiu da fila
    -- (`deleted`) ou o objeto já nem existia (`skipped`), um arquivo NOVO pode
    -- estar gravado ali agora — e o `do nothing` da 0432 engolia este pedido
    -- silenciosamente, deixando o arquivo novo fora da retenção PARA SEMPRE.
    -- O `where` é a outra metade do conserto: `pending`/`failed` em curso não
    -- são interrompidos (uma remoção em andamento não perde a tentativa).
    insert into public.storage_redaction_queue (organization_id, bucket, object_path)
    select distinct a.organization_id, 'whatsapp-media', a.caminho
      from alvo a
     where not exists (
       select 1 from public.messages m2
        where m2.media_storage_path = a.caminho
          and m2.id not in (select id from alvo)
     )
    on conflict (bucket, object_path) do update
      set status = 'pending',
          attempts = 0,
          enqueued_at = now(),
          processed_at = null,
          error_message = null
      where storage_redaction_queue.status in ('deleted', 'skipped')
    returning 1
  ), limpas as (
    update public.messages m
       set media_storage_path = null, updated_at = now()
      from alvo
     where m.id = alvo.id
    returning 1
  )
  select count(*) into v_vencidas from limpas;

  -- 2. ÓRFÃOS: arquivo que nada no banco aponta. Três pastas, cada uma com a
  --    referência que segura o caminho e a carência do seu upload:
  --      · `org/<conversa>/…` (mensagem) e `org/avatars/…` (contato): um dia,
  --        que cobre o envio que sobe o arquivo antes de gravar a mensagem;
  --      · `org/templates/…` (cabeçalho de modelo, 0542 / #21): SETE dias. O
  --        editor sobe o arquivo antes de o modelo existir, e o operador pode
  --        levar dias para submeter. Quem segura o caminho é QUALQUER slot de
  --        QUALQUER `meta_templates.header_media` (`{ slot: { path, … } }`) —
  --        é o arquivo que o próximo disparo assina. Sem isto, trocar o arquivo
  --        no editor, abandonar o editor ou recriar um modelo desativado
  --        deixava o anterior no bucket para sempre.
  --    Valor malformado num slot não derruba a rodada: `->>` em escalar dá
  --    null, e null não segura caminho nenhum.
  with orfaos as (
    select o.name as caminho, split_part(o.name, '/', 1)::uuid as org
      from storage.objects o
     where o.bucket_id = 'whatsapp-media'
       and split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and exists (select 1 from public.organizations g where g.id::text = split_part(o.name, '/', 1))
       and (
         (
           (
             split_part(o.name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             or split_part(o.name, '/', 2) = 'avatars'
           )
           and o.created_at < now() - interval '1 day'
         )
         or (
           split_part(o.name, '/', 2) = 'templates'
           and o.created_at < now() - interval '7 days'
         )
       )
       and not exists (select 1 from public.messages m where m.media_storage_path = o.name)
       and not exists (select 1 from public.contacts c where c.avatar_storage_path = o.name)
       and not exists (
         select 1 from public.meta_templates t
          cross join lateral jsonb_each(t.header_media) h
          where h.value ->> 'path' = o.name
       )
       -- Só linha EM CURSO segura o caminho (`pending`, ou `failed` que ainda
       -- é o registro de uma remoção não feita). Linha `deleted`/`skipped`
       -- NÃO bloqueia mais: é justamente o caso do avatar reaproveitado
       -- (#1739) — o objeto novo no caminho antigo tinha de chegar no conflito
       -- lá embaixo para ser reaberto, e este `not exists` o engolia antes.
       and not exists (
         select 1 from public.storage_redaction_queue q
          where q.bucket = 'whatsapp-media' and q.object_path = o.name
            and q.status not in ('deleted', 'skipped')
       )
     limit v_lim
  ), fila as (
    insert into public.storage_redaction_queue (organization_id, bucket, object_path)
    select org, 'whatsapp-media', caminho from orfaos
    on conflict (bucket, object_path) do update
      set status = 'pending',
          attempts = 0,
          enqueued_at = now(),
          processed_at = null,
          error_message = null
      where storage_redaction_queue.status in ('deleted', 'skipped')
    returning 1
  )
  select count(*) into v_orfas from fila;


  -- 2b. ÓRFÃOS DA NOTA INTERNA (migration 0483): o passo 2 varre SÓ o bucket
  --     `whatsapp-media` (filtro `bucket_id`), então um anexo de nota nunca
  --     entraria na conta — e a nota que o atendente apagou deixaria o arquivo
  --     para sempre no `internal-media`, custo que só cresce. Mesmo desenho do
  --     passo 2, com as duas pontas certas: bucket `internal-media` e
  --     `conversation_notes.media_storage_path` como a referência que segura o
  --     caminho. Um dia de carência cobre o upload que sobe ANTES de a nota ser
  --     gravada (é a ordem do composer), como o passo 2 cobre o envio.
  --     Uma linha `pending`/`failed` em curso segura o caminho; `deleted`/
  --     `skipped` não, pelo mesmo motivo escrito no passo 2 (caminho reuso).
  with orfaos_da_nota as (
    select o.name as caminho, split_part(o.name, '/', 1)::uuid as org
      from storage.objects o
     where o.bucket_id = 'internal-media'
       and o.created_at < now() - interval '1 day'
       and split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and exists (select 1 from public.organizations g where g.id::text = split_part(o.name, '/', 1))
       and split_part(o.name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not exists (
         select 1 from public.conversation_notes n where n.media_storage_path = o.name
       )
       and not exists (
         select 1 from public.storage_redaction_queue q
          where q.bucket = 'internal-media' and q.object_path = o.name
            and q.status not in ('deleted', 'skipped')
       )
     limit v_lim
  ), fila_da_nota as (
    insert into public.storage_redaction_queue (organization_id, bucket, object_path)
    select org, 'internal-media', caminho from orfaos_da_nota
    on conflict (bucket, object_path) do update
      set status = 'pending',
          attempts = 0,
          enqueued_at = now(),
          processed_at = null,
          error_message = null
      where storage_redaction_queue.status in ('deleted', 'skipped')
    returning 1
  )
  select count(*) into v_orfas_nota from fila_da_nota;
  v_orfas := v_orfas + v_orfas_nota;
  return jsonb_build_object('vencidas', v_vencidas, 'orfas', v_orfas, 'expurgadas', v_expurgadas);
end;
$$;

revoke execute on function public.fn_enfileirar_midia_vencida(integer) from public, anon, authenticated;
grant execute on function public.fn_enfileirar_midia_vencida(integer) to service_role;

notify pgrst, 'reload schema';

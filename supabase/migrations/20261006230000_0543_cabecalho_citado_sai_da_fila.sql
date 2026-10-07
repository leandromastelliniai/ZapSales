-- manifest: **Cabeçalho citado por modelo sai da fila de remoção (issue #30).** Gatilho `trg_meta_templates_cabecalho_citado` (`after insert or update of header_media`) marca `skipped` (`citado_por_modelo`) a linha `pending` de retenção (`request_id is null`) de cada caminho que o modelo passa a citar, na mesma organização. Antes, o caminho enfileirado pela 0542 continuava na fila, e o worker apagava o arquivo que a campanha ia assinar. Idempotente.

-- 0543: o modelo que passa a citar um cabeçalho enfileirado o tira da fila.
--
-- ─── O defeito ──────────────────────────────────────────────────────────────
--
-- Desde a 0542 (#21) a retenção enfileira o arquivo de `<org>/templates/` com
-- mais de 7 dias que nenhum `meta_templates.header_media` cita. Depois que o
-- caminho entra na fila (`pending`), nada o tirava de lá quando um modelo
-- passava a citá-lo, e o worker (`lib/lgpd/storage-redaction-queue.ts`) apaga
-- sem perguntar quem cita. Dois caminhos levam a isso:
--
--   1. o operador deixa o editor aberto mais de 7 dias e só então envia;
--   2. um envio que a Meta recusou é tentado de novo, depois de 7 dias, com o
--      caminho antigo.
--
-- A Meta aprova (ela guarda a própria amostra), e o espelho cita um arquivo que
-- saiu do bucket: o disparo de campanha que usar a cópia não tem o que mandar.
--
-- ─── O conserto, em três pontas ─────────────────────────────────────────────
--
--   · AQUI: ao gravar `header_media`, a linha `pending` de cada caminho citado
--     vira `skipped` com `error_message = 'citado_por_modelo'`. Vale para
--     qualquer escritor da coluna, não só a rota do editor. `skipped` não
--     prende o caminho: se o modelo largar o arquivo, o passo 2 da poda o vê
--     órfão de novo e o `on conflict` o reabre (`skipped` → `pending`).
--   · NO WORKER (`lib/lgpd/storage-redaction-queue.ts`): reivindica cada
--     linha (`update … where status = 'pending'`) antes de apagar — o lote é
--     lido de uma vez, e este gatilho pode tirar a linha da fila no meio dele —
--     e, na linha de retenção de `<org>/templates/`, confere de novo se algum
--     modelo da organização cita o caminho. Esta conferência cobre o que o
--     gatilho não alcança: a poda lê `meta_templates` no snapshot dela, e o
--     modelo gravado durante a rodada não acha linha `pending` para tirar.
--   · NA ROTA DE CRIAÇÃO: recusa (422 `midia_indisponivel`) o caminho que já
--     saiu do bucket ou que está `pending`, antes de ir à Meta — o arquivo já
--     apagado não tem conserto no banco. O editor limpa o campo e pede o
--     arquivo de novo.
--
-- Resta uma janela de uma chamada ao Storage: o modelo gravado entre a
-- reivindicação/conferência do worker e o `remove`. É a mesma ordem de grandeza
-- de qualquer verificação feita antes de um efeito externo, e fechá-la pediria
-- trava entre o worker e a gravação do modelo.
--
-- Fica de fora, de propósito:
--   · linha de pedido LGPD (`request_id` não nulo): a cascata do titular não é
--     cancelada por citação de modelo. Ela não enfileira `templates/`; o filtro
--     só garante que nunca vá cancelar;
--   · linha de OUTRA organização: o modelo de A não segura arquivo de B (a rota
--     já recusa caminho alheio; o filtro é a defesa do banco);
--   · `failed`: já é terminal, e o objeto continua no bucket.
--
-- Slot malformado (valor que não é objeto) não derruba a gravação do modelo:
-- `jsonb_typeof` o descarta antes do `->>`. O CHECK da 0537 garante que a
-- coluna é objeto; a guarda no topo do corpo só torna o gatilho indiferente a
-- isso.
--
-- Prova: tests/invariants/cabecalho-citado-sai-da-fila.test.ts.

create or replace function public.fn_cabecalho_citado_sai_da_fila()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_typeof(new.header_media) is distinct from 'object' then
    return null;
  end if;

  update public.storage_redaction_queue q
     set status = 'skipped',
         processed_at = now(),
         error_message = 'citado_por_modelo'
    from jsonb_each(new.header_media) h
   where jsonb_typeof(h.value) = 'object'
     and q.object_path = h.value ->> 'path'
     and q.bucket = 'whatsapp-media'
     and q.organization_id = new.organization_id
     and q.request_id is null
     and q.status = 'pending';

  return null;
end;
$$;

revoke execute on function public.fn_cabecalho_citado_sai_da_fila() from public, anon, authenticated;

drop trigger if exists trg_meta_templates_cabecalho_citado on public.meta_templates;
create trigger trg_meta_templates_cabecalho_citado
  after insert or update of header_media on public.meta_templates
  for each row execute function public.fn_cabecalho_citado_sai_da_fila();

-- manifest: **Mídia citada por mensagem sai da fila de remoção (issue #40).** Gatilho `trg_messages_midia_citada` (`after insert or update of media_storage_path`, só quando o caminho não é nulo) marca `skipped` (`citado_por_mensagem`) a linha `pending` de retenção (`request_id is null`) do caminho que a mensagem passa a citar, na mesma organização. Antes, o arquivo de `<org>/<conversa>/` enfileirado como órfão pelo passo 2 da poda (1 dia) continuava na fila, e o worker apagava a mídia da mensagem criada depois. Idempotente.

-- 0544: a mensagem que passa a citar uma mídia enfileirada a tira da fila.
--
-- ─── O defeito ──────────────────────────────────────────────────────────────
--
-- O envio de mídia tem dois passos: o arquivo sobe por
-- `POST /api/v1/conversations/[id]/media` para `whatsapp-media/<org>/<conversa>/…`,
-- e a mensagem é criada depois, por `POST /api/v1/messages`, com o
-- `media_storage_path` no corpo. O passo 2 da poda (`fn_enfileirar_midia_vencida`)
-- enfileira o arquivo dessa pasta com mais de 1 dia que nenhuma mensagem cita.
-- Depois que o caminho entra na fila (`pending`), nada o tirava de lá quando uma
-- mensagem passava a citá-lo, e o worker (`lib/lgpd/storage-redaction-queue.ts`)
-- apagava sem perguntar quem cita. Quem sobe o arquivo e só cria a mensagem
-- mais de 1 dia depois — o integrador que guarda o caminho para enviar depois —
-- ficava com uma mensagem cujo arquivo sai do bucket: "Mídia indisponível" na
-- tela, e nada para mandar ao WhatsApp.
--
-- É o desenho que a 0543 consertou para o cabeçalho de modelo (#30), com 1 dia
-- de carência em vez de 7.
--
-- ─── O conserto, em três pontas ─────────────────────────────────────────────
--
--   · AQUI: ao gravar `media_storage_path`, a linha `pending` do caminho citado
--     vira `skipped` com `error_message = 'citado_por_mensagem'`. Vale para
--     qualquer escritor da coluna (a rota de envio, o worker que persiste a
--     mídia recebida, a proposta). `skipped` não prende o caminho: se a
--     mensagem largar o arquivo, o passo 2 da poda o vê órfão de novo e o
--     `on conflict` o reabre (`skipped` → `pending`).
--   · NO WORKER: já reivindica cada linha (`update … where status = 'pending'`)
--     antes de apagar (0543); agora também confere, na linha de retenção de
--     `<org>/<conversa>/`, se alguma mensagem DAQUELA conversa cita o caminho
--     (o filtro pela conversa é o que mantém a consulta no índice; não há
--     índice em `media_storage_path`). Cobre o que este gatilho não alcança:
--     a poda lê `messages` no snapshot dela, e a mensagem gravada durante a
--     rodada não acha linha `pending` para tirar. Não cobre a mensagem dessa
--     rodada que uma mescla de contatos (`fn_mesclar_contatos`) moveu para
--     outra conversa antes de o worker chegar.
--   · NA ROTA DE ENVIO: recusa (422 `media_unavailable`) o caminho que já saiu
--     do bucket — o arquivo apagado não tem conserto no banco. O caminho
--     `pending` NÃO é recusado, ao contrário da rota de modelo da #30: a foto
--     de catálogo tem caminho fixo por conversa (`catalogo-<arquivo>`,
--     `fotos-do-produto.ts`) e é reaproveitada a cada reenvio; recusá-la
--     quebraria o reenvio. A mensagem que a rota grava tira o caminho da fila
--     por este gatilho.
--
-- ─── O custo, porque `messages` é tabela quente ─────────────────────────────
--
-- O gatilho tem `when (new.media_storage_path is not null)`: mensagem de texto
-- — a maioria — não chama a função. A linha com mídia faz um `update` que acha
-- a linha da fila pelo índice único `(bucket, object_path)`; sem linha
-- pendente, é uma sonda de índice que não escreve nada. O `update of` só
-- dispara quando a coluna está no `set` (a poda que limpa o caminho da vencida
-- grava null, e o `when` a descarta).
--
-- Resta uma janela de uma chamada ao Storage: a mensagem gravada entre a
-- conferência do worker e o `remove`. É MAIOR que a da 0543: lá a rota recusa
-- o caminho `pending` (a reivindicação do worker deixa a linha `pending`), e
-- aqui não recusa, pelo motivo da foto de catálogo acima. Nessa janela a rota
-- responde 201 e o arquivo sai.
--
-- Fica de fora, de propósito:
--   · linha de pedido LGPD (`request_id` não nulo): a cascata do titular não é
--     cancelada por uma mensagem que cite o caminho;
--   · linha de OUTRA organização: a mensagem de A não segura arquivo de B (a
--     rota já recusa caminho fora da conversa; o filtro é a defesa do banco);
--   · `failed`: já é terminal, e o objeto continua no bucket.
--
-- Prova: tests/invariants/midia-de-mensagem-citada-sai-da-fila.test.ts e
-- tests/invariants/worker-nao-apaga-midia-de-mensagem-citada.test.ts.

create or replace function public.fn_midia_citada_sai_da_fila()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.storage_redaction_queue q
     set status = 'skipped',
         processed_at = now(),
         error_message = 'citado_por_mensagem'
   where q.bucket = 'whatsapp-media'
     and q.object_path = new.media_storage_path
     and q.organization_id = new.organization_id
     and q.request_id is null
     and q.status = 'pending';

  return null;
end;
$$;

revoke execute on function public.fn_midia_citada_sai_da_fila() from public, anon, authenticated;

drop trigger if exists trg_messages_midia_citada on public.messages;
create trigger trg_messages_midia_citada
  after insert or update of media_storage_path on public.messages
  for each row
  when (new.media_storage_path is not null)
  execute function public.fn_midia_citada_sai_da_fila();

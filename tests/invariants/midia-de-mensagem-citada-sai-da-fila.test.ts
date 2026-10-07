/**
 * A mensagem que passa a citar uma mídia enfileirada a tira da fila (issue #40, migration 0544).
 *
 * O envio de mídia tem dois passos: o arquivo sobe para
 * `whatsapp-media/<org>/<conversa>/…` e a mensagem é criada depois, com o
 * `media_storage_path` no corpo. A poda (`fn_enfileirar_midia_vencida`, passo 2)
 * enfileira o arquivo dessa pasta com mais de 1 dia que nenhuma mensagem cita.
 * Antes da 0544, nada tirava o caminho da fila quando uma mensagem passava a
 * citá-lo — o integrador que guarda o caminho e envia depois — e o worker
 * apagava o arquivo da mensagem recém-criada: "Mídia indisponível" na tela e
 * nada para mandar ao WhatsApp.
 *
 * Mesmo desenho da 0543 (cabeçalho de modelo, #30). O que este arquivo vigia:
 *   - o caminho citado sai da fila, no INSERT e no UPDATE de `media_storage_path`;
 *   - o não citado continua na fila (controle positivo);
 *   - linha que não é de retenção ou não está `pending` não é tocada;
 *   - uma mensagem não tira da fila arquivo de OUTRA organização;
 *   - o laço fecha: citado não volta à fila, e a mensagem que larga o caminho o
 *     devolve à poda na rodada seguinte;
 *   - `messages` é tabela quente: o gatilho só dispara para linha com mídia.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

const ORG = "44000000-0000-4000-8000-000000000001";
const OUTRA_ORG = "44000000-0000-4000-8000-000000000002";
const CONTATO = "44000000-0000-4000-8000-000000000003";
const SESSAO = "44000000-0000-4000-8000-000000000004";
const CONVERSA = "44000000-0000-4000-8000-000000000005";
const OUTRA_CONVERSA = "44000000-0000-4000-8000-000000000006";
const MENSAGEM = "44000000-0000-4000-8000-0000000000a1";
const PEDIDO_LGPD = "44000000-0000-4000-8000-0000000000c1";

const pasta = (org: string, conversa: string, nome: string) => `${org}/${conversa}/${nome}`;
const NA_FILA = pasta(ORG, CONVERSA, "foto.jpg");
const NO_UPDATE = pasta(ORG, CONVERSA, "audio.ogg");
const NAO_CITADO = pasta(ORG, CONVERSA, "esquecido.pdf");
const FALHOU = pasta(ORG, CONVERSA, "falhou.jpg");
const DO_PEDIDO_LGPD = pasta(ORG, CONVERSA, "titular.jpg");
const DA_OUTRA_ORG = pasta(OUTRA_ORG, OUTRA_CONVERSA, "alheio.jpg");

const linha = (p: string) =>
  lastLine(
    sql(
      `select status || '|' || coalesce(error_message, '') || '|' || (processed_at is not null)::text
         from storage_redaction_queue where bucket = 'whatsapp-media' and object_path = '${p}'`,
    ),
  );

const rodarPoda = () =>
  JSON.parse(lastLine(sql(`select public.fn_enfileirar_midia_vencida(500)::text`)));

function enviar(caminho: string | null, id = MENSAGEM): void {
  sql(`insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
                             type, direction, status, body, sent_via, sent_at, media_storage_path)
       values ('${id}', '${ORG}', '${CONVERSA}', '${SESSAO}', '${CONTATO}',
               '${caminho ? "image" : "text"}', 'outbound', 'queued', ${caminho ? "null" : "'oi'"},
               'system', now(), ${caminho ? `'${caminho}'` : "null"})`);
}

beforeEach(() => {
  sql(`
    insert into storage.buckets (id, name) values ('whatsapp-media', 'whatsapp-media') on conflict (id) do nothing;
    delete from storage_redaction_queue where organization_id in ('${ORG}', '${OUTRA_ORG}');
    delete from storage.objects where name like '${ORG}/%' or name like '${OUTRA_ORG}/%';
    delete from messages where organization_id = '${ORG}';
    delete from conversations where organization_id = '${ORG}';
    delete from channel_sessions where organization_id = '${ORG}';
    delete from contacts where organization_id = '${ORG}';
    delete from lgpd_requests where id = '${PEDIDO_LGPD}';
    insert into organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'org-midia-440', 'Org Midia 440 LTDA', 'Org Midia 440'),
             ('${OUTRA_ORG}', 'org-midia-440-b', 'Outra Midia 440 LTDA', 'Outra Midia 440')
      on conflict (id) do nothing;
    insert into contacts (id, organization_id, name, phone_number)
      values ('${CONTATO}', '${ORG}', 'Cliente', '+5511900000440');
    insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
      values ('${SESSAO}', '${ORG}', 'midia-440', 'WORKING', '\\x00'::bytea);
    insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
      values ('${CONVERSA}', '${ORG}', '${CONTATO}', '${SESSAO}', 'open', false);
    insert into lgpd_requests (id, organization_id, request_type, source, due_at)
      values ('${PEDIDO_LGPD}', '${ORG}', 'redact', 'manual', now() + interval '15 days');
    insert into storage.objects (bucket_id, name, metadata, created_at)
      select 'whatsapp-media', p, '{"size": 1000}'::jsonb, now() - interval '2 days'
        from unnest(array['${NA_FILA}', '${NO_UPDATE}', '${NAO_CITADO}', '${FALHOU}', '${DO_PEDIDO_LGPD}', '${DA_OUTRA_ORG}']) p;
    -- O que a poda deixou na fila: retenção pendente, uma falha terminal e uma do pedido LGPD.
    insert into storage_redaction_queue (organization_id, bucket, object_path)
      values ('${ORG}', 'whatsapp-media', '${NA_FILA}'),
             ('${ORG}', 'whatsapp-media', '${NO_UPDATE}'),
             ('${ORG}', 'whatsapp-media', '${NAO_CITADO}'),
             ('${OUTRA_ORG}', 'whatsapp-media', '${DA_OUTRA_ORG}');
    insert into storage_redaction_queue (organization_id, bucket, object_path, status, attempts, processed_at, error_message)
      values ('${ORG}', 'whatsapp-media', '${FALHOU}', 'failed', 3, now(), 'storage_remove_failed');
    insert into storage_redaction_queue (organization_id, request_id, bucket, object_path)
      values ('${ORG}', '${PEDIDO_LGPD}', 'whatsapp-media', '${DO_PEDIDO_LGPD}');
  `);
});

// A poda conta o banco INTEIRO (`poda-de-midia*.test.ts` congela as contagens):
// nada deste arquivo pode sobrar para a rodada de outro.
afterAll(() => {
  sql(`
    delete from storage_redaction_queue where organization_id in ('${ORG}', '${OUTRA_ORG}');
    delete from storage.objects where name like '${ORG}/%' or name like '${OUTRA_ORG}/%';
    delete from messages where organization_id = '${ORG}';
    delete from lgpd_requests where id = '${PEDIDO_LGPD}';
  `);
});

describe("messages tira da fila a mídia que passa a citar", () => {
  it("o INSERT da mensagem tira o caminho citado; o não citado continua na fila", () => {
    enviar(NA_FILA);

    expect(linha(NA_FILA)).toBe("skipped|citado_por_mensagem|true");
    // Controle positivo: sem ele, um gatilho que esvaziasse a fila passaria.
    expect(linha(NAO_CITADO)).toBe("pending||false");
  });

  it("o UPDATE de media_storage_path tira o caminho (a mídia que chega depois da linha)", () => {
    enviar(null);
    expect(linha(NO_UPDATE)).toBe("pending||false");

    sql(`update messages set media_storage_path = '${NO_UPDATE}' where id = '${MENSAGEM}'`);

    expect(linha(NO_UPDATE)).toBe("skipped|citado_por_mensagem|true");
  });

  it("linha que não está pendente, ou que é de pedido LGPD, não é tocada", () => {
    enviar(FALHOU);
    enviar(DO_PEDIDO_LGPD, "44000000-0000-4000-8000-0000000000a2");

    expect(linha(FALHOU)).toBe("failed|storage_remove_failed|true");
    expect(linha(DO_PEDIDO_LGPD)).toBe("pending||false");
  });

  it("uma mensagem não tira da fila o arquivo de outra organização", () => {
    enviar(DA_OUTRA_ORG);
    expect(linha(DA_OUTRA_ORG)).toBe("pending||false");
  });

  it("o citado não volta à fila; a mensagem que o larga o devolve à poda", () => {
    enviar(NA_FILA);
    rodarPoda();
    expect(linha(NA_FILA)).toBe("skipped|citado_por_mensagem|true");

    sql(`update messages set media_storage_path = null where id = '${MENSAGEM}'`);
    rodarPoda();
    expect(linha(NA_FILA)).toBe("pending||false");
  });

  it("mensagem sem mídia não dispara o gatilho (messages é tabela quente)", () => {
    const def = lastLine(
      sql(`select pg_get_triggerdef(t.oid) from pg_trigger t
            where t.tgrelid = 'public.messages'::regclass and t.tgname = 'trg_messages_midia_citada'`),
    );
    expect(def).toMatch(/AFTER INSERT OR UPDATE OF media_storage_path ON public\.messages/);
    expect(def).toMatch(/WHEN \(\(new\.media_storage_path IS NOT NULL\)\)/);
  });

  it("a função do gatilho não é executável por anon nem authenticated", () => {
    const pode = (papel: string) =>
      lastLine(
        sql(
          `select has_function_privilege('${papel}', 'public.fn_midia_citada_sai_da_fila()', 'EXECUTE')`,
        ),
      );
    expect(pode("anon")).toBe("f");
    expect(pode("authenticated")).toBe("f");
  });
});

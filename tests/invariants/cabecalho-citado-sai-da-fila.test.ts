/**
 * O modelo que passa a citar um cabeçalho enfileirado o tira da fila (issue #30, migration 0543).
 *
 * Desde a 0542 a retenção enfileira o arquivo de `<org>/templates/` com mais de
 * 7 dias que nenhum `meta_templates.header_media` cita. Antes da 0543, nada
 * tirava o caminho da fila quando um modelo passava a citá-lo depois — o
 * operador que deixou o editor aberto mais de 7 dias, ou a retentativa de um
 * envio recusado pela Meta —, e o worker apagava o arquivo que a campanha ia
 * assinar. A Meta aprova (ela guarda a própria amostra); o disparo não tem o que
 * mandar.
 *
 * O gatilho de `meta_templates` marca `skipped` a linha `pending` de cada
 * caminho citado, e o worker só apaga linha que ainda está `pending` (ver
 * `drainStorageRedactionQueue`). O que este arquivo vigia:
 *   - o caminho citado sai da fila, no INSERT e no UPDATE de `header_media`,
 *     no cabeçalho e no card de carrossel;
 *   - o não citado continua na fila (controle positivo);
 *   - linha que não é de retenção ou não está `pending` não é tocada;
 *   - um modelo não tira da fila arquivo de OUTRA organização;
 *   - o laço fecha: citado não volta à fila, e o modelo que larga o caminho o
 *     devolve à poda na rodada seguinte.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

const ORG = "43000000-0000-4000-8000-000000000001";
const OUTRA_ORG = "43000000-0000-4000-8000-000000000002";
const MODELO = "43000000-0000-4000-8000-0000000000a1";
const PEDIDO_LGPD = "43000000-0000-4000-8000-0000000000c1";

const pasta = (org: string, n: number, ext = "png") =>
  `${org}/templates/43000000-0000-4000-8000-${String(n).padStart(12, "0")}.${ext}`;
const NA_FILA = pasta(ORG, 101);
const NO_CARD = pasta(ORG, 102, "jpg");
const NAO_CITADO = pasta(ORG, 103);
const FALHOU = pasta(ORG, 104);
const DO_PEDIDO_LGPD = pasta(ORG, 105);
const DA_OUTRA_ORG = pasta(OUTRA_ORG, 106);

const midia = (path: string) => JSON.stringify({ path, mime_type: "image/png", file_name: "a.png" });

const linha = (p: string) =>
  lastLine(
    sql(
      `select status || '|' || coalesce(error_message, '') || '|' || (processed_at is not null)::text
         from storage_redaction_queue where bucket = 'whatsapp-media' and object_path = '${p}'`,
    ),
  );

const rodarPoda = () => JSON.parse(lastLine(sql(`select public.fn_enfileirar_midia_vencida(500)::text`)));

function citar(headerMedia: string): void {
  sql(`insert into meta_templates (id, organization_id, waba_id, name, language, status, components, contract_hash, header_media)
       values ('${MODELO}', '${ORG}', 'waba-430', 'cabecalho_430', 'pt_BR', 'PENDING', '[]'::jsonb, 'h-430', '${headerMedia}'::jsonb)`);
}

beforeEach(() => {
  sql(`
    insert into storage.buckets (id, name) values ('whatsapp-media', 'whatsapp-media') on conflict (id) do nothing;
    delete from storage_redaction_queue where organization_id in ('${ORG}', '${OUTRA_ORG}');
    delete from storage.objects where name like '${ORG}/%' or name like '${OUTRA_ORG}/%';
    delete from meta_templates where organization_id in ('${ORG}', '${OUTRA_ORG}');
    delete from lgpd_requests where id = '${PEDIDO_LGPD}';
    insert into organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'org-modelo-430', 'Org Modelo LTDA', 'Org Modelo'),
             ('${OUTRA_ORG}', 'org-modelo-430-b', 'Outra Org LTDA', 'Outra Org')
      on conflict (id) do nothing;
    insert into lgpd_requests (id, organization_id, request_type, source, due_at)
      values ('${PEDIDO_LGPD}', '${ORG}', 'redact', 'manual', now() + interval '15 days');
    insert into storage.objects (bucket_id, name, metadata, created_at)
      select 'whatsapp-media', p, '{"size": 1000}'::jsonb, now() - interval '10 days'
        from unnest(array['${NA_FILA}', '${NO_CARD}', '${NAO_CITADO}', '${FALHOU}', '${DO_PEDIDO_LGPD}', '${DA_OUTRA_ORG}']) p;
    -- O que a poda deixou na fila: retenção pendente, uma falha terminal e uma do pedido LGPD.
    insert into storage_redaction_queue (organization_id, bucket, object_path)
      values ('${ORG}', 'whatsapp-media', '${NA_FILA}'),
             ('${ORG}', 'whatsapp-media', '${NO_CARD}'),
             ('${ORG}', 'whatsapp-media', '${NAO_CITADO}'),
             ('${OUTRA_ORG}', 'whatsapp-media', '${DA_OUTRA_ORG}');
    insert into storage_redaction_queue (organization_id, bucket, object_path, status, attempts, processed_at, error_message)
      values ('${ORG}', 'whatsapp-media', '${FALHOU}', 'failed', 3, now(), 'storage_remove_failed');
    insert into storage_redaction_queue (organization_id, request_id, bucket, object_path)
      values ('${ORG}', '${PEDIDO_LGPD}', 'whatsapp-media', '${DO_PEDIDO_LGPD}');
  `);
});

describe("meta_templates tira da fila o cabeçalho que passa a citar", () => {
  it("o INSERT do modelo tira o caminho citado; o não citado continua na fila", () => {
    citar(`{"header:1": ${midia(NA_FILA)}}`);

    expect(linha(NA_FILA)).toBe("skipped|citado_por_modelo|true");
    // Controle positivo: sem ele, um gatilho que esvaziasse a fila passaria.
    expect(linha(NAO_CITADO)).toBe("pending||false");
  });

  it("o UPDATE de header_media tira o caminho do card de carrossel", () => {
    citar(`{}`);
    expect(linha(NO_CARD)).toBe("pending||false");

    sql(`update meta_templates set header_media = '{"card0:header:1": ${midia(NO_CARD)}, "card1:header:1": ${midia(NA_FILA)}}'::jsonb
          where id = '${MODELO}'`);

    expect(linha(NO_CARD)).toBe("skipped|citado_por_modelo|true");
    expect(linha(NA_FILA)).toBe("skipped|citado_por_modelo|true");
  });

  it("linha que não está pendente, ou que é de pedido LGPD, não é tocada", () => {
    citar(`{"header:1": ${midia(FALHOU)}, "header:2": ${midia(DO_PEDIDO_LGPD)}}`);

    expect(linha(FALHOU)).toBe("failed|storage_remove_failed|true");
    expect(linha(DO_PEDIDO_LGPD)).toBe("pending||false");
  });

  it("um modelo não tira da fila o arquivo de outra organização", () => {
    citar(`{"header:1": ${midia(DA_OUTRA_ORG)}}`);
    expect(linha(DA_OUTRA_ORG)).toBe("pending||false");
  });

  it("valor malformado em header_media não derruba a gravação do modelo", () => {
    citar(`{"header:1": "nao-e-objeto", "header:2": 42, "card0:header:1": {"path": null}}`);
    expect(lastLine(sql(`select count(*) from meta_templates where id = '${MODELO}'`))).toBe("1");
    expect(linha(NA_FILA)).toBe("pending||false");
  });

  it("o citado não volta à fila; o modelo que o larga o devolve à poda", () => {
    citar(`{"header:1": ${midia(NA_FILA)}}`);
    rodarPoda();
    expect(linha(NA_FILA)).toBe("skipped|citado_por_modelo|true");

    sql(`update meta_templates set header_media = '{}'::jsonb where id = '${MODELO}'`);
    rodarPoda();
    expect(linha(NA_FILA)).toBe("pending||false");
  });

  it("a função do gatilho não é executável por anon nem authenticated", () => {
    const pode = (papel: string) =>
      lastLine(
        sql(
          `select has_function_privilege('${papel}', 'public.fn_cabecalho_citado_sai_da_fila()', 'EXECUTE')`,
        ),
      );
    expect(pode("anon")).toBe("f");
    expect(pode("authenticated")).toBe("f");
  });
});

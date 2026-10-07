/**
 * A pasta de cabeçalho de modelo entra na poda de órfãos (issue #21, migration 0542).
 *
 * A cópia da mídia do cabeçalho (`<org>/templates/<uuid>.<ext>`, issue #7) é
 * referenciada por CAMINHO em `meta_templates.header_media`, por slot do envio
 * (`header:1`, `card0:header:1`). Até a 0542 a função nunca olhava a pasta, e
 * três caminhos deixavam arquivo sem dono para sempre na cota do bucket: o
 * operador troca o arquivo no editor, abandona o editor depois do upload, ou
 * recria um modelo desativado (o envio troca `header_media` inteiro).
 *
 * O que este arquivo vigia, cada um por um modo de falha concreto:
 *   - arquivo citado por QUALQUER slot de QUALQUER modelo não sai — é o
 *     cabeçalho que o próximo disparo assina, e apagá-lo quebra a campanha;
 *   - o não citado e mais velho que a carência de 7 dias sai, e conta em `orfas`;
 *   - o não citado e recente espera — é o upload do editor ainda aberto;
 *   - trocar o cabeçalho libera o anterior (o caminho 3 da issue);
 *   - um valor malformado em `header_media` não derruba a rodada.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

const ORG = "42100000-0000-4000-8000-000000000001";
const OUTRA_ORG = "42100000-0000-4000-8000-000000000002";
const MODELO_A = "42100000-0000-4000-8000-0000000000a1";
const MODELO_CARROSSEL = "42100000-0000-4000-8000-0000000000a2";
const MODELO_MALFORMADO = "42100000-0000-4000-8000-0000000000a3";

const pasta = (org: string, id: string, ext: string) => `${org}/templates/${id}.${ext}`;
const EM_USO = pasta(ORG, "42100000-0000-4000-8000-000000000101", "png");
const EM_USO_NO_CARD = pasta(ORG, "42100000-0000-4000-8000-000000000102", "jpg");
const TROCADO = pasta(ORG, "42100000-0000-4000-8000-000000000103", "mp4");
const ABANDONADO = pasta(ORG, "42100000-0000-4000-8000-000000000104", "pdf");
const RECENTE = pasta(ORG, "42100000-0000-4000-8000-000000000105", "png");
const NA_BEIRA = pasta(ORG, "42100000-0000-4000-8000-000000000106", "png");
const DA_OUTRA_ORG = pasta(OUTRA_ORG, "42100000-0000-4000-8000-000000000107", "png");

const conta = (q: string) => Number(lastLine(sql(q)));
const naFila = (p: string) =>
  conta(
    `select count(*) from storage_redaction_queue where bucket = 'whatsapp-media' and object_path = '${p}' and status = 'pending'`,
  );
const rodar = () => JSON.parse(lastLine(sql(`select public.fn_enfileirar_midia_vencida(500)::text`)));

function objeto(nome: string, idade: string): string {
  return `insert into storage.objects (bucket_id, name, metadata, created_at)
          values ('whatsapp-media', '${nome}', '{"size": 1000}'::jsonb, now() - interval '${idade}');`;
}

function modelo(id: string, org: string, nome: string, headerMedia: string): string {
  return `insert into meta_templates (id, organization_id, waba_id, name, language, status, components, contract_hash, header_media)
          values ('${id}', '${org}', 'waba-421', '${nome}', 'pt_BR', 'APPROVED', '[]'::jsonb, 'h-${nome}', '${headerMedia}'::jsonb);`;
}

const midia = (path: string, mime: string) =>
  JSON.stringify({ path, mime_type: mime, file_name: "arquivo" });

beforeEach(() => {
  sql(`
    insert into storage.buckets (id, name) values ('whatsapp-media', 'whatsapp-media') on conflict (id) do nothing;
    delete from storage_redaction_queue where organization_id in ('${ORG}', '${OUTRA_ORG}');
    delete from storage.objects where name like '${ORG}/%' or name like '${OUTRA_ORG}/%';
    delete from meta_templates where organization_id in ('${ORG}', '${OUTRA_ORG}');
    insert into organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'org-modelo-421', 'Org Modelo LTDA', 'Org Modelo'),
             ('${OUTRA_ORG}', 'org-modelo-421-b', 'Outra Org LTDA', 'Outra Org')
      on conflict (id) do nothing;
    ${modelo(MODELO_A, ORG, "boas_vindas", `{"header:1": ${midia(EM_USO, "image/png")}}`)}
    ${modelo(
      MODELO_CARROSSEL,
      ORG,
      "carrossel",
      `{"card0:header:1": ${midia(EM_USO_NO_CARD, "image/jpeg")}, "card1:header:1": {"path": null}}`,
    )}
    ${modelo(MODELO_MALFORMADO, OUTRA_ORG, "malformado", `{"header:1": "nao-e-objeto", "header:2": 42}`)}
    ${objeto(EM_USO, "200 days")}
    ${objeto(EM_USO_NO_CARD, "200 days")}
    ${objeto(TROCADO, "30 days")}
    ${objeto(ABANDONADO, "8 days")}
    ${objeto(RECENTE, "3 days")}
    ${objeto(NA_BEIRA, "6 days 23 hours")}
    ${objeto(DA_OUTRA_ORG, "60 days")}
  `);
});

describe("fn_enfileirar_midia_vencida — pasta de cabeçalho de modelo", () => {
  it("cabeçalho citado por qualquer modelo fica; o não citado e vencido sai", () => {
    const r = rodar();

    // Controle positivo: sem ele, uma função que ignora a pasta passaria nos "fica".
    expect(naFila(TROCADO)).toBe(1);
    expect(naFila(ABANDONADO)).toBe(1);
    expect(naFila(DA_OUTRA_ORG)).toBe(1);

    expect(naFila(EM_USO)).toBe(0);
    expect(naFila(EM_USO_NO_CARD)).toBe(0);

    // `orfas` conta exatamente os três — nada de mensagem, avatar ou nota neste fixture.
    expect(r).toEqual({ vencidas: 0, orfas: 3, expurgadas: 0 });
  });

  it("o upload recente espera a carência de 7 dias", () => {
    rodar();
    expect(naFila(RECENTE)).toBe(0);
    expect(naFila(NA_BEIRA)).toBe(0);
  });

  it("a linha da fila leva a organização dona do caminho", () => {
    rodar();
    expect(
      lastLine(sql(`select organization_id from storage_redaction_queue where object_path = '${DA_OUTRA_ORG}'`)),
    ).toBe(OUTRA_ORG);
  });

  it("trocar o cabeçalho do modelo libera o anterior na rodada seguinte", () => {
    rodar();
    expect(naFila(EM_USO)).toBe(0);

    // O caminho 3 da issue: o modelo recriado grava `header_media` inteiro de novo.
    sql(`update meta_templates set header_media = '{"header:1": ${midia(RECENTE, "image/png")}}'::jsonb
          where id = '${MODELO_A}';`);
    const r = rodar();

    expect(naFila(EM_USO)).toBe(1);
    expect(naFila(RECENTE)).toBe(0);
    expect(r.orfas).toBe(1);
  });

  it("modelo apagado libera o cabeçalho dele", () => {
    rodar();
    sql(`delete from meta_templates where id = '${MODELO_CARROSSEL}';`);
    rodar();
    expect(naFila(EM_USO_NO_CARD)).toBe(1);
  });

  it("a segunda rodada não enfileira de novo", () => {
    rodar();
    expect(rodar()).toEqual({ vencidas: 0, orfas: 0, expurgadas: 0 });
  });
});

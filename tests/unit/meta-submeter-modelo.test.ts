/**
 * O MODELO CRIADO NO EDITOR CHEGA AO FALSO GRAPH NO FORMATO DA META (issue #6).
 *
 * `submeterModelo` fala com um servidor HTTP de verdade (o falso Graph,
 * `tests/support/falso-graph.ts`, pelo knob `META_GRAPH_BASE_URL`) e grava no
 * espelho local. O que se mede pelo fio:
 *
 *  - o corpo de `POST /{waba}/message_templates` traz nome, idioma, categoria,
 *    formato e os componentes com os exemplos das variáveis;
 *  - o token vai no cabeçalho, nunca na URL;
 *  - o espelho ganha a linha com o status e a categoria QUE A META devolveu;
 *  - modelo que já existe no espelho não vai à Meta de novo;
 *  - a recusa da Meta volta com a frase dela, e o espelho não ganha linha.
 *
 * Medir: `pnpm vitest run tests/unit/meta-submeter-modelo.test.ts`
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { submeterModelo } from "@/lib/channels/meta/submeter-modelo";
import type { NovoModelo } from "@/lib/channels/meta/novo-modelo";

import { bancoEmMemoria } from "../support/banco-em-memoria";
import { erroDaGraph, subirFalsoGraph, type FalsoGraph } from "../support/falso-graph";

const ORG = "00000000-0000-4000-8000-0000000006a1";
const WABA = "2434045433735175";
const TOKEN = "EAAG-token-de-teste-com-tamanho-suficiente";

let falso: FalsoGraph;
let tabelas: Record<string, Array<Record<string, unknown>>>;

const MODELO: NovoModelo = {
  name: "oferta_de_outubro",
  language: "pt_BR",
  category: "MARKETING",
  parameter_format: "NAMED",
  body: "Olá {{nome}}, seu cupom de {{mes}} chegou.",
  examples: { nome: "Ana", mes: "outubro" },
  footer: "Loja de Teste",
  buttons: [
    { type: "QUICK_REPLY", text: "Quero" },
    { type: "COPY_CODE", example: "OUTUBRO10" },
  ],
};

function submeter(modelo: NovoModelo = MODELO) {
  return submeterModelo(bancoEmMemoria(tabelas), {
    organizationId: ORG,
    wabaId: WABA,
    token: TOKEN,
    graphVersion: "v26.0",
    modelo,
  });
}

beforeAll(async () => {
  falso = await subirFalsoGraph({ phoneNumberId: "1103328999528818", wabaId: WABA });
  vi.stubEnv("META_GRAPH_BASE_URL", falso.base);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await falso.fechar();
});

beforeEach(() => {
  falso.limpar();
  tabelas = { meta_templates: [] };
});

describe("submeterModelo", () => {
  it("chega ao falso Graph no formato da Meta, com os exemplos das variáveis", async () => {
    const r = await submeter();
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const [chamada] = falso.modelosCriados();
    expect(chamada).toBeDefined();
    expect(chamada!.versao).toBe("v26.0");
    expect(chamada!.authorization).toBe(`Bearer ${TOKEN}`);
    expect(chamada!.busca).not.toContain(TOKEN);
    expect(chamada!.corpo).toEqual({
      name: "oferta_de_outubro",
      language: "pt_BR",
      category: "MARKETING",
      parameter_format: "NAMED",
      components: [
        {
          type: "BODY",
          text: "Olá {{nome}}, seu cupom de {{mes}} chegou.",
          example: {
            body_text_named_params: [
              { param_name: "nome", example: "Ana" },
              { param_name: "mes", example: "outubro" },
            ],
          },
        },
        { type: "FOOTER", text: "Loja de Teste" },
        {
          type: "BUTTONS",
          buttons: [
            { type: "QUICK_REPLY", text: "Quero" },
            { type: "COPY_CODE", example: "OUTUBRO10" },
          ],
        },
      ],
    });
  });

  it("o espelho ganha a linha com o status e a categoria que a Meta devolveu", async () => {
    // A Meta pode recategorizar já na criação: pediu-se UTILITY, ela devolve MARKETING.
    falso.programar(
      { metodo: "POST", terminaCom: "/message_templates" },
      { status: 200, corpo: { id: "META_1", status: "PENDING", category: "MARKETING" } },
    );
    const r = await submeter({ ...MODELO, category: "UTILITY" });
    expect(r).toMatchObject({ ok: true, modelo: { status: "PENDING", category: "MARKETING" } });

    expect(tabelas.meta_templates).toHaveLength(1);
    const linha = tabelas.meta_templates![0]!;
    expect(linha).toMatchObject({
      organization_id: ORG,
      waba_id: WABA,
      name: "oferta_de_outubro",
      language: "pt_BR",
      status: "PENDING",
      category: "MARKETING",
      parameter_format: "NAMED",
      rejected_reason: null,
    });
    expect(linha.components).toEqual(
      (falso.chamadas[0]!.corpo as { components: unknown }).components,
    );
    expect(String(linha.contract_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(String(linha.id)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("modelo que já está no espelho não vai à Meta de novo", async () => {
    tabelas.meta_templates!.push({
      id: "x",
      organization_id: ORG,
      waba_id: WABA,
      name: "oferta_de_outubro",
      language: "pt_BR",
      status: "APPROVED",
    });
    expect(await submeter()).toEqual({ ok: false, motivo: "modelo_ja_existe" });
    expect(falso.modelosCriados()).toEqual([]);
  });

  it("modelo DESATIVADO no espelho (sumiu da Meta) pode ser criado de novo, e a linha é reaproveitada", async () => {
    tabelas.meta_templates!.push({
      id: "linha-antiga",
      organization_id: ORG,
      waba_id: WABA,
      name: "oferta_de_outubro",
      language: "pt_BR",
      status: "DISABLED",
      rejected_reason: "INVALID_FORMAT",
    });
    const r = await submeter();
    expect(r).toMatchObject({ ok: true, modelo: { id: "linha-antiga", status: "PENDING" } });
    expect(tabelas.meta_templates).toHaveLength(1);
    expect(tabelas.meta_templates![0]).toMatchObject({ status: "PENDING", rejected_reason: null });
  });

  it("a recusa da Meta volta com a frase dela, e o espelho não ganha linha", async () => {
    falso.programar(
      { metodo: "POST", terminaCom: "/message_templates" },
      erroDaGraph(100, {
        subcode: 2388299,
        userTitle: "Variáveis no começo ou no fim",
        userMsg: "As variáveis não podem ficar no começo ou no fim do modelo.",
      }),
    );
    const r = await submeter();
    expect(r).toMatchObject({
      ok: false,
      motivo: "meta_recusou",
      mensagem: "As variáveis não podem ficar no começo ou no fim do modelo.",
      codigo: 100,
      subcodigo: 2388299,
    });
    expect(tabelas.meta_templates).toEqual([]);
  });

  it("recusa sem frase da Meta cai no motivo legível do mapa de erros, nunca no texto cru", async () => {
    falso.programar(
      { metodo: "POST", terminaCom: "/message_templates" },
      erroDaGraph(190, { status: 401 }),
    );
    const r = await submeter();
    expect(r.ok).toBe(false);
    if (!r.ok && r.motivo === "meta_recusou") {
      expect(r.mensagem).not.toContain("erro programado pelo teste");
      expect(r.mensagem.length).toBeGreaterThan(0);
    }
  });
});

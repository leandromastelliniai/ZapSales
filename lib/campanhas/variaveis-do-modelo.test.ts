import { describe, expect, it } from "vitest";

import { deriveTemplateContract } from "@/lib/channels/meta/template-contract";

import { mapaDeVariaveisSchema, problemasDoMapa, valoresDoDestinatario } from "./variaveis-do-modelo";

/** Um modelo aprovado de texto com duas variáveis posicionais no corpo. */
const POSICIONAL = deriveTemplateContract({
  name: "oferta_de_outubro",
  language: "pt_BR",
  components: [
    { type: "BODY", text: "Oi {{1}}, sua oferta de {{2}} chegou. Responda para garantir." },
  ],
});

/** Variáveis nomeadas e um botão de URL com sufixo. */
const NOMEADO = deriveTemplateContract({
  name: "lembrete",
  language: "pt_BR",
  parameter_format: "NAMED",
  components: [
    { type: "BODY", text: "Olá {{primeiro_nome}}, seu plano {{plano}} vence amanhã." },
    { type: "BUTTONS", buttons: [{ type: "URL", text: "Pagar", url: "https://loja.exemplo/pagar/{{1}}" }] },
  ],
});

const ANA = {
  name: "Ana Paula Souza",
  display_name: null,
  phone_number: "+5531988887777",
  email: "ana@exemplo.com",
  custom_fields: { plano: "Ouro", codigo_cliente: 4471 },
};

describe("valoresDoDestinatario — cada variável do modelo preenchida a partir do contato", () => {
  it("preenche variáveis posicionais com campo do contato e texto fixo", () => {
    const r = valoresDoDestinatario(
      POSICIONAL,
      { "1": { tipo: "contato", campo: "primeiro_nome" }, "2": { tipo: "fixo", valor: "outubro" } },
      ANA,
    );
    expect(r).toEqual({ valores: { "1": "Ana", "2": "outubro" }, faltando: [] });
  });

  it("lê nome completo, telefone, e-mail e campo personalizado (número vira texto)", () => {
    const contrato = deriveTemplateContract({
      name: "ficha",
      language: "pt_BR",
      components: [{ type: "BODY", text: "{{1}} | {{2}} | {{3}} | {{4}}" }],
    });
    const r = valoresDoDestinatario(
      contrato,
      {
        "1": { tipo: "contato", campo: "nome" },
        "2": { tipo: "contato", campo: "telefone" },
        "3": { tipo: "contato", campo: "email" },
        "4": { tipo: "campo_personalizado", chave: "codigo_cliente" },
      },
      ANA,
    );
    expect(r.valores).toEqual({
      "1": "Ana Paula Souza",
      "2": "+5531988887777",
      "3": "ana@exemplo.com",
      "4": "4471",
    });
  });

  it("chaveia por slotKey: variável nomeada no corpo e sufixo do botão de URL", () => {
    const r = valoresDoDestinatario(
      NOMEADO,
      {
        primeiro_nome: { tipo: "contato", campo: "primeiro_nome" },
        plano: { tipo: "campo_personalizado", chave: "plano" },
        "button0:1": { tipo: "campo_personalizado", chave: "codigo_cliente" },
      },
      ANA,
    );
    expect(r).toEqual({
      valores: { primeiro_nome: "Ana", plano: "Ouro", "button0:1": "4471" },
      faltando: [],
    });
  });

  it("contato sem o dado que o mapa pede aparece como faltando, com o slot", () => {
    const r = valoresDoDestinatario(
      POSICIONAL,
      { "1": { tipo: "contato", campo: "primeiro_nome" }, "2": { tipo: "contato", campo: "email" } },
      { ...ANA, name: "  ", display_name: null, email: null },
    );
    expect(r.faltando).toEqual(["1", "2"]);
  });

  it("nome que é identificador técnico não conta como nome", () => {
    const r = valoresDoDestinatario(
      POSICIONAL,
      { "1": { tipo: "contato", campo: "nome" }, "2": { tipo: "fixo", valor: "x" } },
      { ...ANA, name: "543134@lid" },
    );
    expect(r.faltando).toEqual(["1"]);
  });
});

describe("problemasDoMapa — o que impede a campanha de sair", () => {
  it("aponta variável do modelo sem fonte", () => {
    expect(problemasDoMapa(POSICIONAL, { "1": { tipo: "contato", campo: "nome" } })).toEqual({
      semFonte: ["2"],
      desconhecidas: [],
    });
  });

  it("aponta chave do mapa que o modelo não tem", () => {
    expect(
      problemasDoMapa(POSICIONAL, {
        "1": { tipo: "contato", campo: "nome" },
        "2": { tipo: "fixo", valor: "a" },
        "9": { tipo: "fixo", valor: "b" },
      }),
    ).toEqual({ semFonte: [], desconhecidas: ["9"] });
  });

  it("texto fixo vazio não é fonte", () => {
    expect(
      problemasDoMapa(POSICIONAL, { "1": { tipo: "contato", campo: "nome" }, "2": { tipo: "fixo", valor: "  " } })
        .semFonte,
    ).toEqual(["2"]);
  });
});

describe("mapaDeVariaveisSchema — a entrada da API", () => {
  it("aceita as três fontes", () => {
    expect(
      mapaDeVariaveisSchema.safeParse({
        "1": { tipo: "contato", campo: "primeiro_nome" },
        "2": { tipo: "fixo", valor: "outubro" },
        "3": { tipo: "campo_personalizado", chave: "plano" },
      }).success,
    ).toBe(true);
  });

  it("recusa campo do contato que não existe", () => {
    expect(mapaDeVariaveisSchema.safeParse({ "1": { tipo: "contato", campo: "cpf" } }).success).toBe(false);
  });
});

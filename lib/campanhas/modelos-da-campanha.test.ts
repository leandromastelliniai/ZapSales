import { describe, expect, it } from "vitest";

import { modelosParaCampanha } from "./modelos-da-campanha";

const APROVADO = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "oferta_de_outubro",
  language: "pt_BR",
  status: "APPROVED",
  category: "MARKETING",
  parameter_format: null,
  components: [
    { type: "BODY", text: "Oi {{1}}, sua oferta de {{2}} chegou." },
    { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver", url: "https://loja.exemplo/o/{{1}}" }] },
  ],
};

describe("modelosParaCampanha — o que a tela de campanha oferece", () => {
  it("devolve o texto e cada variável com a chave do envio e onde ela aparece", () => {
    const [m] = modelosParaCampanha([APROVADO]);
    expect(m).toMatchObject({
      id: APROVADO.id,
      name: "oferta_de_outubro",
      language: "pt_BR",
      category: "MARKETING",
      texto: "Oi {{1}}, sua oferta de {{2}} chegou.",
    });
    expect(m!.variaveis.map((v) => v.chave)).toEqual(["1", "2", "button0:1"]);
    expect(m!.variaveis[0]).toMatchObject({ onde: "corpo", antes: "Oi", depois: ", sua oferta de {{2}} chegou.", tipo: "text" });
    expect(m!.variaveis[2]).toMatchObject({ onde: "botão 1 (url)", tipo: "url_suffix" });
  });

  it("só oferece modelo aprovado — pendente, rejeitado e pausado a Meta recusaria", () => {
    const linhas = ["PENDING", "REJECTED", "PAUSED", "DISABLED"].map((status, i) => ({
      ...APROVADO,
      id: `2222222${i}-2222-4222-8222-222222222222`,
      status,
    }));
    expect(modelosParaCampanha(linhas)).toEqual([]);
  });

  it("variável repetida no corpo aparece uma vez — é um valor só no envio", () => {
    const [m] = modelosParaCampanha([
      { ...APROVADO, components: [{ type: "BODY", text: "{{1}}, sim, {{1}}!" }] },
    ]);
    expect(m!.variaveis.map((v) => v.chave)).toEqual(["1"]);
  });

  it("lista os rótulos dos botões de RESPOSTA RÁPIDA — os que a campanha pode mapear (issue #11)", () => {
    const [m] = modelosParaCampanha([
      {
        ...APROVADO,
        components: [
          { type: "BODY", text: "Quer saber mais?" },
          {
            type: "BUTTONS",
            buttons: [
              { type: "QUICK_REPLY", text: "Quero" },
              { type: "QUICK_REPLY", text: "Parar" },
              { type: "URL", text: "Ver", url: "https://loja.exemplo" },
            ],
          },
        ],
      },
    ]);
    expect(m!.botoesDeResposta).toEqual(["Quero", "Parar"]);
  });

  it("modelo sem botão de resposta rápida não tem o que mapear", () => {
    expect(modelosParaCampanha([APROVADO])[0]!.botoesDeResposta).toEqual([]);
  });
});

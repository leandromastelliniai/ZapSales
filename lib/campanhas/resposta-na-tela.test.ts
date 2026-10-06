import { describe, expect, it } from "vitest";

import { botoesDoModeloEscolhido, precisaDeAgente } from "./resposta-na-tela";

describe("precisaDeAgente — a mesma regra que a API cobra", () => {
  it("'IA e depois humano' precisa", () => {
    expect(precisaDeAgente("ia_e_humano", [])).toBe(true);
  });
  it("um botão 'atribuir à IA' precisa", () => {
    expect(precisaDeAgente("humano", [{ botao: "Sim", acao: "atribuir_ia" }])).toBe(true);
  });
  it("'IA' sem botão de IA não precisa — vale o agente do número", () => {
    expect(precisaDeAgente("ia", [{ botao: "Parar", acao: "opt_out" }])).toBe(false);
  });
});

describe("botoesDoModeloEscolhido — trocar de modelo não leva o mapa do anterior", () => {
  it("só ficam os rótulos do modelo escolhido, sem ligar para caixa e espaço", () => {
    expect(
      botoesDoModeloEscolhido(
        [
          { botao: "Quero", acao: "atribuir_ia" },
          { botao: "Parar", acao: "opt_out" },
        ],
        [" quero", "Talvez"],
      ),
    ).toEqual([{ botao: "Quero", acao: "atribuir_ia" }]);
  });
});

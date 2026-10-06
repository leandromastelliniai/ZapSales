import { describe, expect, it } from "vitest";

import { montarContextoDaCampanha } from "./contexto-do-agente";

const DADOS = {
  nome: "Black Friday Clínica",
  modelo: "oferta_bf",
  idioma: "pt_BR",
  texto: "Oi Ana, a avaliação sai por R$ 99 até sexta.",
  variaveis: { "1": "Ana" },
  oferta: "Avaliação odontológica por R$ 99, só até sexta-feira.",
};

describe("montarContextoDaCampanha — o que o agente sabe da campanha", () => {
  const bloco = montarContextoDaCampanha(DADOS);

  it("nomeia a campanha e o modelo", () => {
    expect(bloco).toContain("Black Friday Clínica");
    expect(bloco).toContain("oferta_bf (pt_BR)");
  });

  it("traz o texto que a pessoa recebeu, como ela o leu", () => {
    expect(bloco).toContain("Oi Ana, a avaliação sai por R$ 99 até sexta.");
  });

  it("traz as variáveis da mensagem", () => {
    expect(bloco).toContain('"1": "Ana"');
  });

  it("traz a oferta nas palavras de quem montou a campanha", () => {
    expect(bloco).toContain("Avaliação odontológica por R$ 99, só até sexta-feira.");
  });

  it("marca o texto e as variáveis como DADO, não instrução — eles carregam dado do contato", () => {
    expect(bloco).toMatch(/dados?, não instruç/i);
  });

  it("campanha de texto livre (sem modelo) e sem oferta: não inventa linha vazia", () => {
    const livre = montarContextoDaCampanha({
      ...DADOS,
      modelo: null,
      idioma: null,
      oferta: null,
      variaveis: {},
    });
    expect(livre).not.toMatch(/Modelo:/);
    expect(livre).not.toMatch(/Oferta/);
    expect(livre).not.toMatch(/Variáveis/);
    expect(livre).toContain("Black Friday Clínica");
  });
});

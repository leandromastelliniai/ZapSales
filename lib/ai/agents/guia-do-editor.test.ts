import { describe, expect, it } from "vitest";

import {
  IDS_DE_PASSO,
  IDS_DE_SECAO_DO_GUIA,
  estadoDasSecoes,
  faixaDaForca,
  forcaDoAgente,
  type FatosDoAgente,
} from "./guia-do-editor";

const VAZIO: FatosDoAgente = {
  nome: "",
  temPerfil: false,
  temInstrucoes: false,
  temBoasVindas: false,
  materiais: 0,
  acoes: 0,
  numeroEscolhido: false,
  chamaPessoa: false,
  followupLigado: false,
  modeloEscolhido: false,
};

const COMPLETO: FatosDoAgente = {
  nome: "Sofia",
  temPerfil: true,
  temInstrucoes: true,
  temBoasVindas: true,
  materiais: 2,
  acoes: 22,
  numeroEscolhido: true,
  chamaPessoa: true,
  followupLigado: true,
  modeloEscolhido: true,
};

describe("forcaDoAgente", () => {
  it("os pesos somam 100: agente completo = 100, vazio = 0", () => {
    expect(forcaDoAgente(COMPLETO).percentual).toBe(100);
    expect(forcaDoAgente(VAZIO).percentual).toBe(0);
  });

  it("cobre todos os passos, cada um uma vez", () => {
    const ids = forcaDoAgente(VAZIO).passos.map((p) => p.id);
    expect([...ids].sort()).toEqual([...IDS_DE_PASSO].sort());
  });

  it("o próximo passo é o pendente de maior peso: sem material, material primeiro", () => {
    const f = forcaDoAgente({ ...COMPLETO, materiais: 0 });
    expect(f.percentual).toBe(80);
    expect(f.proximo?.id).toBe("materiais");
    expect(f.proximo?.secao).toBe("conhecimento");
  });

  it("empate de peso resolve pela ordem declarada (material antes de personalidade)", () => {
    expect(forcaDoAgente({ ...COMPLETO, materiais: 0, temPerfil: false, temInstrucoes: false }).proximo?.id).toBe(
      "materiais",
    );
  });

  it("quem vive só nas instruções livres tem a personalidade pronta", () => {
    const f = forcaDoAgente({ ...COMPLETO, temPerfil: false, temInstrucoes: true });
    expect(f.passos.find((p) => p.id === "personalidade")?.feito).toBe(true);
  });

  it("nome só com espaços não conta", () => {
    expect(forcaDoAgente({ ...COMPLETO, nome: "   " }).percentual).toBe(90);
  });

  it("sem pendência, o próximo é nulo", () => {
    expect(forcaDoAgente(COMPLETO).proximo).toBeNull();
  });
});

describe("faixaDaForca", () => {
  it("separa começando, boa e completa", () => {
    expect(faixaDaForca(0)).toBe("comecando");
    expect(faixaDaForca(59)).toBe("comecando");
    expect(faixaDaForca(60)).toBe("boa");
    expect(faixaDaForca(99)).toBe("boa");
    expect(faixaDaForca(100)).toBe("completa");
  });
});

describe("estadoDasSecoes", () => {
  it("devolve as nove partes do editor", () => {
    expect(Object.keys(estadoDasSecoes(VAZIO)).sort()).toEqual([...IDS_DE_SECAO_DO_GUIA].sort());
  });

  it("agente completo: tudo pronto", () => {
    expect(Object.values(estadoDasSecoes(COMPLETO)).every((e) => e === "pronto")).toBe(true);
  });

  it("agente vazio: pede revisão no que falta, 'Jeito de responder' sempre pronto e retornos opcionais", () => {
    const e = estadoDasSecoes(VAZIO);
    expect(e.quem).toBe("revisar");
    expect(e.conhecimento).toBe("revisar");
    expect(e.capacidades).toBe("revisar");
    expect(e.onde).toBe("revisar");
    expect(e.pessoas).toBe("revisar");
    expect(e.respostas).toBe("pronto");
    expect(e.vendas).toBe("opcional");
  });

  it("retornos ligados contam como pronto", () => {
    expect(estadoDasSecoes({ ...VAZIO, followupLigado: true }).vendas).toBe("pronto");
  });
});

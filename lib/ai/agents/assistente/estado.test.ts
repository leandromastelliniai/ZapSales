import { describe, expect, it } from "vitest";

import { aplicarModelo } from "../modelos";
import {
  CHAVE_DO_ASSISTENTE,
  estadoInicial,
  escolherModelo,
  escolherRamo,
  gravarEstado,
  idiomaDoAgenteDaTela,
  lerEstado,
  limparEstado,
  temAlgoRespondido,
} from "./estado";

function armazenamentoFalso(inicial: Record<string, string> = {}) {
  const dados = { ...inicial };
  return {
    dados,
    getItem: (k: string) => dados[k] ?? null,
    setItem: (k: string, v: string) => {
      dados[k] = v;
    },
    removeItem: (k: string) => {
      delete dados[k];
    },
  };
}

describe("estado do assistente", () => {
  it("começa na estação 1, sem ramo, no Atendimento", () => {
    const e = estadoInicial("pt-BR");
    expect(e.estacao).toBe(1);
    expect(e.respostas.ramoId).toBeNull();
    expect(e.respostas.modeloId).toBe("atendimento");
    expect(e.nome).toBe("");
  });

  it("escolher um ramo recomenda o modelo e o tom do ramo e zera o que a pessoa tinha editado", () => {
    const e = {
      ...estadoInicial("pt-BR"),
      respostas: { ...estadoInicial("pt-BR").respostas, abertura: "editada" },
    };
    const novo = escolherRamo(e, "clinica-odontologica");
    expect(novo.respostas.ramoId).toBe("clinica-odontologica");
    expect(novo.respostas.modeloId).toBe("agendamento");
    expect(novo.respostas.tom).toBe("formal");
    expect(novo.respostas.abertura).toBeNull();
    expect(novo.respostas.chamarPessoaQuando).toBeNull();
  });

  it("'Outro' (ramo nulo) volta ao Atendimento neutro", () => {
    const novo = escolherRamo(escolherRamo(estadoInicial("pt-BR"), "salao"), null);
    expect(novo.respostas.ramoId).toBeNull();
    expect(novo.respostas.modeloId).toBe("atendimento");
  });

  it("escolher outro modelo troca o tom para o sugerido e limpa a abertura editada", () => {
    const base = escolherRamo(estadoInicial("pt-BR"), "fisioterapia");
    const e = { ...base, respostas: { ...base.respostas, abertura: "minha" } };
    const novo = escolherModelo(e, "vendas");
    expect(novo.respostas.modeloId).toBe("vendas");
    expect(novo.respostas.tom).toBe(aplicarModelo("vendas", "pt-BR").profile_tone);
    expect(novo.respostas.abertura).toBeNull();
  });

  it("grava e lê de volta, na mesma estação e com as mesmas respostas", () => {
    const st = armazenamentoFalso();
    const e = {
      ...escolherRamo(estadoInicial("pt-BR"), "advocacia"),
      estacao: 3 as const,
      nome: "Marina",
    };
    gravarEstado(st, e);
    expect(lerEstado(st, "pt-BR")).toEqual(e);
  });

  it("conteúdo estragado, de outra versão ou sem armazenamento volta ao começo", () => {
    expect(lerEstado(null, "pt-BR")).toEqual(estadoInicial("pt-BR"));
    expect(
      lerEstado(armazenamentoFalso({ [CHAVE_DO_ASSISTENTE]: "{não é json" }), "pt-BR"),
    ).toEqual(estadoInicial("pt-BR"));
    expect(
      lerEstado(
        armazenamentoFalso({
          [CHAVE_DO_ASSISTENTE]: JSON.stringify({ estacao: 9, respostas: {} }),
        }),
        "pt-BR",
      ),
    ).toEqual(estadoInicial("pt-BR"));
    expect(
      lerEstado(
        armazenamentoFalso({
          [CHAVE_DO_ASSISTENTE]: JSON.stringify({
            ...estadoInicial("pt-BR"),
            respostas: { ...estadoInicial("pt-BR").respostas, modeloId: "inventado" },
          }),
        }),
        "pt-BR",
      ),
    ).toEqual(estadoInicial("pt-BR"));
  });

  it("se a pessoa trocou o idioma da tela no meio, o texto editado nos outros idiomas é descartado", () => {
    const st = armazenamentoFalso();
    const e = escolherRamo(estadoInicial("pt-BR"), "advocacia");
    gravarEstado(st, {
      ...e,
      estacao: 3,
      respostas: { ...e.respostas, abertura: "texto em português" },
    });
    const lido = lerEstado(st, "es");
    expect(lido.respostas.idioma).toBe("es");
    expect(lido.respostas.abertura).toBeNull();
    expect(lido.respostas.ramoId).toBe("advocacia");
    expect(lido.estacao).toBe(3);
  });

  it("só leva o assistente ao editor quem respondeu alguma coisa", () => {
    expect(temAlgoRespondido(estadoInicial("pt-BR"))).toBe(false);
    expect(temAlgoRespondido(escolherRamo(estadoInicial("pt-BR"), "salao"))).toBe(true);
    expect(temAlgoRespondido({ ...estadoInicial("pt-BR"), estacao: 2 })).toBe(true);
    expect(temAlgoRespondido({ ...estadoInicial("pt-BR"), nome: "Marina" })).toBe(true);
    const r = estadoInicial("pt-BR").respostas;
    expect(
      temAlgoRespondido({ ...estadoInicial("pt-BR"), respostas: { ...r, negocio: "  " } }),
    ).toBe(false);
  });

  it("o idioma do agente acompanha a tela; idioma sem modelo cai em português", () => {
    expect(idiomaDoAgenteDaTela("es")).toBe("es");
    expect(idiomaDoAgenteDaTela("en")).toBe("en");
    expect(idiomaDoAgenteDaTela("zh-CN")).toBe("pt-BR");
    expect(idiomaDoAgenteDaTela("")).toBe("pt-BR");
  });

  it("limpar apaga; armazenamento que lança não derruba", () => {
    const st = armazenamentoFalso();
    gravarEstado(st, estadoInicial("pt-BR"));
    limparEstado(st);
    expect(st.dados[CHAVE_DO_ASSISTENTE]).toBeUndefined();
    const quebrado = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
      removeItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(lerEstado(quebrado, "pt-BR")).toEqual(estadoInicial("pt-BR"));
    expect(() => gravarEstado(quebrado, estadoInicial("pt-BR"))).not.toThrow();
    expect(() => limparEstado(quebrado)).not.toThrow();
  });
});

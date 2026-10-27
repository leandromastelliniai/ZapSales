/**
 * As contas da faixa "Sua IA" e a recomendação do Modelo padrão.
 *
 * O que este arquivo trava: sem chave para o provedor do padrão a tela PEDE ATENÇÃO (o agente não
 * responde ninguém), os ajudantes opcionais nunca contam como pendência, e a recomendação só diz o
 * que os dados sustentam — cadastrar a chave, ou não mexer sem razão.
 */
import { describe, expect, it } from "vitest";

import {
  contarAtencaoDaIA,
  origemDaChave,
  recomendarParaOPadrao,
  resumoDaIA,
  type EntradaDaIA,
} from "@/lib/ia/resumo-da-ia";

const PONTO_PADRAO = { origem: "padrao_da_organizacao", avisos: [] as string[] };

function entrada(sobre: Partial<EntradaDaIA> = {}): EntradaDaIA {
  return {
    pontos: [PONTO_PADRAO, PONTO_PADRAO, { origem: "painel", avisos: [] }],
    provedorDoPadrao: "anthropic",
    credenciais: [{ provider: "anthropic", label: "Chave da loja", api_key_last4: "c0de" }],
    instalacaoTemChave: false,
    jev: "desligado",
    audio: "desligado",
    mapas: "sem_chave",
    ...sobre,
  };
}

describe("origemDaChave", () => {
  it("a chave da empresa para o provedor do padrão vale primeiro", () => {
    expect(origemDaChave(entrada({ instalacaoTemChave: true }))).toEqual({
      tipo: "empresa",
      rotulo: "Chave da loja",
      ultimos4: "c0de",
    });
  });

  it("sem a da empresa, a da instalação é o piso", () => {
    expect(origemDaChave(entrada({ credenciais: [], instalacaoTemChave: true }))).toEqual({ tipo: "instalacao" });
  });

  it("sem nenhuma, falta", () => {
    expect(origemDaChave(entrada({ credenciais: [], instalacaoTemChave: false }))).toEqual({ tipo: "falta" });
  });

  it("chave de OUTRO provedor não faz o padrão funcionar", () => {
    const e = entrada({ credenciais: [{ provider: "openai", label: "OpenAI", api_key_last4: "1234" }] });
    expect(origemDaChave(e)).toEqual({ tipo: "falta" });
  });
});

describe("resumoDaIA", () => {
  it("conta quantas partes herdam o padrão e quantas pedem atenção", () => {
    const r = resumoDaIA(
      entrada({ pontos: [PONTO_PADRAO, { origem: "painel", avisos: ["sem catálogo"] }, { origem: "painel", avisos: [] }] }),
    );
    expect(r.total).toBe(3);
    expect(r.herdam).toBe(1);
    expect(r.comAviso).toBe(1);
    expect(r.conferencias.find((c) => c.id === "avisos")).toMatchObject({
      estado: "atencao",
      motivo: "partes_com_aviso",
      quantidade: 1,
    });
  });

  it("com chave e sem aviso, nada pede atenção — e os opcionais desligados não contam", () => {
    const r = resumoDaIA(entrada());
    expect(contarAtencaoDaIA(r.conferencias)).toBe(0);
    for (const id of ["jev", "audio", "mapas"] as const) {
      expect(r.conferencias.find((c) => c.id === id)?.estado).toBe("info");
    }
    expect(r.opcionaisEmUso).toBe(0);
  });

  it("sem chave é ATENÇÃO, com o motivo certo", () => {
    const r = resumoDaIA(entrada({ credenciais: [] }));
    expect(r.conferencias.find((c) => c.id === "chave")).toMatchObject({ estado: "atencao", motivo: "sem_chave" });
    expect(contarAtencaoDaIA(r.conferencias)).toBe(1);
  });

  it("chave da instalação é ok, e a frase diz de onde vem", () => {
    const r = resumoDaIA(entrada({ credenciais: [], instalacaoTemChave: true }));
    expect(r.conferencias.find((c) => c.id === "chave")).toMatchObject({ estado: "ok", motivo: "chave_da_instalacao" });
  });

  it("conta os opcionais em uso: Jev ligado, áudio ligado e mapas com chave", () => {
    const r = resumoDaIA(entrada({ jev: "ligado", audio: "ligado", mapas: "com_chave" }));
    expect(r.opcionaisEmUso).toBe(3);
    expect(r.conferencias.filter((c) => ["jev", "audio", "mapas"].includes(c.id)).map((c) => c.estado)).toEqual([
      "ok",
      "ok",
      "ok",
    ]);
  });

  it("opcional que não deu para ler é info, e não vira 'ligado' nem 'desligado'", () => {
    const r = resumoDaIA(entrada({ jev: "desconhecido", audio: "desconhecido", mapas: "desconhecido" }));
    expect(r.opcionais.map((o) => o.estado)).toEqual(["desconhecido", "desconhecido", "desconhecido"]);
    expect(r.opcionaisEmUso).toBe(0);
    expect(contarAtencaoDaIA(r.conferencias)).toBe(0);
  });
});

describe("recomendarParaOPadrao", () => {
  it("sem chave, a primeira coisa é cadastrá-la", () => {
    expect(recomendarParaOPadrao(resumoDaIA(entrada({ credenciais: [] })))).toEqual({ tipo: "cadastrar_chave" });
  });

  it("com chave, a orientação é não mexer sem razão — com os números do padrão", () => {
    expect(recomendarParaOPadrao(resumoDaIA(entrada()))).toEqual({ tipo: "manter_padrao", herdam: 2, total: 3 });
  });

  it("nunca recomenda um modelo específico: custo e privacidade a tela não conhece", () => {
    const r = recomendarParaOPadrao(resumoDaIA(entrada()));
    expect(Object.keys(r).sort()).toEqual(["herdam", "tipo", "total"]);
  });
});

/**
 * As contas da faixa "Suas conversões" e a recomendação do próximo passo.
 *
 * O que este arquivo trava: plataforma NÃO conectada é só informação (devolver vendas ao anúncio é
 * opcional), enquanto pausada, em teste e venda pendente são fato que pede atenção; e a recomendação
 * vem uma de cada vez, na ordem de quem começa.
 */
import { describe, expect, it } from "vitest";

import {
  contarAtencaoDeConversoes,
  estadoDaMeta,
  estadoDoGoogle,
  recomendarParaConversoes,
  resumoDasConversoes,
  type EntradaDasConversoes,
} from "@/lib/conversoes/resumo-das-conversoes";

function entrada(sobre: Partial<EntradaDasConversoes> = {}): EntradaDasConversoes {
  return {
    meta: { conectada: false, habilitada: false, emTeste: false },
    google: { instalacaoConfigurada: false, conectado: false, habilitado: false },
    enviadas: 0,
    pendentes: 0,
    capturaLigada: false,
    ...sobre,
  };
}

const META_ENVIANDO = { conectada: true, habilitada: true, emTeste: false };

describe("estado de cada plataforma", () => {
  it("Meta: não conectada, pausada, em teste e enviando", () => {
    expect(estadoDaMeta({ conectada: false, habilitada: false, emTeste: false })).toBe("nao_conectada");
    expect(estadoDaMeta({ conectada: true, habilitada: false, emTeste: false })).toBe("pausada");
    expect(estadoDaMeta({ conectada: true, habilitada: true, emTeste: true })).toBe("em_teste");
    expect(estadoDaMeta(META_ENVIANDO)).toBe("enviando");
  });

  it("pausada vale mais que teste: com o envio desligado nada sai, teste ou não", () => {
    expect(estadoDaMeta({ conectada: true, habilitada: false, emTeste: true })).toBe("pausada");
  });

  it("Google: indisponível na instalação, não conectado, pausado e enviando", () => {
    expect(estadoDoGoogle({ instalacaoConfigurada: false, conectado: true, habilitado: true })).toBe("indisponivel");
    expect(estadoDoGoogle({ instalacaoConfigurada: true, conectado: false, habilitado: false })).toBe("nao_conectada");
    expect(estadoDoGoogle({ instalacaoConfigurada: true, conectado: true, habilitado: false })).toBe("pausada");
    expect(estadoDoGoogle({ instalacaoConfigurada: true, conectado: true, habilitado: true })).toBe("enviando");
  });
});

describe("resumoDasConversoes", () => {
  it("nada conectado: tudo é informação, e NADA pede atenção", () => {
    const r = resumoDasConversoes(entrada());
    expect(contarAtencaoDeConversoes(r.conferencias)).toBe(0);
    expect(r.conferencias.map((c) => c.estado)).toEqual(["info", "info", "info", "info"]);
  });

  it("Meta enviando, sem pendência: tudo certo", () => {
    const r = resumoDasConversoes(entrada({ meta: META_ENVIANDO, enviadas: 12, capturaLigada: true }));
    expect(contarAtencaoDeConversoes(r.conferencias)).toBe(0);
    expect(r.conferencias.find((c) => c.id === "meta")?.estado).toBe("ok");
    expect(r.conferencias.find((c) => c.id === "pendencias")).toMatchObject({ estado: "ok", motivo: "sem_pendencias" });
    expect(r.enviadas).toBe(12);
  });

  it("em teste e pausada pedem atenção; pendência também, com a quantidade", () => {
    const emTeste = resumoDasConversoes(entrada({ meta: { ...META_ENVIANDO, emTeste: true } }));
    expect(emTeste.conferencias.find((c) => c.id === "meta")).toMatchObject({ estado: "atencao", motivo: "meta_em_teste" });

    const pausada = resumoDasConversoes(entrada({ meta: { conectada: true, habilitada: false, emTeste: false } }));
    expect(pausada.conferencias.find((c) => c.id === "meta")?.estado).toBe("atencao");

    const comPendencia = resumoDasConversoes(entrada({ meta: META_ENVIANDO, pendentes: 3 }));
    expect(comPendencia.conferencias.find((c) => c.id === "pendencias")).toMatchObject({
      estado: "atencao",
      motivo: "com_pendencias",
      quantidade: 3,
    });
    expect(contarAtencaoDeConversoes(comPendencia.conferencias)).toBe(1);
  });

  it("pendência sem plataforma conectada (resto de uma conexão apagada) ainda pede atenção", () => {
    const r = resumoDasConversoes(entrada({ pendentes: 2 }));
    expect(r.conferencias.find((c) => c.id === "pendencias")?.estado).toBe("atencao");
  });

  it("captura desligada é info, nunca atenção", () => {
    const r = resumoDasConversoes(entrada({ meta: META_ENVIANDO }));
    expect(r.conferencias.find((c) => c.id === "captura")).toMatchObject({ estado: "info", motivo: "captura_desligada" });
  });

  it("guarda o piso quando a lista bateu no teto", () => {
    expect(resumoDasConversoes(entrada({ pendentes: 20, pendentesAlemDoTeto: true })).pendentesAlemDoTeto).toBe(true);
    expect(resumoDasConversoes(entrada({ pendentes: 3 })).pendentesAlemDoTeto).toBe(false);
  });
});

describe("recomendarParaConversoes", () => {
  const rec = (sobre: Partial<EntradaDasConversoes>) => {
    const e = entrada(sobre);
    return recomendarParaConversoes(resumoDasConversoes(e), e.capturaLigada);
  };

  it("sem plataforma conectada, a primeira coisa é conectar a que anuncia", () => {
    expect(rec({})).toEqual({ tipo: "conectar_plataforma" });
  });

  it("em teste: apagar o código de teste", () => {
    expect(rec({ meta: { ...META_ENVIANDO, emTeste: true } })).toEqual({ tipo: "apagar_codigo_de_teste" });
  });

  it("pausada: religar", () => {
    expect(rec({ meta: { conectada: true, habilitada: false, emTeste: false } })).toEqual({ tipo: "religar_envio" });
  });

  it("com pendência: conferir a lista", () => {
    expect(rec({ meta: META_ENVIANDO, pendentes: 4 })).toEqual({ tipo: "resolver_pendencias", quantidade: 4 });
  });

  it("tudo certo mas sem captura de origem: ligar o endereço de captura", () => {
    expect(rec({ meta: META_ENVIANDO })).toEqual({ tipo: "ligar_captura" });
  });

  it("tudo certo e captura ligada: nada a recomendar", () => {
    expect(rec({ meta: META_ENVIANDO, capturaLigada: true })).toBeNull();
  });

  it("a ordem é a de quem começa: teste vem antes de pausa, pausa antes de pendência", () => {
    // Meta em teste e Google pausado ao mesmo tempo: o teste da Meta ganha.
    expect(
      rec({
        meta: { ...META_ENVIANDO, emTeste: true },
        google: { instalacaoConfigurada: true, conectado: true, habilitado: false },
        pendentes: 5,
      }),
    ).toEqual({ tipo: "apagar_codigo_de_teste" });
    expect(
      rec({
        meta: META_ENVIANDO,
        google: { instalacaoConfigurada: true, conectado: true, habilitado: false },
        pendentes: 5,
      }),
    ).toEqual({ tipo: "religar_envio" });
  });
});

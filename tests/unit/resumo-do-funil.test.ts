/**
 * As contas da faixa "Seu funil" e a sugestão para o agente.
 *
 * Duas coisas que a tela promete e que este arquivo trava: o resumo só conta o que o funil TEM
 * (etapa aberta, de fechamento, de perda, passo que o agente move), e a sugestão só propõe o que
 * não tem dúvida — Ganho e Perdido — sem nunca sobrescrever uma escolha.
 */
import { describe, expect, it } from "vitest";

import {
  contarAtencaoDoFunil,
  EXEMPLOS_DE_VOCABULARIO,
  resumoDoFunil,
  sugerirMapeamento,
  vocabularioLido,
  type EtapaDoResumo,
  type MapaDoResumo,
} from "@/lib/funil/resumo-do-funil";

const etapa = (id: string, name: string, tipo: "aberta" | "ganho" | "perda" = "aberta"): EtapaDoResumo => ({
  id,
  name,
  is_won: tipo === "ganho",
  is_lost: tipo === "perda",
});

const PEDIDOS = [
  etapa("e1", "Carrinho abandonado"),
  etapa("e2", "Aguardando pagamento"),
  etapa("e3", "Pago", "ganho"),
  etapa("e4", "Cancelado", "perda"),
];

const VAZIO: MapaDoResumo = {
  new: null,
  contacted: null,
  qualifying: null,
  qualified: null,
  negotiating: null,
  won: null,
  lost: null,
};

describe("resumoDoFunil", () => {
  it("conta etapas abertas, de fechamento e de perda, e os passos que o agente move", () => {
    const r = resumoDoFunil(PEDIDOS, { ...VAZIO, qualifying: "e1", won: "e3" });
    expect(r.total).toBe(4);
    expect(r.abertas).toBe(2);
    expect(r.fechamento).toEqual(["Pago"]);
    expect(r.perda).toEqual(["Cancelado"]);
    expect(r.passosMovidos).toBe(2);
    expect(r.totalDePassos).toBe(7);
  });

  it("funil completo e agente movendo: nada pede atenção", () => {
    const r = resumoDoFunil(PEDIDOS, { ...VAZIO, won: "e3" });
    expect(contarAtencaoDoFunil(r.conferencias)).toBe(0);
    expect(r.conferencias.map((c) => c.estado)).toEqual(["ok", "ok", "ok", "ok"]);
  });

  it("sem etapa de fechamento e sem de perda: as duas pedem atenção, com o motivo certo", () => {
    const r = resumoDoFunil([etapa("e1", "Novo"), etapa("e2", "Atendendo")], VAZIO);
    const porId = Object.fromEntries(r.conferencias.map((c) => [c.id, c]));
    expect(porId.fechamento).toMatchObject({ estado: "atencao", motivo: "sem_fechamento" });
    expect(porId.perda).toMatchObject({ estado: "atencao", motivo: "sem_perda" });
    expect(contarAtencaoDoFunil(r.conferencias)).toBe(2);
  });

  it("funil só com ganho e perda: falta etapa aberta", () => {
    const r = resumoDoFunil([etapa("e3", "Pago", "ganho"), etapa("e4", "Cancelado", "perda")], VAZIO);
    expect(r.abertas).toBe(0);
    expect(r.conferencias[0]).toMatchObject({ id: "etapas", estado: "atencao", motivo: "sem_etapa_aberta" });
  });

  it("agente sem mover nenhum passo é INFO — «não mover» é escolha, nunca pendência", () => {
    const r = resumoDoFunil(PEDIDOS, VAZIO);
    const agente = r.conferencias.find((c) => c.id === "agente");
    expect(agente).toMatchObject({ estado: "info", motivo: "agente_nao_move" });
    // …e por isso não entra na conta de «pedem atenção».
    expect(contarAtencaoDoFunil(r.conferencias)).toBe(0);
  });

  it("cita todas as etapas quando há mais de uma de fechamento", () => {
    const r = resumoDoFunil([...PEDIDOS, etapa("e5", "Pago na loja", "ganho")], VAZIO);
    expect(r.fechamento).toEqual(["Pago", "Pago na loja"]);
    expect(r.conferencias.find((c) => c.id === "fechamento")?.nomes).toEqual(["Pago", "Pago na loja"]);
  });
});

describe("sugerirMapeamento", () => {
  it("sugere Ganho → etapa de fechamento e Perdido → etapa de perda", () => {
    expect(sugerirMapeamento(PEDIDOS, VAZIO)).toEqual([
      { passo: "won", etapa: PEDIDOS[2] },
      { passo: "lost", etapa: PEDIDOS[3] },
    ]);
  });

  it("NUNCA chuta os cinco passos do meio — dependem do desenho do quadro de cada negócio", () => {
    const passos = sugerirMapeamento(PEDIDOS, VAZIO).map((s) => s.passo);
    expect(passos.every((p) => p === "won" || p === "lost")).toBe(true);
  });

  it("não sobrescreve passo que já tem etapa escolhida", () => {
    expect(sugerirMapeamento(PEDIDOS, { ...VAZIO, won: "e3" })).toEqual([
      { passo: "lost", etapa: PEDIDOS[3] },
    ]);
    expect(sugerirMapeamento(PEDIDOS, { ...VAZIO, won: "e3", lost: "e4" })).toEqual([]);
  });

  it("não sugere o que o funil não tem", () => {
    expect(sugerirMapeamento([etapa("e1", "Novo")], VAZIO)).toEqual([]);
  });

  it("com duas etapas de fechamento, a primeira da ordem do funil desempata", () => {
    const etapas = [etapa("a", "Pago", "ganho"), etapa("b", "Pago na loja", "ganho")];
    expect(sugerirMapeamento(etapas, VAZIO)).toEqual([{ passo: "won", etapa: etapas[0] }]);
  });
});

describe("vocabulário", () => {
  it("lê só o que é texto de verdade", () => {
    expect(vocabularioLido(null)).toBeNull();
    expect(vocabularioLido({})).toBeNull();
    expect(vocabularioLido({ lead: "  ", deal: "" })).toBeNull();
    expect(vocabularioLido({ lead: " Cliente ", won: "Pago", extra: "x" })).toEqual({
      lead: "Cliente",
      won: "Pago",
    });
  });

  it("os exemplos preenchem as quatro palavras e têm id único", () => {
    for (const ex of EXEMPLOS_DE_VOCABULARIO) {
      for (const k of ["lead", "deal", "won", "lost"] as const) expect(ex[k].trim()).not.toBe("");
    }
    expect(new Set(EXEMPLOS_DE_VOCABULARIO.map((e) => e.id)).size).toBe(EXEMPLOS_DE_VOCABULARIO.length);
  });
});

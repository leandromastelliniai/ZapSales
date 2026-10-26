import { describe, expect, it } from "vitest";

import { ROUTING_MODES, VISIBILITY_MODES } from "@/lib/schemas/routing";

import { recomendacaoDeDistribuicao } from "./recomendacao-de-distribuicao";

describe("recomendacaoDeDistribuicao", () => {
  it.each([
    [0, "manual", "all"],
    [1, "manual", "all"],
    [2, "round_robin", "all"],
    [3, "round_robin", "own_and_unassigned"],
    [6, "round_robin", "own_and_unassigned"],
    [7, "load", "own_and_unassigned"],
    [40, "load", "own_and_unassigned"],
  ])("com %i atendentes recomenda %s e visibilidade %s", (n, modo, visibilidade) => {
    const r = recomendacaoDeDistribuicao(n);
    expect(r.modo).toBe(modo);
    expect(r.visibilidade).toBe(visibilidade);
  });

  it("só recomenda valores que a tela oferece", () => {
    for (let n = 0; n <= 12; n++) {
      const r = recomendacaoDeDistribuicao(n);
      expect(ROUTING_MODES).toContain(r.modo);
      expect(VISIBILITY_MODES).toContain(r.visibilidade);
    }
  });

  it("nunca recomenda a combinação que deixa a fila vazia ('só os seus' com 'cada um pega')", () => {
    for (let n = 0; n <= 40; n++) {
      const r = recomendacaoDeDistribuicao(n);
      expect(r.modo === "manual" && r.visibilidade === "own").toBe(false);
    }
  });
});

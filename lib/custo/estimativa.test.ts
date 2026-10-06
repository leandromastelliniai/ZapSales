import { describe, expect, it } from "vitest";

import { estimarCusto } from "./estimativa";
import { TABELA_INICIAL, type LinhaDePreco } from "./tabela-de-precos";

describe("estimarCusto — o que a campanha vai custar pela tabela", () => {
  it("marketing no Brasil sai a R$ 0,3217 por mensagem, pela tabela inicial", () => {
    const e = estimarCusto(["+5531988880001", "+5531988880002", "+5511977770000"], "marketing", TABELA_INICIAL);
    expect(e.mensagens).toBe(3);
    expect(e.total_cents).toBeCloseTo(96.51, 6);
    expect(e.sem_preco).toBe(0);
    expect(e.por_pais).toEqual([
      { country: "BR", quantidade: 3, unit_price_cents: 32.17, subtotal_cents: expect.closeTo(96.51, 6) },
    ]);
  });

  it("utilidade, autenticação e atendimento saem a R$ 0,035", () => {
    for (const categoria of ["utility", "authentication", "service"] as const) {
      expect(estimarCusto(["+5531988880001"], categoria, TABELA_INICIAL).total_cents).toBeCloseTo(3.5, 6);
    }
  });

  it("telefone de país sem linha na tabela é contado à parte, sem inventar preço", () => {
    const e = estimarCusto(["+5531988880001", "+351912345678"], "marketing", TABELA_INICIAL);
    expect(e.mensagens).toBe(2);
    expect(e.sem_preco).toBe(1);
    expect(e.total_cents).toBeCloseTo(32.17, 6);
  });

  it("o prefixo mais longo vence: +1 de outro país não pega o preço do +1 genérico", () => {
    const tabela: LinhaDePreco[] = [
      { country: "US", dial_prefix: "1", category: "marketing", unit_price_cents: 10, currency: "BRL" },
      { country: "JM", dial_prefix: "1876", category: "marketing", unit_price_cents: 20, currency: "BRL" },
    ];
    const e = estimarCusto(["+12025550100", "+18765550100"], "marketing", tabela);
    expect(e.total_cents).toBe(30);
    expect(e.por_pais.map((p) => p.country).sort()).toEqual(["JM", "US"]);
  });

  it("mudar a tabela muda a estimativa seguinte", () => {
    const nova = TABELA_INICIAL.map((l) =>
      l.country === "BR" && l.category === "marketing" ? { ...l, unit_price_cents: 40 } : l,
    );
    expect(estimarCusto(["+5531988880001"], "marketing", nova).total_cents).toBe(40);
  });
});

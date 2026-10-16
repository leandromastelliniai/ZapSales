import { describe, expect, it } from "vitest";

import {
  TROCAS_MAXIMAS_DO_TESTE,
  cenarioDaConversa,
  historicoDoTesteSchema,
} from "./teste-em-varias-trocas";

const AGORA = new Date("2026-10-15T12:00:00.000Z");

describe("cenarioDaConversa — o que o agente recebe numa conversa de teste", () => {
  it("sem histórico, é a mensagem nova sozinha, como o teste de uma troca sempre foi", () => {
    const m = cenarioDaConversa([], "Oi, quanto custa?", AGORA);
    expect(m).toEqual([{ direction: "inbound", body: "Oi, quanto custa?", sent_at: AGORA.toISOString() }]);
  });

  it("cliente vira inbound, agente vira outbound, e a mensagem nova é a última inbound", () => {
    const m = cenarioDaConversa(
      [
        { role: "customer", text: "Oi" },
        { role: "agent", text: "Olá! Em que posso ajudar?" },
      ],
      "Quero o plano Pro",
      AGORA,
    );
    expect(m.map((x) => [x.direction, x.body])).toEqual([
      ["inbound", "Oi"],
      ["outbound", "Olá! Em que posso ajudar?"],
      ["inbound", "Quero o plano Pro"],
    ]);
  });

  it("a ordem cronológica é estrita e a última mensagem é a de agora (janela de 24h e pausa humana leem isto)", () => {
    const m = cenarioDaConversa(
      [
        { role: "customer", text: "a" },
        { role: "agent", text: "b" },
      ],
      "c",
      AGORA,
    );
    const ts = m.map((x) => new Date(x.sent_at).getTime());
    expect(ts).toEqual([...ts].sort((x, y) => x - y));
    expect(new Set(ts).size).toBe(ts.length);
    expect(ts.at(-1)).toBe(AGORA.getTime());
  });
});

describe("historicoDoTesteSchema — entrada externa, validada", () => {
  it("aceita turnos de cliente e de agente", () => {
    expect(historicoDoTesteSchema.safeParse([{ role: "customer", text: "oi" }]).success).toBe(true);
  });

  it("recusa papel desconhecido, texto vazio e campo a mais", () => {
    expect(historicoDoTesteSchema.safeParse([{ role: "system", text: "oi" }]).success).toBe(false);
    expect(historicoDoTesteSchema.safeParse([{ role: "customer", text: "   " }]).success).toBe(false);
    expect(historicoDoTesteSchema.safeParse([{ role: "customer", text: "oi", extra: 1 }]).success).toBe(false);
  });

  it("recusa histórico acima do teto, para o custo de uma chamada não crescer sem limite", () => {
    const longo = Array.from({ length: TROCAS_MAXIMAS_DO_TESTE * 2 + 1 }, () => ({
      role: "customer" as const,
      text: "oi",
    }));
    expect(historicoDoTesteSchema.safeParse(longo).success).toBe(false);
  });
});

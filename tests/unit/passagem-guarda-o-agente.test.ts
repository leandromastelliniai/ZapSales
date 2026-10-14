/**
 * A PASSAGEM GUARDA QUAL AGENTE DE IA PASSOU A CONVERSA (migration 0545).
 *
 * O dono do produto pediu que a Inbox diga QUAL agente passou a conversa para
 * uma pessoa ("Sofia (IA) transferiu para Ana"). O motor tem o agente em mãos
 * no momento da passagem e o descartava; agora ele vai para
 * `passagens_de_atendimento.agente_id`.
 *
 * O id do ator nem sempre é um agente de verdade: o motor usa `'agent-engine'`
 * quando nenhum agente foi resolvido. Gravar isso na coluna uuid derrubaria o
 * INSERT inteiro — e a passagem é história do atendimento. Por isso o preparo
 * aceita só uuid e degrada para nulo (a tela diz "IA").
 */
import { describe, expect, it, vi } from "vitest";

import { prepararLinhaDaPassagem, registrarPassagem } from "@/lib/escalacao/passagem";
import { montarBriefingDaPassagem } from "@/lib/escalacao/briefing-da-passagem";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONTATO = "22222222-2222-4222-8222-222222222222";
const CONVERSA = "33333333-3333-4333-8333-333333333333";
const AGENTE = "44444444-4444-4444-8444-444444444444";

const BRIEFING = montarBriefingDaPassagem({
  checkpoint: null,
  pendentesDoCliente: ["quero falar com alguém"],
  motivo: { codigo: "requested_human" },
});

function nova(agenteId?: string | null) {
  return {
    organizationId: ORG,
    contactId: CONTATO,
    conversationId: CONVERSA,
    motor: "engine" as const,
    origem: "pedido_explicito" as const,
    motivoCodigo: "requested_human" as const,
    briefing: BRIEFING,
    ...(agenteId !== undefined ? { agenteId } : {}),
  };
}

describe("prepararLinhaDaPassagem — o agente", () => {
  it("guarda o agente quando o motor o conhece", () => {
    expect(prepararLinhaDaPassagem(nova(AGENTE)).agente_id).toBe(AGENTE);
  });

  it("sem agente (turno genérico, teto de orçamento), a coluna fica nula", () => {
    expect(prepararLinhaDaPassagem(nova()).agente_id).toBeNull();
    expect(prepararLinhaDaPassagem(nova(null)).agente_id).toBeNull();
  });

  it("id de ator que não é agente ('agent-engine') vira nulo, não derruba o INSERT", () => {
    expect(prepararLinhaDaPassagem(nova("agent-engine")).agente_id).toBeNull();
  });
});

describe("registrarPassagem — o agente chega ao INSERT do motor", () => {
  it("a coluna e o valor vão juntos, na mesma posição", async () => {
    const chamadas: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        chamadas.push({ sql, params });
        return { rows: [], rowCount: 0 };
      }),
    };
    const r = await registrarPassagem(pool as never, nova(AGENTE));
    expect(r.gravada).toBe(true);

    const insert = chamadas[0];
    if (!insert) throw new Error("nenhum INSERT");
    const colunas = /\(([^)]+)\)\s*values/i.exec(insert.sql)?.[1]?.split(",").map((c) => c.trim()) ?? [];
    const posicao = colunas.indexOf("agente_id");
    expect(posicao).toBeGreaterThanOrEqual(0);
    expect(insert.params[posicao]).toBe(AGENTE);
  });
});

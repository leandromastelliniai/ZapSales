import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { respostaDaExecucao } from "./resposta-da-execucao";

const ORG = "11111111-0000-4000-8000-000000000001";
const AGENT = "22222222-0000-4000-8000-000000000002";
const CALL = "33333333-0000-4000-8000-000000000003";
const CONTACT = "44444444-0000-4000-8000-000000000004";

/** Cada `from(tabela)` consome a próxima resposta programada, e registra os filtros `eq`. */
function banco(script: Record<string, unknown[]>) {
  const filas = new Map(Object.entries(script).map(([k, v]) => [k, [...v]]));
  const filtros: Array<{ tabela: string; coluna: string; valor: unknown }> = [];
  const from = (tabela: string) => {
    const valor = filas.get(tabela)?.shift() ?? null;
    const cadeia: Record<string, unknown> = {};
    const eu = () => cadeia;
    for (const m of ["select", "gte", "lte", "not", "order", "limit"]) cadeia[m] = vi.fn(eu);
    cadeia.eq = vi.fn((coluna: string, v: unknown) => {
      filtros.push({ tabela, coluna, valor: v });
      return cadeia;
    });
    cadeia.maybeSingle = vi.fn(async () => ({ data: valor, error: null }));
    cadeia.then = (resolve: (v: unknown) => unknown) => resolve({ data: valor, error: null });
    return cadeia;
  };
  return { db: { from } as unknown as SupabaseClient, filtros };
}

const CHAMADA = { contact_id: CONTACT, created_at: "2026-10-15T12:00:00Z" };
const RESPOSTA = { id: "m3", conversation_id: "c1", sent_at: "2026-10-15T12:00:03Z", body: "Não sei." };

describe("respostaDaExecucao — a conversa que levou a uma execução real", () => {
  it("devolve as falas até a resposta do agente, na ordem, com os papéis que a tela usa", async () => {
    const { db } = banco({
      llm_calls: [CHAMADA],
      messages: [
        RESPOSTA,
        // a leitura da conversa vem do mais recente para o mais antigo
        [
          { direction: "outbound", body: "Não sei.", sent_at: "2026-10-15T12:00:03Z" },
          { direction: "inbound", body: "Quanto custa o Pro?", sent_at: "2026-10-15T11:59:50Z" },
          { direction: "outbound", body: "Olá!", sent_at: "2026-10-15T11:59:40Z" },
        ],
      ],
    });
    const r = await respostaDaExecucao(db, { organizationId: ORG, agentId: AGENT, chamadaId: CALL });
    expect(r).toEqual({
      ok: true,
      conversa: [
        { role: "agent", text: "Olá!" },
        { role: "customer", text: "Quanto custa o Pro?" },
        { role: "agent", text: "Não sei." },
      ],
    });
  });

  it("chamada de outro agente, de outra organização ou que não é turno de atendimento não existe", async () => {
    const { db } = banco({ llm_calls: [null] });
    const r = await respostaDaExecucao(db, { organizationId: ORG, agentId: AGENT, chamadaId: CALL });
    expect(r).toEqual({ ok: false, motivo: "chamada_nao_encontrada" });
  });

  it("toda leitura é presa à organização e ao agente, nunca só ao id", async () => {
    const { db, filtros } = banco({
      llm_calls: [CHAMADA],
      messages: [RESPOSTA, [{ direction: "outbound", body: "Não sei.", sent_at: RESPOSTA.sent_at }]],
    });
    await respostaDaExecucao(db, { organizationId: ORG, agentId: AGENT, chamadaId: CALL });
    for (const tabela of ["llm_calls", "messages"]) {
      expect(filtros).toContainEqual({ tabela, coluna: "organization_id", valor: ORG });
    }
    expect(filtros).toContainEqual({ tabela: "llm_calls", coluna: "agent_id", valor: AGENT });
    expect(filtros).toContainEqual({ tabela: "llm_calls", coluna: "purpose", valor: "agent_turn" });
    expect(filtros).toContainEqual({ tabela: "messages", coluna: "contact_id", valor: CONTACT });
  });

  it("turno que não terminou em mensagem do agente (rascunho, bloqueio, sem contato) não tem o que corrigir", async () => {
    const semMensagem = banco({ llm_calls: [CHAMADA], messages: [null] });
    expect(
      await respostaDaExecucao(semMensagem.db, { organizationId: ORG, agentId: AGENT, chamadaId: CALL }),
    ).toEqual({ ok: false, motivo: "sem_resposta_do_agente" });

    const semContato = banco({ llm_calls: [{ contact_id: null, created_at: CHAMADA.created_at }] });
    expect(
      await respostaDaExecucao(semContato.db, { organizationId: ORG, agentId: AGENT, chamadaId: CALL }),
    ).toEqual({ ok: false, motivo: "sem_resposta_do_agente" });
  });
});

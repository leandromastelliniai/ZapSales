import { describe, expect, it } from "vitest";

import { agenteDaResposta } from "@/lib/inbox/agente-da-conversa";

const AGENTE = "44444444-4444-4444-8444-444444444444";

describe("agenteDaResposta — quem respondeu, lido da própria mensagem", () => {
  it("o motor grava o agente em `metadata.ai_actor_id`", () => {
    expect(agenteDaResposta({ ai_actor_id: AGENTE })).toBe(AGENTE);
  });

  it("ator que não é agente (turno genérico, aviso do sistema) não vira nome", () => {
    expect(agenteDaResposta({ ai_actor_id: "agent-engine" })).toBeNull();
    expect(agenteDaResposta({ ai_actor_id: "agent-engine:meet-delivery" })).toBeNull();
  });

  it("metadata ausente, vazia ou de outro formato: nulo", () => {
    expect(agenteDaResposta(null)).toBeNull();
    expect(agenteDaResposta({})).toBeNull();
    expect(agenteDaResposta({ ai_actor_id: 42 })).toBeNull();
    expect(agenteDaResposta("texto")).toBeNull();
  });
});

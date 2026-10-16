import type pg from "pg";
import { loadAgentVersionConfig } from "./agent-config";
import { runAgentPreview, type InboundTurnDeps } from "./inbound-turn";
import { newPreviewResult, scenarioContext } from "./preview";
import { medirUsoDoTurno } from "../edge/llm/uso-do-turno";
import { cenarioDaConversa, type TurnoDoTeste } from "@/lib/ai/agents/teste-em-varias-trocas";
export async function testAgentVersion(
  pool: pg.Pool,
  deps: InboundTurnDeps,
  input: {
    organizationId: string;
    agentId: string;
    versionId: string;
    runId: string;
    sampleMessage: string;
    /** O que já foi dito na conversa de teste (issue #90). Vazio: teste de uma troca. */
    history?: readonly TurnoDoTeste[];
    sampleContact?: { name?: string; phone?: string };
    channelId: string | null;
  },
) {
  const agent = await loadAgentVersionConfig(
    pool,
    input.organizationId,
    input.agentId,
    input.versionId,
  );
  if (!agent) throw new Error("preview_version_unavailable");
  const result = newPreviewResult();
  const context = scenarioContext(
    cenarioDaConversa(input.history ?? [], input.sampleMessage, deps.clock?.() ?? new Date()),
    input.sampleContact,
  );
  // O gasto de TODAS as chamadas ao modelo do turno, e não só a da resposta.
  const { uso } = await medirUsoDoTurno(() =>
    runAgentPreview(deps, pool, {
      kind: "sandbox",
      organizationId: input.organizationId,
      runId: input.runId,
      agent,
      context,
      contactId: null,
      channelId: input.channelId,
      result,
    }),
  );
  result.usage = uso;
  return result;
}

import type pg from "pg";
import { loadAgentVersionConfig } from "./agent-config";
import { runAgentPreview, type InboundTurnDeps } from "./inbound-turn";
import { newPreviewResult, scenarioContext } from "./preview";
import { cenarioDaConversa, type TurnoDoTeste } from "@/lib/ai/agents/teste-em-varias-trocas";

/**
 * Quando o teste pede "o cliente mandou ÁUDIO" (resposta em áudio, #91), a última mensagem do
 * cliente — a que o turno vai responder — leva o tipo áudio; o histórico da conversa não muda.
 */
function cenarioComAudio(
  conversa: ReturnType<typeof cenarioDaConversa>,
  audio: boolean,
): ReturnType<typeof cenarioDaConversa> {
  if (!audio || conversa.length === 0) return conversa;
  const ultima = conversa[conversa.length - 1]!;
  return [...conversa.slice(0, -1), { ...ultima, type: "audio" }];
}
export async function testAgentVersion(
  pool: pg.Pool,
  deps: InboundTurnDeps,
  input: {
    organizationId: string;
    agentId: string;
    versionId: string;
    runId: string;
    sampleMessage: string;
    /** O cliente "mandou" a mensagem como áudio (resposta em áudio, #91). */
    sampleAudio?: boolean;
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
    cenarioComAudio(
      cenarioDaConversa(input.history ?? [], input.sampleMessage, deps.clock?.() ?? new Date()),
      input.sampleAudio === true,
    ),
    input.sampleContact,
  );
  await runAgentPreview(deps, pool, {
    kind: "sandbox",
    organizationId: input.organizationId,
    runId: input.runId,
    agent,
    context,
    contactId: null,
    channelId: input.channelId,
    result,
  });
  return result;
}

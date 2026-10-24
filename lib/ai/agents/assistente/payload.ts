/**
 * O payload que o assistente manda para `createMcpAgentAction` — a MESMA ação do
 * `AgentForm` em modo `create`, e o mesmo contrato (`agentMcpCreateSchema`). Não existe
 * segundo caminho de criação: o que não é dito aqui vale pelo default do próprio
 * contrato (`max_steps` 10, orçamento de 50 mil tokens, as três palavras de passagem
 * para uma pessoa…), que são os mesmos números com que o editor completo nasce.
 *
 * Nasce como RASCUNHO e sem número de WhatsApp (`channel_session_id: null`): quem cobra
 * o número é a publicação, nunca o salvar.
 */
import type { z } from "zod";

import type { PadroesDeIa } from "../padroes-de-ia";
import type { agentMcpCreateSchema } from "../validation";
import type { AgenteComposto } from "./compor";

export type PayloadDeCriacao = z.input<typeof agentMcpCreateSchema>;

export function payloadDeCriacao(
  agente: AgenteComposto,
  padroes: Extract<PadroesDeIa, { ok: true }>,
  opcoes: { nome: string; funilPadraoId: string | null },
): PayloadDeCriacao & { version: NonNullable<PayloadDeCriacao["version"]> } {
  return {
    name: opcoes.nome.trim() || agente.name,
    priority: 0,
    version: {
      system_prompt: agente.system_prompt,
      provider: padroes.provider,
      model: padroes.model,
      credential_id: padroes.credentialId,
      channel_session_id: null,
      tool_ids: agente.tool_ids,
      pipeline_ids: agente.usa_funil && opcoes.funilPadraoId ? [opcoes.funilPadraoId] : [],
      profile_persona: agente.profile_persona,
      profile_tone: agente.profile_tone,
      profile_objective: agente.profile_objective,
      profile_welcome: agente.profile_welcome,
      profile_language: agente.profile_language,
      restrict_topics: false,
      allowed_topics: agente.allowed_topics,
      off_topic_reply: agente.off_topic_reply,
    },
  };
}

/**
 * Qual agente de IA está respondendo esta conversa — para o chip do cabeçalho
 * dizer "Sofia (IA) atendendo" em vez de só "IA atendendo".
 *
 * Calculado, sem coluna nova (DIRC: Calcular): toda resposta do motor já grava
 * o agente em `messages.metadata.ai_actor_id` (`app/api/v1/messages/_handler.ts`).
 * A última resposta da IA diz quem está no comando agora — inclusive quando um
 * roteador troca de agente no meio da conversa.
 *
 * `conversations.active_ai_agent_id` NÃO serve de fonte: só existe com
 * roteador, e a passagem para uma pessoa o zera.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O id do agente gravado na mensagem, ou `null`. O ator nem sempre é um agente:
 * o motor grava `'agent-engine'` quando nenhum foi resolvido, e outros
 * remetentes automáticos gravam rótulos próprios. Só uuid passa.
 */
export function agenteDaResposta(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const id = (metadata as { ai_actor_id?: unknown }).ai_actor_id;
  return typeof id === "string" && UUID.test(id) ? id : null;
}

/** O que a rota devolve e o chip lê. */
export interface AgenteDaConversa {
  id: string;
  nome: string;
}

/**
 * A resposta que uma execução REAL de agente enviou, e a conversa que levou a ela
 * (issue #90): é o que "corrigir esta resposta" mostra e cita quando a origem é a
 * aba Execuções.
 *
 * ## Por que há uma busca, e não um id de mensagem
 *
 * A aba Execuções lista `llm_calls` (o motor vivo não escreve `ai_agent_runs`) e
 * `llm_calls` não guarda a mensagem enviada: tem o contato e o instante, só. A
 * resposta é achada pelo que a liga ao turno — a primeira mensagem de texto do
 * agente (`sent_via = 'ai'`) para aquele contato logo depois da chamada ao
 * modelo. É uma busca por proximidade, dita como tal: turno que terminou sem
 * mensagem (rascunho do modo Assistido, bloqueio pela cadeia, sem contato) não
 * tem resposta, e dizer isso é a resposta honesta.
 *
 * Toda leitura é presa à organização e ao agente — nunca só ao id da chamada.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { TurnoDoTeste } from "@/lib/ai/agents/teste-em-varias-trocas";

/** A chamada ao modelo é gravada depois da resposta do modelo e antes do envio. */
const FOLGA_ANTES_MS = 5_000;
/** O envio pode esperar a pausa humana e a fila; passado isto, a mensagem é de outro turno. */
const JANELA_DEPOIS_MS = 15 * 60_000;
/** Quantas falas até a resposta: o contexto de uma correção, não a conversa inteira. */
const FALAS_DE_CONTEXTO = 12;

export type RespostaDaExecucao =
  | { ok: true; conversa: TurnoDoTeste[] }
  | { ok: false; motivo: "chamada_nao_encontrada" | "sem_resposta_do_agente" };

export async function respostaDaExecucao(
  db: SupabaseClient,
  p: { organizationId: string; agentId: string; chamadaId: string },
): Promise<RespostaDaExecucao> {
  const { data: chamada } = await db
    .from("llm_calls")
    .select("contact_id, created_at")
    .eq("organization_id", p.organizationId)
    .eq("agent_id", p.agentId)
    .eq("purpose", "agent_turn")
    .eq("id", p.chamadaId)
    .maybeSingle();
  if (!chamada) return { ok: false, motivo: "chamada_nao_encontrada" };
  if (!chamada.contact_id) return { ok: false, motivo: "sem_resposta_do_agente" };

  const quando = new Date(chamada.created_at).getTime();
  const { data: resposta } = await db
    .from("messages")
    .select("id, conversation_id, sent_at, body")
    .eq("organization_id", p.organizationId)
    .eq("contact_id", chamada.contact_id)
    .eq("direction", "outbound")
    .eq("sent_via", "ai")
    .eq("type", "text")
    .not("body", "is", null)
    .gte("sent_at", new Date(quando - FOLGA_ANTES_MS).toISOString())
    .lte("sent_at", new Date(quando + JANELA_DEPOIS_MS).toISOString())
    .order("sent_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!resposta?.body) return { ok: false, motivo: "sem_resposta_do_agente" };

  const { data: falas } = await db
    .from("messages")
    .select("direction, body, sent_at")
    .eq("organization_id", p.organizationId)
    .eq("conversation_id", resposta.conversation_id)
    .eq("type", "text")
    .not("body", "is", null)
    .lte("sent_at", resposta.sent_at)
    .order("sent_at", { ascending: false })
    .limit(FALAS_DE_CONTEXTO);

  const conversa = ((falas ?? []) as Array<{ direction: string; body: string }>)
    .filter((f) => f.body.trim() !== "")
    .map(
      (f): TurnoDoTeste => ({
        role: f.direction === "outbound" ? "agent" : "customer",
        text: f.body,
      }),
    )
    .reverse();
  return { ok: true, conversa };
}

/**
 * GET /api/v1/conversations/[id]/agente-atual — o agente de IA da última
 * resposta automática desta conversa (`{ id, nome }`), ou `null`.
 *
 * É o que deixa o chip do cabeçalho dizer "Sofia (IA) atendendo" (pedido do
 * dono do produto em 07/10/2026: saber QUAL agente está atendendo). A regra mora
 * em `lib/inbox/agente-da-conversa.ts`; aqui só a leitura.
 *
 * Client da SESSÃO nas três consultas: a RLS de `conversations` e `messages`
 * decide se esta pessoa pode ver a conversa, e a de `ai_agents` deixa qualquer
 * membro da organização ler o agente — por isso só `id, name` (a linha inteira
 * traz prompt e configuração, que esta tela não precisa). A lista de agentes
 * (`/api/v1/ai/agents`) é de `manager`+, e quem atende é `agent`: daí a rota.
 *
 * `null` é estado normal: conversa sem resposta da IA, turno sem agente
 * resolvido, agente apagado. O chip então diz só "IA atendendo".
 *
 * Read-only ⇒ sem audit (a regra das rotas irmãs de leitura).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { agenteDaResposta, type AgenteDaConversa } from "@/lib/inbox/agente-da-conversa";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org } = authz;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  }

  const supabase = await createClient();
  const { data: conversa } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!conversa) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });

  const { data: resposta, error } = await supabase
    .from("messages")
    .select("metadata")
    .eq("organization_id", org.orgId)
    .eq("conversation_id", id)
    .eq("sent_via", "ai")
    .order("sent_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.warn("[agente-atual] última resposta da IA não carregou", {
      conversation_id: id,
      organization_id: org.orgId,
      error: error.message,
      requestId,
    });
    return ok<AgenteDaConversa | null>(null, { requestId });
  }

  const agenteId = agenteDaResposta(resposta?.metadata);
  if (!agenteId) return ok<AgenteDaConversa | null>(null, { requestId });

  const { data: agente } = await supabase
    .from("ai_agents")
    .select("id, name")
    .eq("organization_id", org.orgId)
    .eq("id", agenteId)
    .maybeSingle();
  if (!agente) return ok<AgenteDaConversa | null>(null, { requestId });

  return ok<AgenteDaConversa | null>({ id: agente.id, nome: agente.name }, { requestId });
}

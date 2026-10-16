/**
 * GET /api/v1/ai/agents/:id/runs/:callId/reply (manager+) — a resposta que esta
 * execução real enviou e a conversa que levou a ela.
 *
 * Issue #90. É o que a aba Execuções mostra antes de a pessoa escrever a
 * correção ("o agente respondeu isto — o que deveria ter dito?"). A mesma
 * leitura é refeita no servidor quando a correção é enviada
 * (`POST .../corrections`): o que a tela mostra aqui nunca é o que entra na
 * proposta, a proposta nasce da releitura mascarada.
 *
 * Só leitura: nenhuma guarda de suporte, nenhum efeito. A leitura usa o cliente
 * com a sessão da pessoa (RLS de `messages` e `llm_calls`) e, além dele, filtra a
 * organização e o agente explicitamente.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { respostaDaExecucao } from "@/lib/ai/agents/resposta-da-execucao";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string; callId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const { id, callId } = await ctx.params;
  if (!UUID_RX.test(id) || !UUID_RX.test(callId)) {
    return fail("invalid_request", "ids inválidos.", 400, { requestId });
  }

  const authz = await requireRole("manager", { requestId, resource: "ai_agents" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const lida = await respostaDaExecucao(await createClient(), {
    organizationId: authz.org.orgId,
    agentId: id,
    chamadaId: callId,
  });
  if (!lida.ok) {
    if (lida.motivo === "chamada_nao_encontrada") {
      return fail("not_found", t("Execução não encontrada neste agente."), 404, { requestId });
    }
    return fail(
      "correction_without_reply",
      t("Esta execução não terminou numa mensagem enviada pelo agente, então não há resposta para corrigir."),
      422,
      { requestId },
    );
  }
  return ok({ conversa: lida.conversa }, { requestId });
}

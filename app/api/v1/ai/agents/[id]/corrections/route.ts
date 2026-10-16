import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/ai/agents/:id/corrections (manager+) — "corrigir esta resposta".
 *
 * Issue #90 (parte da #86). A pessoa escreve o que o agente deveria ter dito, na
 * aba Teste ou na aba Execuções, e isso vira uma PROPOSTA pendente em
 * `flywheel_distiller_proposals` (tipo `response_correction`, presa a este
 * agente), com a conversa de origem já mascarada na evidência.
 *
 * ⚠️ Esta rota NÃO muda o agente. Ela só cria a linha que a aba Propostas
 * mostra; quem altera o comportamento é `POST .../proposals/:pid/apply`
 * (admin), que é o portão humano de sempre. Por isso `manager` basta aqui:
 * propor é inofensivo, aprovar é que exige o papel de quem publica.
 *
 * A organização vem da sessão, nunca do corpo (o schema é `strict` e recusa
 * `organization_id`). Na origem `execucao` a conversa NÃO vem do cliente: é
 * relida no servidor, presa à organização e ao agente — quem manda o id de uma
 * chamada de outro tenant leva 404, não a conversa dele.
 *
 * `Idempotency-Key` (uuid, TTL 24h) é aceito: clicar duas vezes no mesmo envio
 * não cria duas propostas.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { chaveDaRequisicao, comIdempotencia } from "@/lib/api/idempotency";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { correcaoSchema, montarCorrecao } from "@/lib/ai/agents/correcao-de-resposta";
import { respostaDaExecucao } from "@/lib/ai/agents/resposta-da-execucao";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENDPOINT = "POST /api/v1/ai/agents/:id/corrections";

type Ctx = { params: Promise<{ id: string }> };

/** A recusa atravessa o `comIdempotencia` como exceção — assim ela não vira recibo. */
class CorrecaoRecusada extends Error {
  constructor(
    readonly codigo: string,
    readonly texto: string,
    readonly status: number,
  ) {
    super(texto);
  }
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("manager", { requestId, resource: "flywheel_proposals" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user: authUser, org } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = correcaoSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const entrada = parsed.data;

  const chave = chaveDaRequisicao(req);
  if (chave !== null && !z.string().uuid().safeParse(chave).success) {
    return fail("validation_failed", "Idempotency-Key deve ser UUID", 400, { requestId });
  }

  const admin = createAdminClient();
  const { data: agent } = await admin
    .from("ai_agents")
    .select("id")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!agent) {
    return fail("not_found", t("Agente não encontrado nesta organização."), 404, { requestId });
  }

  async function criar(): Promise<{ proposal_id: string; status: "pending" }> {
    let conversa;
    let chamadaId: string | undefined;
    if (entrada.origem === "teste") {
      conversa = entrada.conversa;
    } else {
      const lida = await respostaDaExecucao(await createClient(), {
        organizationId: org.orgId,
        agentId: id,
        chamadaId: entrada.chamada_id,
      });
      if (!lida.ok) {
        throw lida.motivo === "chamada_nao_encontrada"
          ? new CorrecaoRecusada("not_found", t("Execução não encontrada neste agente."), 404)
          : new CorrecaoRecusada(
              "correction_without_reply",
              t("Esta execução não terminou numa mensagem enviada pelo agente, então não há resposta para corrigir."),
              422,
            );
      }
      conversa = lida.conversa;
      chamadaId = entrada.chamada_id;
    }

    const montada = montarCorrecao({
      origem: entrada.origem,
      conversa,
      textoCorrigido: entrada.texto_corrigido,
      chamadaId,
    });
    if (!montada.ok) {
      throw new CorrecaoRecusada(
        "correction_without_reply",
        t("A conversa precisa terminar numa resposta do agente para ser corrigida."),
        422,
      );
    }

    const { data: criada, error } = await admin
      .from("flywheel_distiller_proposals")
      .insert({
        organization_id: org.orgId,
        agent_id: id,
        // `run_id` agrupa as propostas de uma rodada do flywheel; uma correção é
        // uma rodada de uma proposta só.
        run_id: randomUUID(),
        dataset: "response_correction",
        type: "response_correction",
        target: "agent",
        content: montada.content,
        evidence: JSON.parse(JSON.stringify(montada.evidence)),
      })
      .select("id")
      .single();
    if (error || !criada) {
      throw new CorrecaoRecusada("internal_error", t("Não foi possível registrar a proposta."), 500);
    }

    // Sem o texto da conversa: a auditoria guarda o fato, e o conteúdo mora na proposta.
    void audit({
      action: "ai.response_correction_proposed",
      actorUserId: authUser.id,
      organizationId: org.orgId,
      resourceType: "flywheel_distiller_proposals",
      resourceId: criada.id,
      requestId,
      metadata: {
        agent_id: id,
        origem: entrada.origem,
        ...(chamadaId ? { llm_call_id: chamadaId } : {}),
      },
    });
    return { proposal_id: criada.id, status: "pending" };
  }

  try {
    if (chave === null) return ok(await criar(), { requestId, status: 201 });

    const desfecho = await comIdempotencia({
      db: await createClient(),
      organizationId: org.orgId,
      endpoint: ENDPOINT,
      chave,
      corpo: entrada,
      executar: async () => ({ resposta: await criar(), status: 201 }),
    });
    if (desfecho.tipo === "conflito") {
      return fail(
        "idempotency_conflict",
        "Esta chave de idempotência já foi usada com outro conteúdo.",
        409,
        { requestId },
      );
    }
    if (desfecho.tipo === "em_curso") {
      return fail(
        "idempotency_in_progress",
        "A mesma requisição ainda está em curso. Tente de novo em instantes.",
        409,
        { requestId },
      );
    }
    return ok(desfecho.resposta, { requestId, status: 201 });
  } catch (err) {
    if (err instanceof CorrecaoRecusada) {
      return fail(err.codigo, err.texto, err.status, { requestId });
    }
    return fail("internal_error", t("Não foi possível registrar a proposta."), 500, { requestId });
  }
}

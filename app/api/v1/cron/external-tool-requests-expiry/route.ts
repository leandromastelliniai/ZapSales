/**
 * Cron: pedido de ação externa que ficou sem decisão além do prazo (padrão 24 h) EXPIRA
 * (issue #95). O pedido vira `expired`, o aviso dele sai da Central e o agente — que lê o
 * estado dos pedidos da conversa a cada turno — passa a saber que a ação NÃO foi feita.
 *
 * Mesmo padrão de `proposal-expiry`: lógica separada do handler HTTP, ok()/fail() como
 * wrapper, e `audit()` SÓ quando houve efeito — rodada que não expirou nada não é mutação e
 * não audita. A que expirou deixa uma linha por pedido, na auditoria da organização dele.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { expirarVencidos } from "@/lib/ai/ferramentas-externas/pedidos-api";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  let expirados: Awaited<ReturnType<typeof expirarVencidos>>;
  try {
    expirados = await expirarVencidos(createAdminClient());
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[external-tool-requests-expiry] falhou", { error: detail, requestId });
    return fail("internal_error", "Failed to expire external tool requests.", 500, { requestId });
  }

  // Rodada que não expirou nada NÃO é mutação e não audita (CLAUDE.md); a que expirou, audita.
  if (expirados.length > 0) {
    for (const e of expirados) {
      void audit({
        action: "ai.external_tool_request_expired",
        organizationId: e.organization_id,
        resourceType: "agent_external_tool_request",
        resourceId: e.id,
        bypassedRls: true,
        requestId,
        metadata: { tool_id: e.tool_id, by: "cron" },
      });
    }
  }

  return ok({ expired: expirados.length }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}
export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}

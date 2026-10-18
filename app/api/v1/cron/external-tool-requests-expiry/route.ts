/**
 * Cron: pedido de ação externa que ficou sem decisão além do prazo (padrão 24 h) EXPIRA
 * (issue #95). O pedido vira `expired`, o aviso dele sai da Central e o agente — que lê o
 * estado dos pedidos da conversa a cada turno — passa a saber que a ação NÃO foi feita.
 *
 * Na mesma rodada, duas faxinas do mesmo assunto: o pedido preso em «executando» (o processo caiu
 * entre reivindicar e fechar) vira falha INCERTA com aviso, e os dados de pedido concluído há mais de 90
 * dias são apagados (LGPD: o dado pessoal que o agente preencheu não fica para sempre).
 *
 * Mesmo padrão de `proposal-expiry`: lógica separada do handler HTTP, ok()/fail() como
 * wrapper, e `audit()` SÓ quando houve efeito — rodada que não expirou nada não é mutação e
 * não audita. A que expirou deixa uma linha por pedido, na auditoria da organização dele.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import {
  abrirAvisoDeFalhaDoPedido,
  expirarVencidos,
  podarDadosAntigos,
  recuperarTravados,
} from "@/lib/ai/ferramentas-externas/pedidos-api";
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
  let travados: Awaited<ReturnType<typeof recuperarTravados>>;
  let podados: number;
  const admin = createAdminClient();
  try {
    expirados = await expirarVencidos(admin);
    travados = await recuperarTravados(admin);
    podados = await podarDadosAntigos(admin);
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

  if (travados.length > 0) {
    for (const t of travados) {
      await abrirAvisoDeFalhaDoPedido(admin, t.organization_id, {
        titulo: `A ação «${t.tool_name}» ficou sem desfecho (#${t.id.slice(0, 4)})`,
        corpo:
          `A ação «${t.tool_name}» foi aprovada, mas o sistema não registrou o desfecho (provavelmente caiu no meio). ` +
          "A ação pode ter sido feita no outro sistema — não sabemos se foi. Ela NÃO foi repetida. Confira lá antes de refazer.",
      });
      void audit({
        action: "ai.external_tool_request_executed",
        organizationId: t.organization_id,
        resourceType: "agent_external_tool_request",
        resourceId: t.id,
        bypassedRls: true,
        requestId,
        metadata: { tool_id: t.tool_id, ok: false, uncertain: true, reason: "travado", by: "cron" },
      });
    }
  }
  if (podados > 0) {
    void audit({
      action: "ai.external_tool_request_pruned",
      organizationId: null,
      bypassedRls: true,
      requestId,
      metadata: { pruned: podados },
    });
  }

  return ok({ expired: expirados.length, recovered: travados.length }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}
export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}

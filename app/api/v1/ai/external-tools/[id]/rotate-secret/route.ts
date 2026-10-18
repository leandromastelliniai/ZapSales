import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/ai/external-tools/:id/rotate-secret (manager+) — gera uma chave de
 * assinatura NOVA para a ferramenta. A chave nova volta em claro UMA vez, nesta
 * resposta; a antiga deixa de valer na hora (o receptor precisa ser atualizado).
 *
 * É também o caminho de quem perdeu a chave: ela nunca é lida de volta depois da criação.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { buscarFerramenta, rotacionarChave } from "@/lib/ai/ferramentas-externas/repositorio";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const authz = await requireRole("manager", { requestId, resource: "ai_external_tools" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  try {
    const admin = createAdminClient();
    // Ferramenta de servidor MCP não tem chave de assinatura: a credencial é do SERVIDOR (tela do servidor).
    const atual = await buscarFerramenta(admin, org.orgId, id);
    if (atual?.mcp) {
      return fail(
        "not_applicable",
        t("Esta ferramenta vem de um servidor MCP e não tem chave de assinatura. A credencial se troca na tela do servidor."),
        422,
        { requestId },
      );
    }
    const r = await rotacionarChave(admin, { organizationId: org.orgId, id, atorId: user.id });
    if (!r.ok) {
      return r.erro === "nao_encontrada"
        ? fail("not_found", t("Ferramenta não encontrada."), 404, { requestId })
        : fail(
            "encryption_unavailable",
            t("Não consigo guardar a chave de assinatura com segurança: a cifra do servidor não está configurada. Peça a quem instalou o sistema para conferir."),
            422,
            { requestId },
          );
    }
    void audit({
      action: "ai.external_tool_secret_rotated",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "agent_external_tool",
      resourceId: id,
      requestId,
      // O fato, nunca a chave — nem os 4 últimos caracteres.
      metadata: { slug: r.ferramenta.slug },
    });
    return ok({ ...r.ferramenta, signing_secret: r.chave }, { requestId });
  } catch {
    return fail("internal_error", t("Não foi possível gerar a nova chave."), 500, { requestId });
  }
}

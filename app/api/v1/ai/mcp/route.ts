import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * O INTERRUPTOR DOS SERVIDORES MCP da organização (Agente de IA › Ferramentas externas ›
 * Servidores MCP) — issue #96.
 *
 *   GET — o estado: ligado?, quem aceitou e quando, quantos servidores e quantas ferramentas
 *         estão cadastrados. Manager (para a tela dizer «peça a um administrador»).
 *   PUT — liga ou desliga. Admin. Ligar exige o aceite do administrador (o agente passa a poder
 *         enviar dados da conversa a servidores de terceiros); a rota confere, e não só a tela.
 *
 * O recurso nasce DESLIGADO e a instalação inteira segue útil sem ele. Desligar não apaga nada:
 * servidores, credencial cifrada e ferramentas escolhidas ficam; as ferramentas somem do atendimento
 * e uma aprovação pendente não executa. A organização vem da sessão, nunca do corpo.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { gravarConfigDeMcp, lerConfigDeMcpDaOrganizacao } from "@/lib/ai/ferramentas-externas/mcp/config";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const putSchema = z
  .object({
    ligado: z.boolean().optional(),
    /** O administrador marcou o aceite nesta chamada. */
    aceitar: z.literal(true).optional(),
  })
  .strict()
  .refine((corpo) => Object.keys(corpo).length > 0, { message: "Nada para alterar." });

async function contar(admin: ReturnType<typeof createAdminClient>, orgId: string) {
  const [servidores, ferramentas] = await Promise.all([
    admin.from("mcp_servers").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    admin
      .from("agent_external_tools")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("kind", "mcp")
      .eq("active", true),
  ]);
  return { servidores: servidores.count ?? 0, ferramentas: ferramentas.count ?? 0 };
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "ai_mcp" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  try {
    const admin = createAdminClient();
    const config = await lerConfigDeMcpDaOrganizacao(admin, authz.org.orgId);
    if (!config) return fail("internal_error", t("Não consegui ler a configuração dos servidores MCP."), 500, { requestId });
    const total = await contar(admin, authz.org.orgId);
    return ok(
      {
        ligado: config.ligado,
        aceite: config.aceite,
        servidores: total.servidores,
        ferramentas_ativas: total.ferramentas,
      },
      { requestId },
    );
  } catch {
    return fail("internal_error", t("Não consegui ler a configuração dos servidores MCP."), 500, { requestId });
  }
}

export async function PUT(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "ai_mcp" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = putSchema.safeParse(bruto);
  if (!parsed.success) {
    return fail("validation_failed", t("Diga se quer ligar ou desligar os servidores MCP."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  try {
    const admin = createAdminClient();
    const atual = await lerConfigDeMcpDaOrganizacao(admin, org.orgId);
    if (!atual) return fail("internal_error", t("Não consegui ler a configuração dos servidores MCP."), 500, { requestId });

    // Ligar exige o aceite — o gravado antes, ou o que chega agora. A tela marca; a rota confere.
    if (parsed.data.ligado === true && atual.aceite === null && parsed.data.aceitar !== true) {
      return fail(
        "validation_failed",
        t("Para ligar, confirme que concorda que o agente envie dados da conversa a servidores de terceiros que você cadastrar."),
        422,
        { requestId, details: { motivo: "sem_aceite" } },
      );
    }

    const gravado = await gravarConfigDeMcp({
      admin,
      orgId: org.orgId,
      actorUserId: user.id,
      mudanca: parsed.data,
    });
    if (!gravado.ok) {
      return fail("internal_error", t("Não foi possível salvar a configuração dos servidores MCP."), 500, { requestId });
    }

    void audit({
      action: "ai.mcp_switch_changed",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "organization",
      resourceId: org.orgId,
      requestId,
      metadata: {
        ligado: gravado.config.ligado,
        mudou: atual.ligado !== gravado.config.ligado,
        aceite_novo: parsed.data.aceitar === true,
      },
    });
    const total = await contar(admin, org.orgId);
    return ok(
      {
        ligado: gravado.config.ligado,
        aceite: gravado.config.aceite,
        servidores: total.servidores,
        ferramentas_ativas: total.ferramentas,
      },
      { requestId },
    );
  } catch {
    return fail("internal_error", t("Não foi possível salvar a configuração dos servidores MCP."), 500, { requestId });
  }
}

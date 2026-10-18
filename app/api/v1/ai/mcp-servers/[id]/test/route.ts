import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/ai/mcp-servers/:id/test (admin) — o botão «Testar conexão».
 *
 * Apresenta-se ao servidor, lista as ferramentas e guarda o resultado. A resposta é sempre 200 com
 * `ok: true|false` e a causa em português: o servidor que não responde é resultado do teste, não
 * falha da rota. Só com o recurso LIGADO — com ele desligado nenhuma chamada sai para fora.
 *
 * Não grava credencial nem devolve nada que o servidor mandou além do nome, da versão e de quantas
 * ferramentas oferece. A auditoria registra o fato e o motivo, nunca o conteúdo.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { conectarAoServidor } from "@/lib/ai/ferramentas-externas/mcp/conexao";
import { recusaSeMcpDesligado } from "@/lib/ai/ferramentas-externas/mcp/rotas";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<Response> {
  // Não grava dado de negócio, mas dispara uma chamada para fora em nome da organização (e grava o
  // resultado do teste): suporte temporário não faz isso por ela.
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const authz = await requireRole("admin", { requestId, resource: "ai_mcp_servers" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  const admin = createAdminClient();
  try {
    const desligado = await recusaSeMcpDesligado(admin, org.orgId, t, requestId);
    if (desligado) return desligado;

    const conexao = await conectarAoServidor(admin, org.orgId, id);
    if (!conexao.ok && conexao.motivo === "servidor_nao_encontrado") {
      return fail("not_found", t("Servidor não encontrado."), 404, { requestId });
    }
    void audit({
      action: "ai.mcp_server_tested",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "mcp_server",
      resourceId: id,
      requestId,
      metadata: conexao.ok
        ? { ok: true, tools_offered: conexao.ferramentas.length, phase: "test" }
        : { ok: false, reason: conexao.motivo, http_status: conexao.httpStatus, phase: "test" },
    });
    if (conexao.ok) {
      return ok(
        {
          ok: true as const,
          server: { name: conexao.servidor.nome, version: conexao.servidor.versao, protocol: conexao.servidor.protocolo },
          tools_offered: conexao.ferramentas.length,
          list_incomplete: conexao.listaIncompleta,
        },
        { requestId },
      );
    }
    return ok(
      { ok: false as const, reason: conexao.motivo, http_status: conexao.httpStatus, message: t(conexao.frase) },
      { requestId },
    );
  } catch {
    return fail("internal_error", t("Não foi possível testar o servidor."), 500, { requestId });
  }
}

import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * UM SERVIDOR MCP (issue #96).
 *
 *   GET    — o servidor, sem a credencial. Admin.
 *   PATCH  — edita nome, endereço, cabeçalho, troca ou remove a credencial, liga e desliga (`ativo`).
 *            Trocar endereço, cabeçalho ou credencial zera o último teste (ele falava de OUTRA coisa).
 *            Admin.
 *   DELETE — apaga, e só se nenhuma versão de agente cita uma ferramenta dele (histórico imutável);
 *            quem já foi usado se DESATIVA. Apagar leva as ferramentas escolhidas junto. Admin.
 *
 * A organização vem da sessão. Id de outra organização é 404 (nunca 403: não confirma que existe).
 * A credencial NUNCA volta — nem aqui nem em nenhuma outra resposta.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { editarServidorSchema } from "@/lib/ai/ferramentas-externas/mcp/esquema-api";
import {
  apagarServidor,
  buscarServidor,
  camposAlteradosDoServidor,
  editarServidor,
} from "@/lib/ai/ferramentas-externas/mcp/repositorio";
import { fraseDaRecusaDeEndereco } from "@/lib/ai/ferramentas-externas/tipos";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { motivoDaRecusaDeDestino } from "@/lib/automation/destinos-internos-autorizados";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const authz = await requireRole("admin", { requestId, resource: "ai_mcp_servers" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  try {
    const servidor = await buscarServidor(createAdminClient(), authz.org.orgId, id);
    if (!servidor) return fail("not_found", t("Servidor não encontrado."), 404, { requestId });
    return ok(servidor, { requestId });
  } catch {
    return fail("internal_error", t("Não consegui ler o servidor."), 500, { requestId });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const authz = await requireRole("admin", { requestId, resource: "ai_mcp_servers" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = editarServidorSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Confira os campos do servidor: algum valor está fora do permitido."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const patch = parsed.data;

  if (patch.url !== undefined) {
    const recusa = await motivoDaRecusaDeDestino(patch.url, "organizacao");
    if (recusa) {
      return fail("validation_failed", t(fraseDaRecusaDeEndereco(recusa)), 422, { requestId, details: { url: recusa } });
    }
  }

  try {
    const r = await editarServidor(createAdminClient(), { organizationId: org.orgId, id, atorId: user.id, patch });
    if (!r.ok) {
      if (r.erro === "nao_encontrado") return fail("not_found", t("Servidor não encontrado."), 404, { requestId });
      if (r.erro === "nome_em_uso") {
        return fail("name_in_use", t("Já existe um servidor com este nome. Escolha outro."), 409, { requestId });
      }
      if (r.erro === "cifra_indisponivel") {
        return fail(
          "encryption_unavailable",
          t("Não consigo guardar a credencial com segurança: a cifra do servidor não está configurada. Peça a quem instalou o sistema para conferir."),
          422,
          { requestId },
        );
      }
      return fail("internal_error", t("Não foi possível salvar o servidor."), 500, { requestId });
    }
    void audit({
      action: "ai.mcp_server_updated",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "mcp_server",
      resourceId: id,
      requestId,
      // Os NOMES dos campos que mudaram — nunca os valores (o endereço e a credencial podem levar segredo).
      metadata: {
        fields: camposAlteradosDoServidor(patch),
        ...(patch.ativo !== undefined ? { active: patch.ativo } : {}),
        ...(patch.credencial === null ? { credential_removed: true } : {}),
        ...(typeof patch.credencial === "string" ? { credential_replaced: true } : {}),
      },
    });
    return ok(r.servidor, { requestId });
  } catch {
    return fail("internal_error", t("Não foi possível salvar o servidor."), 500, { requestId });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<Response> {
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
    const antes = await buscarServidor(admin, org.orgId, id);
    if (!antes) return fail("not_found", t("Servidor não encontrado."), 404, { requestId });
    const resultado = await apagarServidor(admin, org.orgId, id);
    if (resultado === "em_uso") {
      return fail(
        "mcp_server_in_use",
        t("Uma ferramenta deste servidor já faz parte de uma versão de agente e o histórico precisa dela. Desative o servidor em vez de apagar."),
        409,
        { requestId },
      );
    }
    if (resultado === "nao_encontrado") return fail("not_found", t("Servidor não encontrado."), 404, { requestId });
    void audit({
      action: "ai.mcp_server_deleted",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "mcp_server",
      resourceId: id,
      requestId,
      metadata: { host: new URL(antes.url).host, tools_removed: antes.tools_enabled },
    });
    return ok({ id, deleted: true }, { requestId });
  } catch {
    return fail("internal_error", t("Não foi possível apagar o servidor."), 500, { requestId });
  }
}

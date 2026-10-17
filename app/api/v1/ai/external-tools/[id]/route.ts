import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * UMA FERRAMENTA EXTERNA (issue #94).
 *
 *   GET    — a ferramenta, sem a chave. Manager.
 *   PATCH  — edita nome, "quando usar", endereço e campos; liga e desliga (`ativa`). Manager.
 *   DELETE — apaga, e só se nenhuma versão de agente a cita (histórico imutável); quem já
 *            foi usada se DESATIVA. Manager.
 *
 * A organização vem da sessão. Id de outra organização é 404 (nunca 403: não confirma que
 * existe). O identificador que o modelo vê (`ext_<slug>`) NÃO muda quando o nome muda.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { editarFerramentaSchema } from "@/lib/ai/ferramentas-externas/esquema";
import {
  apagarFerramenta,
  buscarFerramenta,
  camposAlterados,
  editarFerramenta,
} from "@/lib/ai/ferramentas-externas/repositorio";
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
  const authz = await requireRole("manager", { requestId, resource: "ai_external_tools" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  try {
    const ferramenta = await buscarFerramenta(createAdminClient(), authz.org.orgId, id);
    if (!ferramenta) return fail("not_found", t("Ferramenta não encontrada."), 404, { requestId });
    return ok(ferramenta, { requestId });
  } catch {
    return fail("internal_error", t("Não consegui ler a ferramenta."), 500, { requestId });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const authz = await requireRole("manager", { requestId, resource: "ai_external_tools" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = editarFerramentaSchema.safeParse(raw);
  if (!parsed.success) {
    const altera = parsed.error.issues.find((i) => i.path[0] === "efeito");
    if (altera) return fail("external_tool_mutating_blocked", t(altera.message), 422, { requestId });
    return fail("validation_failed", t("Confira os campos da ferramenta: algum valor está fora do permitido."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const patch = parsed.data;

  if (patch.url !== undefined) {
    const recusa = await motivoDaRecusaDeDestino(patch.url, "organizacao");
    if (recusa) {
      return fail(
        "validation_failed",
        t("Este endereço não pode ser usado: endereços da rede interna, privada ou local são recusados por segurança."),
        422,
        { requestId, details: { url: recusa } },
      );
    }
  }

  const admin = createAdminClient();
  try {
    const ferramenta = await editarFerramenta(admin, { organizationId: org.orgId, id, atorId: user.id, patch });
    if (!ferramenta) return fail("not_found", t("Ferramenta não encontrada."), 404, { requestId });
    void audit({
      action: "ai.external_tool_updated",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "agent_external_tool",
      resourceId: id,
      requestId,
      // Os NOMES dos campos que mudaram — nunca os valores (o endereço pode levar um token).
      metadata: { slug: ferramenta.slug, fields: camposAlterados(patch), ...(patch.ativa !== undefined ? { active: patch.ativa } : {}) },
    });
    return ok(ferramenta, { requestId });
  } catch {
    return fail("internal_error", t("Não foi possível salvar a ferramenta."), 500, { requestId });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const authz = await requireRole("manager", { requestId, resource: "ai_external_tools" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  const admin = createAdminClient();
  try {
    const antes = await buscarFerramenta(admin, org.orgId, id);
    if (!antes) return fail("not_found", t("Ferramenta não encontrada."), 404, { requestId });
    const resultado = await apagarFerramenta(admin, org.orgId, id);
    if (resultado === "em_uso") {
      return fail(
        "external_tool_in_use",
        t("Esta ferramenta já faz parte de uma versão de agente e o histórico precisa dela. Desative em vez de apagar."),
        409,
        { requestId },
      );
    }
    if (resultado === "nao_encontrada") return fail("not_found", t("Ferramenta não encontrada."), 404, { requestId });
    void audit({
      action: "ai.external_tool_deleted",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "agent_external_tool",
      resourceId: id,
      requestId,
      metadata: { slug: antes.slug },
    });
    return ok({ id, deleted: true }, { requestId });
  } catch {
    return fail("internal_error", t("Não foi possível apagar a ferramenta."), 500, { requestId });
  }
}

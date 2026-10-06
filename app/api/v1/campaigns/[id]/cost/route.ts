/**
 * GET /api/v1/campaigns/:id/cost — quanto a campanha vai custar e quanto custou.
 *
 * Antes do disparo, a estimativa pela tabela de preços para o público congelado;
 * depois, o custo da Meta registrado (real pelo webhook, estimado onde ele ainda
 * não chegou), o custo de IA, o custo por lead que respondeu e as conversas que
 * vieram de anúncio. Os números moram em `lib/custo/relatorio.ts`.
 *
 * Admin client com filtro explícito: a organização vem do papel conferido, nunca
 * do pedido, e o relatório soma tabelas que o papel `authenticated` não lê
 * (`llm_calls` por contato, a tabela de preços da instalação).
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { relatorioDeCusto } from "@/lib/custo/relatorio";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;

  const relatorio = await relatorioDeCusto(createAdminClient(), authz.org.orgId, id);
  if (!relatorio) return fail("campanha_nao_encontrada", t("Campanha não encontrada."), 404, { requestId });
  return ok(relatorio, { requestId });
}

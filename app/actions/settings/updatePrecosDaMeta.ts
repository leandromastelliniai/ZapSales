"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { escritaDeAdminOuRecusa } from "@/lib/auth/escritaDeAdminOuRecusa";
import type { RecusaDeEscritaDeAdmin } from "@/lib/auth/recusa-de-escrita-de-admin";
import { carregarCotacao } from "@/lib/custo/cotacao";
import { carregarTabela, gravarTabela, linhaDePrecoSchema } from "@/lib/custo/tabela-de-precos";
import { createAdminClient } from "@/lib/supabase/admin";

export type UpdatePrecosDaMetaResult =
  | { ok: true }
  | { ok: false; error: "invalid_input" | "duplicada" | "write_failed" }
  | RecusaDeEscritaDeAdmin;

/**
 * A tabela de preços da Meta e a cotação do dólar da INSTALAÇÃO (issue #10).
 *
 * ── Por que `is_platform_admin` ─────────────────────────────────────────────
 *
 * O preço da Meta é o mesmo para todas as organizações da instalação, e é ele
 * que move o teto de gasto de cada uma: o administrador de uma empresa baixar o
 * preço furaria o teto das outras. Mesmo gate de `updateDestinosInternos.ts`.
 *
 * ── Por que auditar ────────────────────────────────────────────────────────
 *
 * "Desde quando a estimativa usa este preço?" só tem resposta aqui — o custo já
 * registrado copia o preço do momento, mas a estimativa não guarda de onde veio.
 * A linha leva a tabela anterior e a nova.
 */
const entradaSchema = z.object({
  linhas: z.array(linhaDePrecoSchema).max(500),
  cotacao_usd_brl: z.number().positive().max(1000).nullable(),
});

export async function updatePrecosDaMeta(
  input: z.input<typeof entradaSchema>,
): Promise<UpdatePrecosDaMetaResult> {
  const escrita = await escritaDeAdminOuRecusa();
  if (!escrita.ok) return escrita;
  const { user } = escrita.ctx;

  const parsed = entradaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { linhas, cotacao_usd_brl } = parsed.data;
  const chaves = new Set(linhas.map((l) => `${l.country}:${l.category}`));
  if (chaves.size !== linhas.length) return { ok: false, error: "duplicada" };

  const admin = createAdminClient();
  const [anterior, cotacaoAnterior] = await Promise.all([carregarTabela(admin), carregarCotacao(admin)]);
  if (!(await gravarTabela(admin, linhas, user.id))) return { ok: false, error: "write_failed" };
  const { error } = await admin
    .from("platform_settings")
    .upsert({ id: 1, cotacao_usd_brl, updated_by: user.id }, { onConflict: "id" });
  if (error) return { ok: false, error: "write_failed" };

  const hdrs = await headers();
  await audit({
    action: "platform.meta_pricing_updated",
    actorUserId: user.id,
    resourceType: "meta_pricing_rates",
    metadata: {
      de: anterior,
      para: linhas,
      cotacao_de: cotacaoAnterior.referencia ? null : cotacaoAnterior.valor,
      cotacao_para: cotacao_usd_brl,
    },
    requestId: hdrs.get("x-request-id"),
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: hdrs.get("user-agent"),
  });

  revalidatePath("/admin/precos-da-meta");
  return { ok: true };
}

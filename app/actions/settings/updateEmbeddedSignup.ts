"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { escritaDeAdminOuRecusa } from "@/lib/auth/escritaDeAdminOuRecusa";
import { createAdminClient } from "@/lib/supabase/admin";

export type UpdateEmbeddedSignupResult = { ok: true } | { ok: false; error: string; details?: unknown };

/**
 * A CHAVE do "Conectar com Facebook" (Embedded Signup v4) desta instalação —
 * issue #5.
 *
 * ── Por que desligada por padrão ─────────────────────────────────────────────
 * Oferecer o botão às empresas exige um app Tech Provider aprovado pela Meta.
 * Antes disso o fluxo abre o login da Meta e morre — por isso a coluna nasce
 * `false` (0536) e só quem administra a INSTALAÇÃO a liga, como as outras
 * credenciais do app (`updateMetaApp.ts`, mesmo gate e mesmo motivo: o app é um
 * só para todas as empresas da VPS).
 *
 * ── O que se grava ───────────────────────────────────────────────────────────
 * Só os ids PÚBLICOS: o `app_id` e o `config_id` da configuração de login (o SDK
 * da Meta os exige no navegador). O App Secret, que troca o código pelo token,
 * é o mesmo já cadastrado nesta tela — ligar sem ele é recusado, porque o botão
 * apareceria e quebraria na troca.
 */
const entradaSchema = z
  .object({
    ligado: z.boolean(),
    /** Ids da Meta são numéricos; vazio = manter o que está gravado. */
    app_id: z.string().trim().regex(/^\d{5,32}$/).optional().or(z.literal("")),
    config_id: z.string().trim().regex(/^\d{5,32}$/).optional().or(z.literal("")),
  })
  .strict();

export type EmbeddedSignupInput = z.infer<typeof entradaSchema>;

export async function updateEmbeddedSignup(input: EmbeddedSignupInput): Promise<UpdateEmbeddedSignupResult> {
  const escrita = await escritaDeAdminOuRecusa();
  if (!escrita.ok) return escrita;
  const { user: authUser } = escrita.ctx;

  const parsed = entradaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input", details: parsed.error.flatten() };

  const admin = createAdminClient();
  const { data, error: erroLeitura } = await admin
    .from("platform_meta_app")
    .select("app_id, embedded_signup_config_id, app_secret_encrypted")
    .eq("id", 1)
    .maybeSingle();
  if (erroLeitura) return { ok: false, error: "leitura_do_app_falhou", details: { codigo: erroLeitura.code } };
  const gravado = data as {
    app_id: string | null;
    embedded_signup_config_id: string | null;
    app_secret_encrypted: string | null;
  } | null;

  const appId = parsed.data.app_id || gravado?.app_id || null;
  const configId = parsed.data.config_id || gravado?.embedded_signup_config_id || null;

  if (parsed.data.ligado) {
    if (!appId || !configId) return { ok: false, error: "ids_obrigatorios" };
    // O segredo da tela OU o do `.env` (piso): sem nenhum, a troca do código falha.
    const temSegredo = Boolean(gravado?.app_secret_encrypted) || Boolean(process.env.META_APP_SECRET?.trim());
    if (!temSegredo) return { ok: false, error: "app_secret_obrigatorio" };
  }

  const { error } = await admin.from("platform_meta_app").upsert(
    {
      id: 1,
      app_id: appId,
      embedded_signup_config_id: configId,
      embedded_signup_ligado: parsed.data.ligado,
      updated_by: authUser.id,
    },
    { onConflict: "id" },
  );
  if (error) return { ok: false, error: error.message };

  const cabecalhos = await headers();
  await audit({
    action: "platform_meta_app.embedded_signup_updated",
    actorUserId: authUser.id,
    // Da instalação, não de um tenant — mesma decisão de `updateMetaApp.ts`.
    resourceType: "platform_meta_app",
    resourceId: null,
    requestId: cabecalhos.get("x-request-id") ?? undefined,
    ip: cabecalhos.get("x-forwarded-for") ?? undefined,
    userAgent: cabecalhos.get("user-agent") ?? undefined,
    actingAsPlatformAdmin: true,
    metadata: { ligado: parsed.data.ligado, app_id: appId, config_id: configId },
  });

  return { ok: true };
}

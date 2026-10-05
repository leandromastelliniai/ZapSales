/**
 * POST /api/v1/channels/official/embedded-signup — a volta do "Conectar com
 * Facebook" (Embedded Signup v4, issue #5).
 *
 * O navegador manda o CÓDIGO que a janela da Meta devolveu e os ids que ela
 * anunciou por `postMessage` (WABA e número). Aqui, no servidor: a chave da
 * instalação é conferida, o código é trocado pelo token de negócio com o App
 * Secret da instalação (que nunca sai daqui), e a conexão segue o MESMO caminho
 * do assistente (`conectarNumeroOficial`): validar, registrar com o PIN, gravar
 * cifrado, webhook.
 *
 * Os ids do corpo NÃO são confiados: a validação pergunta à Graph, com o token
 * que a própria Meta acabou de emitir, se o número responde e pertence à WABA.
 *
 * Com a chave desligada a rota responde 404 — o recurso não existe nesta
 * instalação, do mesmo jeito que o botão não aparece.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { appDaMeta } from "@/lib/channels/meta/app";
import { conectarNumeroOficial } from "@/lib/channels/meta/conectar-numero";
import { configDoEmbeddedSignup, trocarCodigoDoEmbeddedSignup } from "@/lib/channels/meta/embedded-signup";
import { usoDoNumeroSchema } from "@/lib/channels/uso";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { basePublicaDoWebhookMeta } from "@/lib/webhooks/url-publica";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const idDaMeta = z.string().trim().regex(/^\d{5,32}$/);

const corpoSchema = z.object({
  code: z.string().trim().min(10).max(2000),
  waba_id: idDaMeta,
  phone_number_id: idDaMeta,
  pin: z.string().regex(/^\d{6}$/),
  uso: usoDoNumeroSchema,
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_official" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const config = await configDoEmbeddedSignup();
  const { appSecret } = await appDaMeta();
  if (!config || !appSecret) {
    return fail("not_found", t("O Conectar com Facebook não está ligado nesta instalação."), 404, { requestId });
  }

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("invalid_request", t("A Meta não devolveu o número escolhido. Tente conectar de novo."), 422, {
      requestId,
    });
  }
  const d = parsed.data;

  const troca = await trocarCodigoDoEmbeddedSignup({ code: d.code, appId: config.appId, appSecret });
  if (!troca.ok) {
    return fail(
      "invalid_request",
      `${t("A Meta recusou a autorização — o código vale só 30 segundos. Tente conectar de novo.")} (${troca.motivo})`,
      422,
      { requestId, details: { etapa: "codigo" } },
    );
  }

  const resultado = await conectarNumeroOficial({
    admin: createAdminClient(),
    organizationId: authz.org.orgId,
    userId: authz.user.id,
    requestId,
    base: basePublicaDoWebhookMeta(req),
    origem: "embedded_signup",
    // Sem App Secret próprio: o número fica no app da INSTALAÇÃO, que é o app
    // Tech Provider que fez o Embedded Signup.
    entrada: {
      phoneNumberId: d.phone_number_id,
      wabaId: d.waba_id,
      token: troca.token,
      messagingAccountId: null,
      pin: d.pin,
      uso: d.uso,
      limparAppProprio: true,
    },
  });
  if (!resultado.ok) {
    return fail(resultado.code, t(resultado.mensagem), resultado.status, {
      requestId,
      details: { etapa: resultado.etapa },
    });
  }

  return ok(
    {
      connected: true,
      channel_session_id: resultado.channelSessionId,
      displayName: resultado.displayName,
      phoneNumber: resultado.phoneNumber,
      webhookRegistro: resultado.webhookRegistro,
      numeroRegistrado: resultado.numeroRegistrado,
    },
    { requestId },
  );
}

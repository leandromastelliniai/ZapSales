/**
 * POST /api/v1/channels/official/assistente — o primeiro passo do assistente de
 * conexão (issue #5): testa o token do System User (e o App Secret, se veio) e
 * devolve o que a pessoa precisa para escolher o número.
 *
 * NÃO grava nada. É POST, e não GET, porque o corpo leva o token e o segredo — e
 * credencial não viaja em URL (vai para histórico, log e `Referer`).
 *
 * O que volta: os problemas que impedem conectar, cada um com a frase do que
 * fazer (token expirado, sem permissão, app em desenvolvimento, segredo de outro
 * app…); os avisos que não impedem; e as contas com os números e o checklist da
 * Meta. Quem fala com a Graph é `lib/channels/meta/conexao-guiada.ts`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { diagnosticarCredencial } from "@/lib/channels/meta/conexao-guiada";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpoSchema = z.object({
  token: z.string().trim().min(20).max(1000),
  app_secret: z.string().trim().min(16).max(300).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Sem efeito no banco, mas é a porta que leva credencial à Meta em nome da
  // organização: o acompanhamento só-leitura não a usa.
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_official" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("invalid_request", t("Cole o token de acesso do usuário do sistema."), 422, { requestId });
  }

  const d = await diagnosticarCredencial({ token: parsed.data.token, appSecret: parsed.data.app_secret ?? null });

  return ok(
    {
      ...d,
      problemas: d.problemas.map((p) => ({ ...p, mensagem: t(p.mensagem) })),
      avisos: d.avisos.map((a) => ({ ...a, mensagem: t(a.mensagem) })),
      contas: d.contas.map((c) => ({
        ...c,
        checklist: c.checklist.map((i) => ({ ...i, mensagem: t(i.mensagem) })),
      })),
    },
    { requestId },
  );
}

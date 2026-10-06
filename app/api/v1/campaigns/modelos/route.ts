/**
 * GET /api/v1/campaigns/modelos?channel_session_id=… — os modelos aprovados que
 * uma campanha OFICIAL pode enviar por aquele número (issue #8), com as
 * variáveis de cada um.
 *
 * A lista de `/api/v1/channels/templates` não serve: pede `admin` (campanha é
 * operada por `manager`) e traz o que a campanha não consegue mandar. A regra do
 * que entra mora em `lib/campanhas/modelos-da-campanha.ts`; aqui só se escolhe
 * a CONTA: o modelo é da WABA, e a Meta recusa o envio por número de outra.
 *
 * Número que não é do canal oficial devolve lista vazia — a tela mostra o campo
 * de texto livre.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { modelosParaCampanha } from "@/lib/campanhas/modelos-da-campanha";
import { CHANNEL_PROVIDER_META } from "@/lib/channels/capabilities";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const consultaSchema = z.object({ channel_session_id: z.string().uuid() });

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = consultaSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
  if (!parsed.success) {
    return fail("validation_failed", t("Escolha o número da campanha."), 422, { requestId });
  }

  const supabase = await createClient();
  const { data: canal } = await supabase
    .from("channel_sessions")
    .select("provider, meta_waba_id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", parsed.data.channel_session_id)
    .maybeSingle();
  const conexao = canal as { provider?: string; meta_waba_id?: string | null } | null;
  if (!conexao) {
    return fail("campanha_canal_indisponivel", t("Escolha uma conexão de WhatsApp desta organização."), 404, {
      requestId,
    });
  }
  if (conexao.provider !== CHANNEL_PROVIDER_META || !conexao.meta_waba_id) {
    return ok({ oficial: false, modelos: [] }, { requestId });
  }

  const { data, error } = await supabase
    .from("meta_templates")
    .select("id, waba_id, name, language, status, category, parameter_format, components")
    .eq("organization_id", authz.org.orgId)
    .eq("waba_id", conexao.meta_waba_id)
    .order("name", { ascending: true });
  if (error) return fail("internal_error", error.message, 500, { requestId });

  return ok(
    { oficial: true, modelos: modelosParaCampanha((data ?? []) as Parameters<typeof modelosParaCampanha>[0]) },
    { requestId },
  );
}

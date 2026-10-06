/**
 * GET /api/v1/campaigns/atendimento-gratis — o contador das 1.000 mensagens de
 * atendimento grátis do mês, por número oficial (issue #10).
 *
 * O mês é o do fuso da conta (o do número, senão o da organização). Quem decide
 * se uma mensagem foi grátis é a Meta, pelo webhook; aqui só se conta, para o
 * gestor ver antes da fatura. O aviso de 80% e 100% vai para a Central.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { CHANNEL_PROVIDER_META } from "@/lib/channels/capabilities";
import { contadorDoAtendimentoGratis } from "@/lib/custo/registro";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("channel_sessions")
    .select("id, display_name, phone_number")
    .eq("organization_id", authz.org.orgId)
    .eq("provider", CHANNEL_PROVIDER_META)
    .order("created_at", { ascending: true });
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const agora = new Date();
  const numeros = await Promise.all(
    ((data ?? []) as Array<{ id: string; display_name: string | null; phone_number: string | null }>).map(
      async (n) => ({
        ...(await contadorDoAtendimentoGratis(admin, authz.org.orgId, n.id, agora)),
        // Crus: o rótulo do número é montado na tela, por `channelLabel`.
        display_name: n.display_name,
        phone_number: n.phone_number,
      }),
    ),
  );
  return ok({ numeros }, { requestId });
}

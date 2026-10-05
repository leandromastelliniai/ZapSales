/**
 * PATCH /api/v1/channel-sessions/[id]/uso — o administrador declara para que
 * serve o número: `atendimento`, `campanha` ou `ambos` (issue #5).
 *
 * Vale para qualquer provedor: a declaração é da CONEXÃO, não do transporte, e é
 * ela que o motor de campanhas lê para orientar quem dispara. O assistente de
 * conexão oficial grava a primeira declaração junto da conexão; esta rota é a
 * troca posterior, sem pedir credencial de novo.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { usoDoNumeroSchema } from "@/lib/channels/uso";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

const corpoSchema = z.object({ uso: usoDoNumeroSchema });

export async function PATCH(req: NextRequest, { params }: Context): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("admin", { requestId, resource: "channel_sessions" });
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail("validation_failed", "Canal inválido.", 422, { requestId });

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Uso deve ser atendimento, campanha ou ambos.", 422, { requestId });
  }
  const { uso } = parsed.data;

  // `organization_id` À MÃO: o admin client ignora RLS. Canal arquivado não muda
  // de uso — ele não opera mais, e a declaração dele não orienta ninguém.
  const { data, error } = await createAdminClient()
    .from("channel_sessions")
    .update({ uso_declarado: uso })
    .eq("organization_id", auth.org.orgId)
    .eq("id", id)
    .is("archived_at", null)
    .select("id");
  if (error) {
    return fail("internal_error", "Não foi possível salvar o uso do número. Verifique se o banco está atualizado.", 500, {
      requestId,
    });
  }
  if (!data || data.length === 0) return fail("not_found", "Canal não encontrado.", 404, { requestId });

  void audit({
    action: "channel.usage_declared",
    actorUserId: auth.user.id,
    organizationId: auth.org.orgId,
    resourceType: "channel_session",
    resourceId: id,
    requestId,
    metadata: { uso },
  });
  return ok({ id, uso }, { requestId });
}

/**
 * GET /api/v1/conversations/[id]/campanha — a campanha e o modelo de origem
 * desta conversa (issue #11), ou `null`.
 *
 * Quem abre a conversa precisa saber que a pessoa está respondendo a uma
 * campanha ANTES de digitar: "quero" é uma frase sem sentido sem a oferta que a
 * provocou.
 *
 * ═══ Dois clients, e por quê ═══
 *
 * A EXISTÊNCIA da conversa é conferida com o client da SESSÃO: é a RLS de
 * `conversations` que decide se esta pessoa pode abri-la. Só depois o admin lê
 * a campanha — a RLS de `campaigns` é de `manager`+, e o atendente que abre a
 * conversa (`agent`) precisa ver o nome da campanha que ela responde. O admin
 * lê só nome e modelo, sempre com `organization_id` da sessão, nunca do pedido.
 *
 * Read-only ⇒ sem audit (a regra das rotas irmãs de leitura).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import type { CampanhaDaConversa } from "@/lib/campanhas/origem-do-lead";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org } = authz;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  }

  const supabase = await createClient();
  const { data: conversa } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!conversa) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });

  const admin = createAdminClient();
  const { data: destinatario, error } = await admin
    .from("campaign_recipients")
    .select("sent_at, replied_at, campaigns(id, name, meta_template_id)")
    .eq("organization_id", org.orgId)
    .eq("conversation_id", id)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return fail("internal_error", t("Não foi possível carregar a campanha desta conversa."), 500, {
      requestId,
    });
  }
  const linha = destinatario as unknown as {
    sent_at: string | null;
    replied_at: string | null;
    campaigns: { id: string; name: string; meta_template_id: string | null } | null;
  } | null;
  if (!linha?.campaigns) return ok<CampanhaDaConversa | null>(null, { requestId });

  let modelo: CampanhaDaConversa["modelo"] = null;
  if (linha.campaigns.meta_template_id) {
    const { data: m } = await admin
      .from("meta_templates")
      .select("name, language")
      .eq("organization_id", org.orgId)
      .eq("id", linha.campaigns.meta_template_id)
      .maybeSingle();
    const t2 = m as { name: string; language: string } | null;
    if (t2) modelo = { nome: t2.name, idioma: t2.language };
  }

  return ok<CampanhaDaConversa>(
    {
      campanha: { id: linha.campaigns.id, nome: linha.campaigns.name },
      modelo,
      enviada_em: linha.sent_at,
      respondida_em: linha.replied_at,
    },
    { requestId },
  );
}

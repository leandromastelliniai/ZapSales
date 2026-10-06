/**
 * "IA E DEPOIS HUMANO": A PASSAGEM LEVA A CONVERSA PARA A FILA (issue #11).
 *
 * Quando a campanha declara `quem_assume = 'ia_e_humano'`, o agente atende e a
 * passagem para humano acontece pela regra que já existe (pedido do cliente,
 * palavra de passagem, sentimento, decisão do agente) — nada disso muda. O que
 * esta campanha acrescenta é o DESTINO: a conversa passada entra no rodízio de
 * atendentes (`fn_request_channel_routing`), em vez de ficar parada em
 * "pendente" esperando alguém abrir a Inbox.
 *
 * Mesma campanha que `agenteDaCampanhaDaConversa` escolhe: a mais recente desta
 * conversa. Os dois caminhos de passagem chamam daqui — o do motor
 * (`performHumanHandoff`, `pg`) e o do CRM (`triggerHandoff`, supabase-js).
 *
 * Nunca lança: a passagem já aconteceu quando isto roda, e uma falha aqui não
 * pode desfazê-la nem derrubar o turno. Ela vira log.
 */
import type pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import type { QuemAssume } from "./destino-da-resposta";

const QUEM_MANDA_PARA_A_FILA: QuemAssume = "ia_e_humano";

/** Pelo motor (`pg`): um statement só — lê a campanha e pede a fila quando ela manda. */
export async function filaDaPassagemPelaCampanha(
  db: Pick<pg.Pool, "query">,
  organizationId: string,
  conversationId: string,
): Promise<boolean> {
  try {
    const { rows } = await db.query<{ pediu: boolean }>(
      `select true as pediu, public.fn_request_channel_routing($1, $2)
         from (select c.quem_assume
                 from campaign_recipients r
                 join campaigns c on c.id = r.campaign_id and c.organization_id = r.organization_id
                where r.organization_id = $1 and r.conversation_id = $2
                order by r.sent_at desc nulls last
                limit 1) campanha
        where campanha.quem_assume = $3`,
      [organizationId, conversationId, QUEM_MANDA_PARA_A_FILA],
    );
    return rows.length > 0;
  } catch (err) {
    logger.warn("[fila-da-passagem] pedido de fila não gravado — a passagem segue valendo", {
      organization_id: organizationId,
      conversation_id: conversationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return false;
  }
}

/** Pelo CRM (supabase-js, service role): a mesma pergunta em duas idas. */
export async function filaDaPassagemPelaCampanhaSupabase(
  admin: SupabaseClient,
  organizationId: string,
  conversationId: string,
): Promise<boolean> {
  try {
    const { data } = await admin
      .from("campaign_recipients")
      .select("campaigns(quem_assume)")
      .eq("organization_id", organizationId)
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const quemAssume = (
      data as unknown as { campaigns: { quem_assume: string | null } | null } | null
    )?.campaigns?.quem_assume;
    if (quemAssume !== QUEM_MANDA_PARA_A_FILA) return false;
    const { error } = await admin.rpc(
      "fn_request_channel_routing" as never,
      {
        p_org: organizationId,
        p_conversation: conversationId,
      } as never,
    );
    if (error) throw new Error((error as { message?: string }).message ?? "rpc");
    return true;
  } catch (err) {
    logger.warn("[fila-da-passagem] pedido de fila não gravado — a passagem segue valendo", {
      organization_id: organizationId,
      conversation_id: conversationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return false;
  }
}

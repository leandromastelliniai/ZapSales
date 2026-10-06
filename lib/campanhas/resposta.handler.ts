/**
 * Adapter fino que pluga a atribuição de resposta no dispatcher do `event_log`
 * — mesmo padrão de `lib/followup/reactivity.handler.ts`.
 *
 * Consome o evento canônico `message.received`, que é emitido pelo TRIGGER de
 * `messages` (e não pelo ingest de canal): assim vale para qualquer caminho de
 * entrada, hoje e amanhã, sem a campanha conhecer provider nenhum.
 *
 * Nunca lança: falha aqui vira `error` para o dispatcher, que aplica o backoff
 * dele. A resposta do cliente já está no inbox de qualquer jeito — o que se
 * perde numa falha é a métrica, não a conversa.
 */
import { aplicarRespostaNaCampanha } from "@/lib/campanhas/resposta";
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";

export const CAMPANHA_RESPOSTA_HANDLER_KEY = "campanha-resposta.v1";

export const campanhaRespostaHandler: EventHandler = {
  key: CAMPANHA_RESPOSTA_HANDLER_KEY,
  naOrgParada: "roda",
  events: ["message.received"],
  async handle(row): Promise<HandlerResult> {
    const contactId = typeof row.payload.contact_id === "string" ? row.payload.contact_id : null;
    if (!contactId) {
      return {
        consumer_key: CAMPANHA_RESPOSTA_HANDLER_KEY,
        status: "skipped",
        detail: "evento sem contact_id",
      };
    }

    try {
      const admin = createAdminClient();
      const resumo = await aplicarRespostaNaCampanha(admin, {
        organizationId: row.organization_id,
        contactId,
        destinatarioRespondido: await destinatarioCitado(admin, row.organization_id, row.payload.message_id),
        // A hora da MENSAGEM, não a do consumo: o drain pode rodar minutos
        // depois, e usar `now()` faria uma resposta na borda da janela de 72h
        // cair fora por causa do atraso da fila.
        recebidoEm: momentoDoEvento(row),
      });
      return {
        consumer_key: CAMPANHA_RESPOSTA_HANDLER_KEY,
        // `skipped` quando não havia campanha a fechar — que é o caso comum de
        // toda instalação que não está prospectando. Marcar `ok` ali encheria o
        // log de sucesso sobre nada feito.
        status: resumo.atribuiu || resumo.optOut > 0 ? "ok" : "skipped",
        detail: `atribuiu=${resumo.atribuiu} opt_out=${resumo.optOut}`,
      };
    } catch (err) {
      return {
        consumer_key: CAMPANHA_RESPOSTA_HANDLER_KEY,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

/** Quando a mensagem chegou, com o `created_at` do evento como piso. */
/**
 * O destinatário que esta mensagem respondeu pelo `context.id` (gravado pela
 * ingestão em `metadata.context_wamid`): a mensagem citada é nossa e carrega o
 * `campaign_recipient_id`. `null` em qualquer dúvida — vale a régua da janela.
 */
async function destinatarioCitado(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  messageId: unknown,
): Promise<string | null> {
  if (typeof messageId !== "string") return null;
  try {
    const { data: msg } = await admin
      .from("messages")
      .select("metadata")
      .eq("organization_id", organizationId)
      .eq("id", messageId)
      .maybeSingle();
    const wamid = ((msg as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}).context_wamid;
    if (typeof wamid !== "string") return null;
    const { data: citada } = await admin
      .from("messages")
      .select("metadata")
      .eq("organization_id", organizationId)
      .eq("external_id", wamid)
      .eq("direction", "outbound")
      .limit(1)
      .maybeSingle();
    const id = ((citada as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}).campaign_recipient_id;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

function momentoDoEvento(row: { created_at?: string | Date | null }): Date {
  if (row.created_at) {
    const d = new Date(row.created_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

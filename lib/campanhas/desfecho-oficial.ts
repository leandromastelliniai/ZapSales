/**
 * Aplica ao banco o que a política de falha da campanha oficial decidiu
 * (`./falha-oficial.ts`) — nos dois caminhos por onde a recusa da Meta chega:
 *
 * - **na hora do envio**: a Graph devolve 4xx e o handler de mensagens grava a
 *   falha classificada (`metadata.falha_do_canal`). Quem aplica é o worker
 *   (`./rodada-oficial.ts`), com o destinatário ainda em `sending`.
 * - **depois, pelo webhook de status**: a Meta aceitou a mensagem (`sent`) e
 *   avisa a falha mais tarde — é assim que 131049 e 131050 costumam chegar. O
 *   trigger `fn_campanha_sincroniza_ack` já marcou o destinatário `failed` com
 *   o código e o motivo; aqui ele volta à fila (temporário) ou vira recusa de
 *   marketing (131050).
 *
 * Service role: toda consulta filtra `organization_id` à mão, vindo do
 * chamador (o worker lê da linha da campanha; o webhook, da sessão resolvida
 * pelo token do caminho).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { classificarErroMeta } from "@/lib/channels/meta/erros";
import { logger } from "@/lib/logger";

import { desfechoDaFalhaOficial, type DesfechoDaFalha, type FalhaOficial } from "./falha-oficial";

/** Estados em que a campanha ainda pode mandar: o destinatário de campanha encerrada não volta à fila. */
const CAMPANHA_VIVA = ["running", "paused", "scheduled"];

/**
 * Grava a recusa de marketing no contato, na mesma forma que o resto do produto
 * lê (`consent.marketing.declined_at`, ver `recusouMarketing` em
 * `./elegibilidade.ts`). A partir daí o contato fica fora de toda campanha.
 */
export async function gravarRecusaDeMarketing(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  agora: Date,
): Promise<void> {
  const { data } = await admin
    .from("contacts")
    .select("consent")
    .eq("organization_id", organizationId)
    .eq("id", contactId)
    .maybeSingle();
  const consent =
    data && typeof (data as { consent?: unknown }).consent === "object" && (data as { consent: unknown }).consent
      ? ((data as { consent: Record<string, unknown> }).consent)
      : {};
  const marketing =
    consent.marketing && typeof consent.marketing === "object" ? (consent.marketing as Record<string, unknown>) : {};
  const { error } = await admin
    .from("contacts")
    .update({
      consent: {
        ...consent,
        marketing: { ...marketing, granted_at: null, declined_at: agora.toISOString(), source: "meta:131050" },
      },
    })
    .eq("organization_id", organizationId)
    .eq("id", contactId);
  if (error) {
    logger.warn("[campanha] recusa de marketing não gravada no contato", { contato: contactId, motivo: error.message });
  }
}

/**
 * O destino do destinatário, dado o desfecho. `de` é o status em que ele está
 * agora (`sending` no worker, `failed` depois do trigger) — o compare-and-set
 * impede de reescrever um destinatário que outro caminho já moveu.
 */
export async function aplicarDesfecho(
  admin: SupabaseClient,
  alvo: { organizationId: string; destinatarioId: string; contactId: string; de: string },
  desfecho: DesfechoDaFalha,
  codigo: string | null,
  agora: Date,
): Promise<void> {
  let mudanca: Record<string, unknown>;
  switch (desfecho.acao) {
    case "tentar_de_novo":
      mudanca = {
        status: "pending",
        sending_at: null,
        next_attempt_at: desfecho.em.toISOString(),
        last_error_code: codigo,
        last_error_detail: desfecho.motivo,
      };
      break;
    case "recusou_marketing":
      await gravarRecusaDeMarketing(admin, alvo.organizationId, alvo.contactId, agora);
      mudanca = {
        status: "opted_out",
        opted_out_at: agora.toISOString(),
        last_error_code: codigo,
        last_error_detail: desfecho.motivo,
      };
      break;
    case "falhar":
      mudanca = { status: "failed", last_error_code: codigo, last_error_detail: desfecho.motivo };
      break;
  }

  const { error } = await admin
    .from("campaign_recipients")
    .update(mudanca)
    .eq("organization_id", alvo.organizationId)
    .eq("id", alvo.destinatarioId)
    .eq("status", alvo.de);
  if (error) {
    logger.warn("[campanha] desfecho do envio não gravado", { destinatario: alvo.destinatarioId, motivo: error.message });
  }
}

/** A falha classificada a partir só do código — o que o webhook de status entrega. */
export function falhaDoCodigo(codigo: number | null): FalhaOficial {
  const e = classificarErroMeta({ code: codigo });
  return {
    codigo: codigo === null ? null : String(codigo),
    categoria: e.categoria,
    temporario: e.temporario,
    motivo: e.motivo,
  };
}

/**
 * A falha que chegou DEPOIS, pelo webhook de status, numa mensagem de campanha.
 * Chamada pela rota do webhook logo após gravar o `failed` na mensagem — o
 * trigger já levou o código e o motivo ao destinatário.
 *
 * Devolve o que fez, para o log da rota. Mensagem que não é de campanha é
 * `nao_e_campanha` e não toca em nada.
 */
export async function aplicarFalhaTardia(
  admin: SupabaseClient,
  organizationId: string,
  externalId: string,
  codigo: number | null,
  agora: Date,
): Promise<"nao_e_campanha" | DesfechoDaFalha["acao"] | "campanha_encerrada"> {
  const { data: mensagens } = await admin
    .from("messages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("external_id", externalId)
    .limit(5);
  const ids = ((mensagens ?? []) as Array<{ id: string }>).map((m) => m.id);
  if (ids.length === 0) return "nao_e_campanha";

  const { data: linhas } = await admin
    .from("campaign_recipients")
    .select("id, contact_id, status, attempt_count, last_attempt_at, campaigns:campaign_id!inner(status)")
    .eq("organization_id", organizationId)
    .in("message_id", ids)
    .limit(1);
  const alvo = ((linhas ?? []) as unknown as Array<{
    id: string;
    contact_id: string;
    status: string;
    attempt_count: number;
    last_attempt_at: string | null;
    campaigns: { status: string } | Array<{ status: string }> | null;
  }>)[0];
  if (!alvo) return "nao_e_campanha";
  // Só o que o trigger acabou de marcar como falha. Respondido, cancelado ou
  // já decidido por outro caminho não é reescrito.
  if (alvo.status !== "failed") return "nao_e_campanha";

  // A espera conta do ENVIO, não da chegada do aviso: é o mesmo relógio da
  // regra das 24 h entre campanhas (`last_attempt_at`), e o mesmo que a Meta usa.
  const desde = alvo.last_attempt_at ? new Date(alvo.last_attempt_at) : agora;
  const desfecho = desfechoDaFalhaOficial(falhaDoCodigo(codigo), Math.max(1, alvo.attempt_count), desde);
  const campanha = Array.isArray(alvo.campaigns) ? alvo.campaigns[0] : alvo.campaigns;
  if (desfecho.acao === "tentar_de_novo" && !CAMPANHA_VIVA.includes(campanha?.status ?? "")) {
    // A campanha já terminou: voltar à fila de uma campanha concluída seria um
    // pendente que nenhuma rodada pega. Fica a falha, com o motivo legível.
    return "campanha_encerrada";
  }
  if (desfecho.acao === "falhar") return "falhar"; // o trigger já gravou código e motivo

  await aplicarDesfecho(
    admin,
    { organizationId, destinatarioId: alvo.id, contactId: alvo.contact_id, de: "failed" },
    desfecho,
    codigo === null ? null : String(codigo),
    agora,
  );
  return desfecho.acao;
}

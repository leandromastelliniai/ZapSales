/**
 * A PAUSA AUTOMÁTICA DA CAMPANHA (issue #9) — a campanha se protege sozinha.
 *
 * Três coisas fazem uma campanha oficial parar de valer a pena no meio:
 *
 * - a **qualidade do número** fica vermelha: a Meta está recebendo bloqueios e
 *   denúncias, e o passo seguinte é ela reduzir o limite ou restringir o número;
 * - o **modelo** é rejeitado, pausado ou desativado: cada envio voltaria recusado;
 * - o **modelo muda de categoria** (utilidade → marketing): cada envio passa a
 *   custar outra coisa, e quem planejou a campanha não planejou esse custo.
 *
 * Em todos, a campanha PAUSA — não cancela: o operador decide, com o motivo na
 * tela (`pausa_motivo` + `pausa_detalhe`, migration 0539). Retomar limpa o
 * motivo; retomar com o problema ainda de pé é recusado em `acoes.ts`.
 *
 * ─── Quem chama ─────────────────────────────────────────────────────────────
 *
 * Os webhooks da Meta, na hora (`lib/channels/meta/saude-do-numero.ts` e
 * `lib/channels/meta/eventos-de-modelo.ts`), e a própria rodada oficial como
 * rede de segurança (`./rodada-oficial.ts`): o estado pode ter mudado sem
 * webhook — sincronização de modelos, qualidade lida na reconexão.
 *
 * Só pausa o que está `running` ou `scheduled` (a máquina de estados não leva
 * outro estado a `paused`), com compare-and-set no status: duas entregas do
 * mesmo evento pausam uma vez e auditam uma vez.
 *
 * Usa o admin client: `organizationId` vem de fonte confiável (token do caminho
 * do webhook, linha da campanha), nunca do corpo, e filtra toda consulta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";

import type { EventoDeModelo } from "@/lib/channels/meta/eventos-de-modelo";

/** O vocabulário de `campaigns.pausa_motivo` — o mesmo CHECK da 0539. */
export const MOTIVOS_DA_PAUSA = [
  "qualidade_vermelha",
  "modelo_rejeitado",
  "modelo_pausado",
  "modelo_desativado",
  "modelo_recategorizado",
] as const;

export type MotivoDaPausa = (typeof MOTIVOS_DA_PAUSA)[number];

/** Os estados que a pausa automática alcança. */
const PAUSAVEIS = ["running", "scheduled"] as const;

const MOTIVO_DO_STATUS: Record<string, MotivoDaPausa> = {
  REJECTED: "modelo_rejeitado",
  PAUSED: "modelo_pausado",
  DISABLED: "modelo_desativado",
  // O espelho grava DISABLED para o modelo que sumiu; o evento cru é DELETED.
  DELETED: "modelo_desativado",
};

/** O status do modelo (no espelho ou no evento) pede pausa? */
export function motivoDoStatusDoModelo(status: string | null | undefined): MotivoDaPausa | null {
  return MOTIVO_DO_STATUS[(status ?? "").toUpperCase()] ?? null;
}

/**
 * O evento de modelo do webhook pede pausa? Status rejeitado, pausado ou
 * desativado, e a recategorização EFETIVA. O aviso prévio de recategorização não
 * muda nada ainda (a Central já avisa), e a qualidade vermelha do modelo é o
 * degrau ANTES da pausa da Meta — quando ela pausar, o evento de status vem.
 */
export function motivoDoEventoDeModelo(e: EventoDeModelo): MotivoDaPausa | null {
  if (e.kind === "template_status") return motivoDoStatusDoModelo(e.event);
  if (e.kind === "template_category") return e.efetiva ? "modelo_recategorizado" : null;
  return null;
}

const NOME_DA_CATEGORIA: Record<string, string> = {
  MARKETING: "marketing",
  UTILITY: "utilidade",
  AUTHENTICATION: "autenticação",
};

function categoria(c: string | null | undefined): string {
  if (!c) return "outra categoria";
  return NOME_DA_CATEGORIA[c.toUpperCase()] ?? c.toLowerCase();
}

export interface ContextoDaPausa {
  /** O número, como o operador o reconhece (apelido + telefone). */
  numero?: string;
  /** O modelo, `nome (idioma)`. */
  modelo?: string;
  /** O motivo que a Meta deu, quando deu. */
  motivoDaMeta?: string | null;
  /** Recategorização: de qual categoria para qual. */
  de?: string | null;
  para?: string | null;
}

/** A frase que a campanha pausada mostra — diz o que aconteceu e o que fazer. */
export function fraseDaPausa(motivo: MotivoDaPausa, ctx: ContextoDaPausa): string {
  const modelo = ctx.modelo ?? "da campanha";
  const daMeta = ctx.motivoDaMeta ? ` Motivo informado pela Meta: ${ctx.motivoDaMeta}.` : "";
  switch (motivo) {
    case "qualidade_vermelha":
      return (
        `A qualidade do número ${ctx.numero ?? "da campanha"} ficou vermelha na Meta: quem recebe está bloqueando ou denunciando. ` +
        "Revise o texto e o público antes de retomar — se a qualidade continuar baixa, a Meta reduz o limite ou restringe o número."
      );
    case "modelo_rejeitado":
      return `A Meta rejeitou o modelo ${modelo}, e nenhum envio com ele sairia.${daMeta} Escolha outro modelo aprovado numa cópia desta campanha.`;
    case "modelo_pausado":
      return `A Meta pausou o modelo ${modelo}, em geral por reclamação de quem recebeu.${daMeta} Retome quando ele voltar a ficar aprovado.`;
    case "modelo_desativado":
      return `A Meta desativou o modelo ${modelo}, que não pode mais ser enviado.${daMeta} Crie um modelo novo e use-o numa cópia desta campanha.`;
    case "modelo_recategorizado":
      return (
        `A Meta mudou a categoria do modelo ${modelo} de ${categoria(ctx.de)} para ${categoria(ctx.para)}, e o custo de cada envio mudou junto. ` +
        "Confira se a campanha ainda vale a pena antes de retomar."
      );
  }
}

/**
 * Pausa estas campanhas com o motivo, se ainda estiverem rodando ou agendadas.
 * Devolve as que pausou de fato. Nunca lança: quem chama é webhook ou rodada, e
 * uma pausa que falhou vai ao log (a rodada tenta de novo na volta seguinte).
 */
export async function pausarAutomaticamente(
  admin: SupabaseClient,
  organizationId: string,
  campanhaIds: readonly string[],
  motivo: MotivoDaPausa,
  detalhe: string,
  agora: Date = new Date(),
): Promise<string[]> {
  if (campanhaIds.length === 0) return [];
  const { data, error } = await admin
    .from("campaigns")
    .update({ status: "paused", paused_at: agora.toISOString(), pausa_motivo: motivo, pausa_detalhe: detalhe })
    .eq("organization_id", organizationId)
    .in("id", [...campanhaIds])
    .in("status", [...PAUSAVEIS])
    .select("id");
  if (error) {
    logger.error("[campanha] a pausa automática não foi gravada", { motivo, codigo: error.code });
    return [];
  }
  const pausadas = ((data ?? []) as Array<{ id: string }>).map((l) => l.id);
  for (const id of pausadas) {
    void audit({
      action: "campaign.auto_paused",
      organizationId,
      resourceType: "campaign",
      resourceId: id,
      bypassedRls: true,
      metadata: { motivo },
    });
  }
  return pausadas;
}

/**
 * As campanhas OFICIAIS em andamento que falam por este número — como número
 * principal ou no pool do rodízio.
 */
export async function campanhasDoNumero(
  admin: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
): Promise<string[]> {
  const [emAndamento, pool] = await Promise.all([
    admin
      .from("campaigns")
      .select("id, channel_session_id")
      .eq("organization_id", organizationId)
      .not("meta_template_id", "is", null)
      .in("status", [...PAUSAVEIS]),
    admin
      .from("campaign_channel_sessions")
      .select("campaign_id")
      .eq("organization_id", organizationId)
      .eq("channel_session_id", channelSessionId),
  ]);
  const doPool = new Set(((pool.data ?? []) as Array<{ campaign_id: string }>).map((l) => l.campaign_id));
  return ((emAndamento.data ?? []) as Array<{ id: string; channel_session_id: string }>)
    .filter((c) => c.channel_session_id === channelSessionId || doPool.has(c.id))
    .map((c) => c.id);
}

/** As campanhas em andamento que enviam este modelo. */
export async function campanhasDoModelo(
  admin: SupabaseClient,
  organizationId: string,
  modeloId: string,
): Promise<string[]> {
  const { data } = await admin
    .from("campaigns")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("meta_template_id", modeloId)
    .in("status", [...PAUSAVEIS]);
  return ((data ?? []) as Array<{ id: string }>).map((l) => l.id);
}

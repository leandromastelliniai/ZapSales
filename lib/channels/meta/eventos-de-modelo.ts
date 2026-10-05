/**
 * O WEBHOOK DE MODELO NO ESPELHO E NA CENTRAL (issue #6).
 *
 * A Meta avisa por webhook quando um modelo muda de status (aprovado, recusado,
 * pausado, desativado), de qualidade ou de categoria. Este módulo aplica o
 * evento à linha de `meta_templates` e, quando a mudança pede ação ou muda o
 * custo, abre o aviso `channel_template_review` na Central — o kind existia
 * desde a 0120 sem um único emissor.
 *
 * ─── Um aviso por MUDANÇA, não por entrega ──────────────────────────────────
 *
 * A Meta reentrega o que não recebeu 2xx, e às vezes o que recebeu. O aviso só
 * sai quando o UPDATE mudou a linha de fato: a escrita leva como trava o valor
 * lido (`eq(coluna, antes)`), e a reentrega encontra o valor novo, não casa
 * nada, e não avisa. Duas entregas simultâneas também: a segunda perde a trava.
 * O aviso prévio de recategorização, que não muda linha nenhuma, se protege
 * procurando o próprio aviso ainda aberto.
 *
 * ─── O que fica fora ─────────────────────────────────────────────────────────
 *
 * Pausar as campanhas que usam o modelo afetado é da issue #9. Modelo que o
 * espelho não conhece (nunca sincronizado) não vira linha: sem os componentes a
 * linha seria inútil para o envio, e a próxima sincronização o traz inteiro.
 *
 * Usa o admin client: `organizationId` vem do TOKEN DO PATH do webhook, nunca do
 * corpo, e filtra toda consulta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { InboxKind } from "@/lib/agent-engine/db/repository";
import { logger } from "@/lib/logger";

import { TEMPLATE_STATUS_DISABLED } from "./template-sync";

import type { TemplateCategoryEvent, TemplateQualityEvent, TemplateStatusEvent } from "./webhook";

export type EventoDeModelo = TemplateStatusEvent | TemplateQualityEvent | TemplateCategoryEvent;

/** Se o evento do webhook é de modelo — a pergunta que a rota faz antes de despachar. */
export function ehEventoDeModelo(e: { kind: string }): e is EventoDeModelo {
  return (
    e.kind === "template_status" || e.kind === "template_quality" || e.kind === "template_category"
  );
}

/** O kind da Central para tudo o que este módulo avisa (0120). Constante, nunca o literal solto. */
export const KIND_DO_AVISO_DE_MODELO = "channel_template_review" satisfies InboxKind;

export interface AvisoDeModelo {
  severity: "info" | "warn" | "critical";
  title: string;
  body: string;
}

const NOME_DA_CATEGORIA: Record<string, string> = {
  MARKETING: "marketing",
  UTILITY: "utilidade",
  AUTHENTICATION: "autenticação",
};

function categoriaLegivel(c: string | null): string {
  if (!c) return "outra categoria";
  return NOME_DA_CATEGORIA[c.toUpperCase()] ?? c.toLowerCase();
}

function identificacao(e: EventoDeModelo): string {
  return `"${e.templateName}" (${e.templateLanguage})`;
}

function motivoDaMeta(e: TemplateStatusEvent): string {
  const partes = [e.reason ? `Motivo informado pela Meta: ${e.reason}.` : null, e.detail ?? null];
  return partes.filter(Boolean).join(" ");
}

/**
 * O aviso que o evento merece, ou `null`. Puro: decide só pelo evento.
 *
 * Aprovado e pendente não avisam — a lista de modelos já mostra, e avisar de
 * notícia boa ensina a ignorar a Central. Qualidade só avisa no vermelho, que é
 * o degrau antes da pausa.
 */
export function avisoDoEventoDeModelo(e: EventoDeModelo): AvisoDeModelo | null {
  if (e.kind === "template_status") {
    const evento = e.event.toUpperCase();
    const motivo = motivoDaMeta(e);
    if (evento === "REJECTED") {
      return {
        severity: "warn",
        title: `A Meta recusou o modelo ${e.templateName}`,
        body:
          `O modelo ${identificacao(e)} foi recusado e não pode ser enviado. ${motivo} ` +
          `Ajuste o texto e envie um modelo novo para aprovação.`.replace(/\s+/g, " "),
      };
    }
    if (evento === "PAUSED") {
      return {
        severity: "critical",
        title: `A Meta pausou o modelo ${e.templateName}`,
        body:
          `O modelo ${identificacao(e)} foi pausado pela Meta, em geral por reclamação ou bloqueio de quem recebeu. ` +
          `Enquanto estiver pausado, os envios com ele não saem. ${motivo}`.trim(),
      };
    }
    if (evento === "DISABLED") {
      return {
        severity: "critical",
        title: `A Meta desativou o modelo ${e.templateName}`,
        body:
          `O modelo ${identificacao(e)} foi desativado pela Meta e não pode mais ser enviado. ${motivo} ` +
          `Crie um modelo novo para substituí-lo.`.replace(/\s+/g, " "),
      };
    }
    if (evento === "FLAGGED") {
      return {
        severity: "warn",
        title: `O modelo ${e.templateName} está em observação`,
        body:
          `A Meta marcou o modelo ${identificacao(e)} por qualidade baixa. Se a qualidade não melhorar, ` +
          `ele será desativado. ${motivo}`.trim(),
      };
    }
    return null;
  }

  if (e.kind === "template_quality") {
    if (e.quality.toUpperCase() !== "RED") return null;
    return {
      severity: "warn",
      title: `A qualidade do modelo ${e.templateName} ficou vermelha`,
      body:
        `Quem recebe o modelo ${identificacao(e)} está reclamando ou bloqueando. ` +
        `Se continuar assim, a Meta pausa o modelo. Revise o texto e o público dos envios.`,
    };
  }

  const de = categoriaLegivel(e.previous);
  const para = categoriaLegivel(e.category);
  if (!e.efetiva) {
    return {
      severity: "warn",
      title: `A Meta vai mudar a categoria do modelo ${e.templateName} — o custo muda`,
      body:
        `A Meta avisou que o modelo ${identificacao(e)} vai passar para a categoria ${para}. ` +
        `O preço de cada envio segue a categoria: confira se ainda vale usar este modelo.`,
    };
  }
  return {
    severity: "warn",
    title: `A Meta mudou a categoria do modelo ${e.templateName} — o custo muda`,
    body:
      `O modelo ${identificacao(e)} passou de ${de} para ${para}. ` +
      `O preço de cada envio segue a categoria: os próximos envios com ele já custam como ${para}.`,
  };
}

/**
 * O evento de status da Meta que NÃO é um status do espelho, traduzido para o
 * que o espelho entende. `REINSTATED` é a Meta liberando um modelo pausado ou
 * marcado — gravado cru, o envio (que só aceita `APPROVED`) o recusaria até
 * alguém sincronizar à mão. `DELETED` é o modelo que sumiu, o mesmo estado que a
 * sincronização grava para quem some (`planSync`). O resto atravessa como veio:
 * a coluna não tem CHECK de propósito (ver `META_TEMPLATE_STATUS`).
 */
const STATUS_DO_ESPELHO: Record<string, string> = {
  REINSTATED: "APPROVED",
  DELETED: TEMPLATE_STATUS_DISABLED,
};

/** A coluna que o evento muda e o valor novo. O aviso prévio não muda coluna nenhuma. */
function mudancaDoEvento(
  e: EventoDeModelo,
): { coluna: string; valor: string; extra: Record<string, unknown> } | null {
  if (e.kind === "template_status") {
    const evento = e.event.toUpperCase();
    return {
      coluna: "status",
      valor: STATUS_DO_ESPELHO[evento] ?? e.event,
      extra: { rejected_reason: e.reason },
    };
  }
  if (e.kind === "template_quality")
    return { coluna: "quality_score", valor: e.quality, extra: {} };
  if (!e.efetiva) return null;
  return { coluna: "category", valor: e.category, extra: {} };
}

/** Desfecho para o corpo da resposta do webhook (`outcomes`), como as outras ingestões. */
export type DesfechoDoEventoDeModelo =
  | "modelo:atualizado"
  | "modelo:sem_mudanca"
  | "modelo:desconhecido"
  | "modelo:aviso_previo"
  | "modelo:falha";

async function abrirAviso(
  admin: SupabaseClient,
  organizationId: string,
  aviso: AvisoDeModelo,
): Promise<void> {
  const { error } = await admin.from("agent_inbox_items").insert({
    organization_id: organizationId,
    kind: KIND_DO_AVISO_DE_MODELO,
    severity: aviso.severity,
    title: aviso.title,
    body: aviso.body,
    // Sem referência: o destino do kind é a lista de modelos do canal
    // (`lib/ai/inbox-destino.ts`), e o corpo nomeia o modelo.
    ref_kind: null,
    ref_id: null,
  });
  if (error) {
    // O UPDATE já valeu; o aviso que falhou não desfaz a atualização. Vai ao log
    // para não sumir calado.
    logger.error("[meta.modelo] aviso de modelo não entrou na Central", {
      organization_id: organizationId,
      error: error.message,
    });
  }
}

/**
 * Aplica um evento de modelo ao espelho da organização e avisa quando cabe.
 * Nunca lança: o webhook responde 200 de qualquer jeito (a Meta reentregaria),
 * e a falha vai ao desfecho e ao log.
 */
export async function aplicarEventoDeModelo(
  admin: SupabaseClient,
  organizationId: string,
  e: EventoDeModelo,
  agora: Date = new Date(),
): Promise<DesfechoDoEventoDeModelo> {
  const aviso = avisoDoEventoDeModelo(e);
  const mudanca = mudancaDoEvento(e);

  if (!mudanca) {
    // Aviso prévio de recategorização: nada a gravar na linha. A trava contra
    // reentrega é o próprio aviso ainda aberto.
    if (!aviso) return "modelo:sem_mudanca";
    const { data: jaAvisado, error } = await admin
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("kind", KIND_DO_AVISO_DE_MODELO)
      .eq("status", "open")
      .eq("title", aviso.title)
      .limit(1);
    // Falha ABERTA: sem conseguir checar, o aviso sai. Repetir é o erro barato.
    if (!error && jaAvisado && jaAvisado.length > 0) return "modelo:sem_mudanca";
    await abrirAviso(admin, organizationId, aviso);
    return "modelo:aviso_previo";
  }

  const { data: linhas, error: erroDeLeitura } = await admin
    .from("meta_templates")
    .select(`id, ${mudanca.coluna}`)
    .eq("organization_id", organizationId)
    .eq("waba_id", e.wabaId)
    .eq("name", e.templateName)
    .eq("language", e.templateLanguage);
  if (erroDeLeitura) {
    logger.error("[meta.modelo] leitura do espelho falhou", {
      organization_id: organizationId,
      error: erroDeLeitura.message,
    });
    return "modelo:falha";
  }
  const linha = (linhas ?? [])[0] as Record<string, unknown> | undefined;
  if (!linha) return "modelo:desconhecido";

  const antes = (linha[mudanca.coluna] ?? null) as string | null;
  if (antes === mudanca.valor) return "modelo:sem_mudanca";

  let escrita = admin
    .from("meta_templates")
    .update({ [mudanca.coluna]: mudanca.valor, ...mudanca.extra, updated_at: agora.toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", linha.id as string);
  // A trava: só escreve se a coluna ainda tem o valor lido. Quem chegar depois
  // (reentrega simultânea) não casa, e não avisa duas vezes.
  escrita = antes === null ? escrita.is(mudanca.coluna, null) : escrita.eq(mudanca.coluna, antes);
  const { data: mudou, error: erroDeEscrita } = await escrita.select("id");
  if (erroDeEscrita) {
    logger.error("[meta.modelo] atualização do espelho falhou", {
      organization_id: organizationId,
      error: erroDeEscrita.message,
    });
    return "modelo:falha";
  }
  if (!mudou || mudou.length === 0) return "modelo:sem_mudanca";

  if (aviso) await abrirAviso(admin, organizationId, aviso);
  return "modelo:atualizado";
}

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
 * Modelo rejeitado, pausado, desativado ou recategorizado também pausa as
 * campanhas que o usam (issue #9, `lib/campanhas/pausa-automatica.ts`). Modelo que o
 * espelho não conhece (nunca sincronizado) não vira linha: sem os componentes a
 * linha seria inútil para o envio, e a próxima sincronização o traz inteiro.
 *
 * Usa o admin client: `organizationId` vem do TOKEN DO PATH do webhook, nunca do
 * corpo, e filtra toda consulta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { InboxKind } from "@/lib/agent-engine/db/repository";
import {
  campanhasDoModelo,
  fraseDaPausa,
  motivoDoEventoDeModelo,
  pausarAutomaticamente,
} from "@/lib/campanhas/pausa-automatica";
import { idiomaPeloCliente, preencher } from "@/lib/i18n/aviso-no-idioma";
import { traduzir } from "@/lib/i18n/dicionario";
import { IDIOMAS, type Idioma } from "@/lib/i18n/idiomas";
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

function categoriaLegivel(c: string | null, idioma: Idioma): string {
  if (!c) return traduzir("outra categoria", idioma);
  const nome = NOME_DA_CATEGORIA[c.toUpperCase()];
  return nome ? traduzir(nome, idioma) : c.toLowerCase();
}

function identificacao(e: EventoDeModelo): string {
  return `"${e.templateName}" (${e.templateLanguage})`;
}

function motivoDaMeta(e: TemplateStatusEvent, idioma: Idioma): string {
  const partes = [
    e.reason ? preencher(traduzir("Motivo informado pela Meta: {motivo}.", idioma), { motivo: e.reason }) : null,
    e.detail ?? null,
  ];
  return partes.filter(Boolean).join(" ");
}

/**
 * O aviso que o evento merece, ou `null`. Puro: decide só pelo evento.
 *
 * Aprovado e pendente não avisam — a lista de modelos já mostra, e avisar de
 * notícia boa ensina a ignorar a Central. Qualidade só avisa no vermelho, que é
 * o degrau antes da pausa.
 *
 * O texto sai no `idioma` da organização: a Central mostra o aviso como foi
 * gravado. O nome do modelo e o motivo da Meta atravessam como vieram — são
 * dado, não frase nossa.
 */
export function avisoDoEventoDeModelo(e: EventoDeModelo, idioma: Idioma = "pt-BR"): AvisoDeModelo | null {
  const t = (texto: string) => traduzir(texto, idioma);
  const modelo = { nome: e.templateName, modelo: identificacao(e) };

  if (e.kind === "template_status") {
    const evento = e.event.toUpperCase();
    const motivo = motivoDaMeta(e, idioma);
    if (evento === "REJECTED") {
      return {
        severity: "warn",
        title: preencher(t("A Meta recusou o modelo {nome}"), modelo),
        body:
          `${preencher(t("O modelo {modelo} foi recusado e não pode ser enviado."), modelo)} ${motivo} ` +
          t("Ajuste o texto e envie um modelo novo para aprovação."),
      };
    }
    if (evento === "PAUSED") {
      return {
        severity: "critical",
        title: preencher(t("A Meta pausou o modelo {nome}"), modelo),
        body: (
          `${preencher(t("O modelo {modelo} foi pausado pela Meta, em geral por reclamação ou bloqueio de quem recebeu."), modelo)} ` +
          `${t("Enquanto estiver pausado, os envios com ele não saem.")} ${motivo}`
        ).trim(),
      };
    }
    if (evento === "DISABLED") {
      return {
        severity: "critical",
        title: preencher(t("A Meta desativou o modelo {nome}"), modelo),
        body:
          `${preencher(t("O modelo {modelo} foi desativado pela Meta e não pode mais ser enviado."), modelo)} ${motivo} ` +
          t("Crie um modelo novo para substituí-lo."),
      };
    }
    if (evento === "FLAGGED") {
      return {
        severity: "warn",
        title: preencher(t("O modelo {nome} está em observação"), modelo),
        body: (
          `${preencher(t("A Meta marcou o modelo {modelo} por qualidade baixa. Se a qualidade não melhorar, ele será desativado."), modelo)} ` +
          motivo
        ).trim(),
      };
    }
    return null;
  }

  if (e.kind === "template_quality") {
    if (e.quality.toUpperCase() !== "RED") return null;
    return {
      severity: "warn",
      title: preencher(t("A qualidade do modelo {nome} ficou vermelha"), modelo),
      body: preencher(
        t("Quem recebe o modelo {modelo} está reclamando ou bloqueando. Se continuar assim, a Meta pausa o modelo. Revise o texto e o público dos envios."),
        modelo,
      ),
    };
  }

  const de = categoriaLegivel(e.previous, idioma);
  const para = categoriaLegivel(e.category, idioma);
  if (!e.efetiva) {
    return {
      severity: "warn",
      title: preencher(t("A Meta vai mudar a categoria do modelo {nome} — o custo muda"), modelo),
      body: preencher(
        t("A Meta avisou que o modelo {modelo} vai passar para a categoria {para}. O preço de cada envio segue a categoria: confira se ainda vale usar este modelo."),
        { ...modelo, para },
      ),
    };
  }
  return {
    severity: "warn",
    title: preencher(t("A Meta mudou a categoria do modelo {nome} — o custo muda"), modelo),
    body: preencher(
      t("O modelo {modelo} passou de {de} para {para}. O preço de cada envio segue a categoria: os próximos envios com ele já custam como {para}."),
      { ...modelo, de, para },
    ),
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
  e: EventoDeModelo,
  emPortugues: AvisoDeModelo,
): Promise<void> {
  // No idioma da organização: a Central mostra o aviso como foi gravado.
  const aviso = avisoDoEventoDeModelo(e, await idiomaPeloCliente(admin, organizationId)) ?? emPortugues;
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
      // O título em TODO idioma: trocar o idioma da organização entre duas
      // entregas não pode abrir um segundo aviso do mesmo fato.
      .in("title", [...new Set(IDIOMAS.map((i) => avisoDoEventoDeModelo(e, i)?.title ?? aviso.title))])
      .limit(1);
    // Falha ABERTA: sem conseguir checar, o aviso sai. Repetir é o erro barato.
    if (!error && jaAvisado && jaAvisado.length > 0) return "modelo:sem_mudanca";
    await abrirAviso(admin, organizationId, e, aviso);
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

  if (aviso) await abrirAviso(admin, organizationId, e, aviso);
  await pausarCampanhasDoModelo(admin, organizationId, linha.id as string, e, antes, agora);
  return "modelo:atualizado";
}

/**
 * Modelo rejeitado, pausado, desativado ou recategorizado pausa as campanhas em
 * andamento que o usam, com o motivo na campanha (issue #9). Só na MUDANÇA, pela
 * mesma trava do aviso: a reentrega não pausa de novo uma campanha que o
 * operador decidiu retomar depois de uma recategorização.
 */
async function pausarCampanhasDoModelo(
  admin: SupabaseClient,
  organizationId: string,
  modeloId: string,
  e: EventoDeModelo,
  antes: string | null,
  agora: Date,
): Promise<void> {
  const motivo = motivoDoEventoDeModelo(e);
  if (!motivo) return;
  try {
    const campanhas = await campanhasDoModelo(admin, organizationId, modeloId);
    const detalhe = fraseDaPausa(motivo, {
      modelo: `${e.templateName} (${e.templateLanguage})`,
      motivoDaMeta: e.kind === "template_status" ? (e.detail ?? e.reason) : null,
      de: e.kind === "template_category" ? (e.previous ?? antes) : null,
      para: e.kind === "template_category" ? e.category : null,
    });
    await pausarAutomaticamente(admin, organizationId, campanhas, motivo, detalhe, agora);
  } catch (err) {
    // O espelho já foi atualizado; a rodada oficial pausa pelo status na volta
    // seguinte (a recategorização não tem essa rede, por isso o log alto).
    logger.error("[meta.modelo] a pausa das campanhas do modelo falhou", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

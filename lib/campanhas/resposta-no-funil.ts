/**
 * A RESPOSTA DA CAMPANHA CAI NO FUNIL — a execução (issue #11).
 *
 * A regra mora em `destino-da-resposta.ts`, pura. Aqui está o resto: achar a
 * campanha que esta mensagem responde, e fazer o que o plano manda — mover o
 * card, fechar como perdido, calar a IA e chamar a fila, e escrever na timeline.
 *
 * ═══ Qual campanha esta mensagem responde ═══
 *
 * 1. O toque num botão traz `context.id` — o `wamid` da mensagem da campanha.
 *    É a resposta exata: a mensagem de saída carrega o destinatário no
 *    `metadata.campaign_recipient_id` (`rodada-oficial.ts`).
 * 2. Sem isso, o destinatário mais recente DESTA conversa dentro da janela de
 *    atribuição da organização — a mesma janela da métrica de resposta
 *    (`resposta.ts`), para "respondeu" e "caiu no funil" contarem a mesma gente.
 *
 * ═══ Nada aqui derruba a ingestão ═══
 *
 * A mensagem do cliente já está gravada quando isto roda (ver o cabeçalho de
 * `lib/channels/pos-entrada.ts`). Cada passo falha para dentro, com log. Na
 * dúvida sobre a campanha (`null`), a mensagem segue o caminho de sempre.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { moveLeadHandler } from "@/app/api/v1/leads/_handler";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import { observeServiceOrigin } from "@/lib/atendimento/origem";
import type { RespostaRapida } from "@/lib/channels/meta/webhook";
import { pausarIaDuravelmente } from "@/lib/escalacao/atendimento-manual";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import type { OrigemParaClonar } from "@/lib/leads/clonar-para-funil";
import { encerraDemanda } from "@/lib/leads/encerramento";
import { COLUNAS_DA_ORIGEM, transferirParaFunil } from "@/lib/leads/transferir-para-funil";
import { logger } from "@/lib/logger";
import type { CanonicalLostReason } from "@/lib/schemas/leads";

import { janelaDeAtribuicaoMs, lerConfiguracao } from "./configuracao";
import {
  QUEM_ASSUME,
  botaoClicado,
  lerBotoesDaResposta,
  planejarResposta,
  type BotaoDaResposta,
  type PlanoDaResposta,
  type QuemAssume,
} from "./destino-da-resposta";

/** Vocabulário ABERTO da timeline: o emissor usa a constante, nunca a string solta. */
export const ATIVIDADE_RESPOSTA_DA_CAMPANHA = "campaign_replied" as const;

/**
 * O motivo gravado em `last_handoff_reason` quando a campanha manda a resposta
 * para a fila. É o que a tela de atendimento mostra como "por que a IA parou".
 */
export const MOTIVO_FILA_DA_CAMPANHA = "campanha_atendimento_humano";

/** `contacts.blocked_reason` do opt-out pelo botão — irmão do `stop_keyword` da palavra. */
export const MOTIVO_BLOQUEIO_PELO_BOTAO = "quick_reply_opt_out";

/**
 * "Não tenho interesse" não é nenhum dos motivos de negócio da lista canônica,
 * e criar um exige mexer no trigger de validação. `other` com a frase do botão
 * na timeline é a verdade: quem lê vê exatamente o que a pessoa tocou.
 */
const MOTIVO_DA_PERDA_PELO_BOTAO = "other" satisfies CanonicalLostReason;

/** Estados que uma resposta ainda pode promover — mesma régua de `resposta.ts`. */
const AINDA_SEM_RESPOSTA = new Set(["sent", "delivered", "read"]);

export interface CampanhaDaResposta {
  campanhaId: string;
  nome: string;
  destinatarioId: string;
  pipelineId: string | null;
  stageId: string | null;
  quemAssume: QuemAssume;
  botoes: BotaoDaResposta[];
  /** Ninguém deste destinatário respondeu ainda — esta é a primeira resposta. */
  primeiraResposta: boolean;
}

export interface RespostaPreparada {
  campanha: CampanhaDaResposta;
  botao: BotaoDaResposta | null;
  plano: PlanoDaResposta;
}

export interface EntradaDaResposta {
  organizationId: string;
  contactId: string;
  conversationId: string;
  respostaRapida?: RespostaRapida | null;
  /** `context.id` da mensagem: o `wamid` da nossa mensagem que ela responde. */
  respondendoA?: string | null;
  recebidoEm: Date;
  requestId?: string;
}

type LinhaDoDestinatario = {
  id: string;
  status: string;
  replied_at: string | null;
  campaign_id: string;
  campaigns: {
    name: string;
    pipeline_id: string | null;
    stage_id: string | null;
    quem_assume: string | null;
    botoes_de_resposta: unknown;
  } | null;
};

const COLUNAS_DO_DESTINATARIO =
  "id, status, replied_at, campaign_id, campaigns(name, pipeline_id, stage_id, quem_assume, botoes_de_resposta)";

function campanhaDaLinha(linha: LinhaDoDestinatario | null): CampanhaDaResposta | null {
  if (!linha?.campaigns) return null;
  const c = linha.campaigns;
  const quemAssume = (QUEM_ASSUME as readonly string[]).includes(c.quem_assume ?? "")
    ? (c.quem_assume as QuemAssume)
    : "ia";
  return {
    campanhaId: linha.campaign_id,
    nome: c.name,
    destinatarioId: linha.id,
    pipelineId: c.pipeline_id,
    stageId: c.stage_id,
    quemAssume,
    botoes: lerBotoesDaResposta(c.botoes_de_resposta),
    primeiraResposta: linha.replied_at === null && AINDA_SEM_RESPOSTA.has(linha.status),
  };
}

/** A campanha que esta mensagem responde. `null` em qualquer dúvida — nunca lança. */
export async function campanhaDaResposta(
  admin: SupabaseClient,
  entrada: Pick<
    EntradaDaResposta,
    "organizationId" | "conversationId" | "respondendoA" | "recebidoEm"
  >,
): Promise<CampanhaDaResposta | null> {
  const { organizationId, conversationId, respondendoA, recebidoEm } = entrada;
  try {
    // 1 · Pela mensagem respondida — exato.
    if (respondendoA) {
      const { data: msg } = await admin
        .from("messages")
        .select("id, metadata")
        .eq("organization_id", organizationId)
        .eq("external_id", respondendoA)
        .eq("direction", "outbound")
        .limit(1)
        .maybeSingle();
      const meta = ((msg as { metadata?: unknown } | null)?.metadata ?? {}) as Record<
        string,
        unknown
      >;
      const destinatarioId =
        typeof meta.campaign_recipient_id === "string" ? meta.campaign_recipient_id : null;
      if (destinatarioId) {
        const { data } = await admin
          .from("campaign_recipients")
          .select(COLUNAS_DO_DESTINATARIO)
          .eq("organization_id", organizationId)
          .eq("id", destinatarioId)
          .maybeSingle();
        const campanha = campanhaDaLinha(data as unknown as LinhaDoDestinatario | null);
        if (campanha) return campanha;
      }
    }

    // 2 · Pela conversa, dentro da janela de atribuição. O destinatário vem
    // primeiro: a conversa que não nasceu de campanha (quase todas) para aqui,
    // sem ler a configuração da organização a cada mensagem recebida.
    const { data } = await admin
      .from("campaign_recipients")
      .select(`${COLUNAS_DO_DESTINATARIO}, sent_at`)
      .eq("organization_id", organizationId)
      .eq("conversation_id", conversationId)
      .not("sent_at", "is", null)
      .lte("sent_at", recebidoEm.toISOString())
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const linha = data as unknown as (LinhaDoDestinatario & { sent_at: string }) | null;
    if (!linha) return null;
    const { data: org } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", organizationId)
      .maybeSingle();
    const janelaMs = janelaDeAtribuicaoMs(
      lerConfiguracao((org as { settings?: unknown } | null)?.settings),
    );
    if (recebidoEm.getTime() - new Date(linha.sent_at).getTime() > janelaMs) return null;
    return campanhaDaLinha(linha);
  } catch (err) {
    logger.warn(
      "[resposta-da-campanha] campanha da resposta não lida — a mensagem segue o caminho de sempre",
      {
        organization_id: organizationId,
        conversation_id: conversationId,
        detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
      },
    );
    return null;
  }
}

/** Lê a campanha e decide — sem efeito nenhum. `null` = mensagem que não é resposta de campanha. */
export async function prepararRespostaDaCampanha(
  admin: SupabaseClient,
  entrada: EntradaDaResposta,
): Promise<RespostaPreparada | null> {
  const campanha = await campanhaDaResposta(admin, entrada);
  if (!campanha) return null;
  const botao = botaoClicado(campanha.botoes, entrada.respostaRapida);
  const plano = planejarResposta({
    quemAssume: campanha.quemAssume,
    etapaDaCampanha: campanha.stageId,
    primeiraResposta: campanha.primeiraResposta,
    botao,
  });
  return { campanha, botao, plano };
}

/**
 * Faz o que o plano manda, menos o opt-out (que é do passo 1 da ingestão, antes
 * do lead) e o despacho do agente (que é do último passo). Roda DEPOIS do
 * nascimento do lead: mover e fechar precisam do card.
 */
export async function executarRespostaDaCampanha(
  admin: SupabaseClient,
  entrada: EntradaDaResposta,
  preparada: RespostaPreparada,
): Promise<void> {
  const { campanha, botao, plano } = preparada;
  const log = {
    organization_id: entrada.organizationId,
    conversation_id: entrada.conversationId,
    campaign_id: campanha.campanhaId,
  };
  const ctx: HandlerCtx = {
    organization_id: entrada.organizationId,
    // A mensagem chegou pelo canal e o produto agiu — não foi uma pessoa.
    actor: { type: "webhook_source", id: "resposta-da-campanha" },
    requestId: entrada.requestId ?? `campanha:${campanha.campanhaId}:${entrada.conversationId}`,
  };

  let leadId: string | null = null;
  try {
    if (plano.moverPara)
      leadId = await levarParaAEtapa(admin, ctx, entrada, campanha, plano.moverPara);
    else
      leadId = await negocioAberto(
        admin,
        entrada.organizationId,
        entrada.contactId,
        campanha.pipelineId,
      );
  } catch (err) {
    logger.warn("[resposta-da-campanha] o card não foi para a etapa", {
      ...log,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
  }

  if (leadId && (campanha.primeiraResposta || botao)) {
    await registrarNaTimeline(admin, entrada, campanha, leadId, botao);
  }

  if (plano.marcarPerdido && leadId) {
    try {
      await encerraDemanda(admin, ctx, {
        leadId,
        desfecho: "lost",
        motivo: MOTIVO_DA_PERDA_PELO_BOTAO,
        razaoNaTimeline: `Tocou em "${botao?.botao ?? ""}" na campanha ${campanha.nome}`,
        payloadNaTimeline: { campaign_id: campanha.campanhaId, botao: botao?.botao ?? null },
      });
    } catch (err) {
      logger.warn("[resposta-da-campanha] o negócio não foi fechado como perdido", {
        ...log,
        lead_id: leadId,
        detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
      });
    }
  }

  if (plano.paraHumano) await mandarParaAFila(admin, entrada, log);
}

/**
 * O negócio ABERTO do contato — o do funil da campanha primeiro, senão o mais
 * recente. É o mesmo "um contato, um negócio aberto" da ingestão.
 */
async function negocioAberto(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  pipelinePreferido: string | null,
): Promise<string | null> {
  const linha = await negocioAbertoCompleto(admin, organizationId, contactId, pipelinePreferido);
  return linha?.id ?? null;
}

async function negocioAbertoCompleto(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  pipelinePreferido: string | null,
): Promise<(OrigemParaClonar & { stage_id: string }) | null> {
  const { data, error } = await admin
    .from("crm_leads")
    .select(`${COLUNAS_DA_ORIGEM}, stage_id`)
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  const linhas = (data ?? []) as unknown as Array<OrigemParaClonar & { stage_id: string }>;
  return linhas.find((l) => l.pipeline_id === pipelinePreferido) ?? linhas[0] ?? null;
}

/**
 * O card vai para a etapa: já está lá (nasceu nela agora), move dentro do funil,
 * ou é levado de outro funil. Devolve o negócio que ficou aberto.
 */
async function levarParaAEtapa(
  admin: SupabaseClient,
  ctx: HandlerCtx,
  entrada: EntradaDaResposta,
  campanha: CampanhaDaResposta,
  stageId: string,
): Promise<string | null> {
  const { data: etapa } = await admin
    .from("crm_stages")
    .select("id, pipeline_id, is_archived")
    .eq("organization_id", entrada.organizationId)
    .eq("id", stageId)
    .maybeSingle();
  const alvo = etapa as { id: string; pipeline_id: string; is_archived: boolean } | null;

  const lead = await negocioAbertoCompleto(
    admin,
    entrada.organizationId,
    entrada.contactId,
    alvo?.pipeline_id ?? null,
  );
  if (!lead) return null; // contato bloqueado, ou organização sem funil: a ingestão já registrou o porquê
  // Etapa apagada ou arquivada depois de configurada: o card fica onde está.
  if (!alvo || alvo.is_archived) {
    logger.warn(
      "[resposta-da-campanha] etapa configurada não existe mais — o card fica onde está",
      {
        organization_id: entrada.organizationId,
        campaign_id: campanha.campanhaId,
        stage_id: stageId,
      },
    );
    return lead.id;
  }
  if (lead.stage_id === alvo.id) return lead.id;

  ctx.serviceOrigin = (await observeServiceOrigin(
    admin,
    entrada.organizationId,
    entrada.contactId,
  )) ?? {
    kind: "unavailable",
    reason: "origin_capture_failed",
  };

  if (lead.pipeline_id === alvo.pipeline_id) {
    await moveLeadHandler(admin, ctx, lead.id, { to_stage_id: alvo.id });
    return lead.id;
  }

  const transferencia = await transferirParaFunil(admin, ctx, lead, {
    pipelineId: alvo.pipeline_id,
    stageId: alvo.id,
    razaoNaTimeline: `Levado para o funil da campanha ${campanha.nome}`,
  });
  if (!transferencia.ok) throw new Error(transferencia.error);
  return String(transferencia.clone.id ?? "") || null;
}

async function registrarNaTimeline(
  admin: SupabaseClient,
  entrada: EntradaDaResposta,
  campanha: CampanhaDaResposta,
  leadId: string,
  botao: BotaoDaResposta | null,
): Promise<void> {
  const resultado = await emitLeadActivity(admin, {
    organizationId: entrada.organizationId,
    leadId,
    contactId: entrada.contactId,
    type: ATIVIDADE_RESPOSTA_DA_CAMPANHA,
    sourceModule: "campaigns",
    sourceId: campanha.campanhaId,
    actor: { type: "webhook_source", id: "resposta-da-campanha" },
    reason: botao
      ? `Tocou em "${botao.botao}" na campanha ${campanha.nome}`
      : `Respondeu à campanha ${campanha.nome}`,
    payload: {
      campaign_id: campanha.campanhaId,
      campaign_name: campanha.nome,
      campaign_recipient_id: campanha.destinatarioId,
      conversation_id: entrada.conversationId,
      ...(botao ? { botao: botao.botao, acao: botao.acao } : {}),
    },
  });
  if (!resultado.ok) {
    logger.warn("[resposta-da-campanha] linha da timeline não gravada", {
      organization_id: entrada.organizationId,
      lead_id: leadId,
      detail: resultado.error?.slice(0, 160),
    });
  }
}

/**
 * A IA fica calada NESTA conversa e ela vai para a fila de atendentes.
 *
 * O silêncio é o mesmo da pausa durável do atendimento manual — e por isso
 * "devolver ao automático" na tela de atendimento o desfaz, sem caminho novo.
 * A fila é o pedido de rodízio do banco (`fn_request_channel_routing`): quem
 * distribui é o worker de roteamento, pelas regras da organização.
 */
async function mandarParaAFila(
  admin: SupabaseClient,
  entrada: EntradaDaResposta,
  log: Record<string, unknown>,
): Promise<void> {
  await pausarIaDuravelmente(admin, {
    organizationId: entrada.organizationId,
    conversationId: entrada.conversationId,
    motivo: MOTIVO_FILA_DA_CAMPANHA,
    canal: "campanha",
    agora: entrada.recebidoEm,
  });
  const { error } = await admin.rpc(
    "fn_request_channel_routing" as never,
    {
      p_org: entrada.organizationId,
      p_conversation: entrada.conversationId,
    } as never,
  );
  if (error) {
    logger.warn("[resposta-da-campanha] pedido de fila não gravado", {
      ...log,
      detail: (error as { message?: string }).message?.slice(0, 160),
    });
  }
}

/**
 * As etapas dos botões "mover para etapa" existem NESTA organização e não estão
 * arquivadas? O mapa é `jsonb` e não tem FK — sem esta conferência na rota, um
 * id de etapa de outro tenant seria gravado (e recusado só na hora do clique).
 * Devolve a frase da recusa, ou `null` quando está tudo certo.
 */
export async function recusaDasEtapasDosBotoes(
  admin: SupabaseClient,
  organizationId: string,
  botoes: readonly BotaoDaResposta[] | undefined,
): Promise<string | null> {
  const ids = [...new Set((botoes ?? []).map((b) => b.stage_id).filter((v): v is string => !!v))];
  if (ids.length === 0) return null;
  const { data, error } = await admin
    .from("crm_stages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_archived", false)
    .in("id", ids);
  if (error) return "Não foi possível conferir as etapas dos botões. Tente de novo.";
  const achadas = new Set(((data ?? []) as Array<{ id: string }>).map((e) => e.id));
  return ids.every((id) => achadas.has(id))
    ? null
    : "Um dos botões aponta para uma etapa que não existe mais neste CRM. Escolha a etapa de novo.";
}

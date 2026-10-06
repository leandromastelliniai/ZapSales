/**
 * A campanha que fez esta conversa existir — e o que ela decide sobre o card.
 *
 * ═══ Duas coisas, e só elas ═══
 *
 * 1. ONDE o card nasce. Hoje quem decide é o número (`crm_pipelines.
 *    channel_session_id`, migration 0262). A campanha, quando declara funil,
 *    VENCE — decisão do dono (2026-09-19): é a escolha mais específica, e quem
 *    montou a campanha sabe o que quer medir. Sem declarar, nada muda.
 * 2. DE ONDE ele veio. O card nasce marcado com a campanha, e é isso que
 *    transforma "taxa de resposta" em "quanto isso vendeu" — sem a marca, os
 *    cards que a campanha gerou ficam indistinguíveis dos que chegaram sozinhos.
 *
 * ═══ Por que a origem da campanha vence a do anúncio ═══
 *
 * O contato pode carregar atribuição de anúncio do primeiro toque dele. Mas
 * esta conversa nasceu porque NÓS falamos com ele: a origem deste negócio é a
 * campanha, não o anúncio que o trouxe meses atrás. O contato mantém a dele —
 * quem copia é o lead, e ele copia o que é verdade sobre o próprio nascimento.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OrigemDeCampanha {
  campanhaId: string;
  nome: string;
  pipelineId: string | null;
  stageId: string | null;
}

/**
 * A campanha que criou ESTA conversa, se houver.
 *
 * Nunca lança: erro de consulta devolve `null` e o card nasce pela régua do
 * número. Um defeito aqui não pode impedir o lead de existir — perder o card é
 * perder a venda, e a marcação de origem é o acessório, não o principal.
 */
export async function origemDeCampanhaDaConversa(
  db: SupabaseClient,
  organizationId: string,
  conversationId: string | null | undefined,
): Promise<OrigemDeCampanha | null> {
  if (!conversationId) return null;
  try {
    const { data, error } = await db
      .from("campaign_recipients")
      .select("campaign_id, campaigns(name, pipeline_id, stage_id)")
      .eq("organization_id", organizationId)
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;

    const linha = data as unknown as {
      campaign_id: string;
      campaigns: { name: string; pipeline_id: string | null; stage_id: string | null } | null;
    };
    if (!linha.campaigns) return null;
    return {
      campanhaId: linha.campaign_id,
      nome: linha.campaigns.name,
      pipelineId: linha.campaigns.pipeline_id,
      stageId: linha.campaigns.stage_id,
    };
  } catch {
    return null;
  }
}

/** O que vai para `crm_leads.source` e `source_metadata` quando veio de campanha. */
export function marcaDaOrigem(origem: OrigemDeCampanha): {
  source: string;
  source_metadata: Record<string, unknown>;
} {
  return {
    // Vocabulário ABERTO (`crm_leads.source` não tem CHECK, pela doutrina de
    // clone): a constante vive aqui e ninguém escreve a string literal solta.
    source: ORIGEM_CAMPANHA,
    source_metadata: { campaign_id: origem.campanhaId, campaign_name: origem.nome },
  };
}

export const ORIGEM_CAMPANHA = "campanha";

/**
 * O tipo da linha da timeline "Respondeu à campanha" (issue #11). Vocabulário
 * ABERTO de `crm_lead_activities.type`: emissor e leitor usam esta constante.
 */
export const ATIVIDADE_RESPOSTA_DA_CAMPANHA = "campaign_replied" as const;

/** O que a conversa mostra sobre a campanha que a originou (issue #11). */
export interface CampanhaDaConversa {
  campanha: { id: string; nome: string };
  modelo: { nome: string; idioma: string } | null;
  enviada_em: string | null;
  respondida_em: string | null;
}

/**
 * A campanha que fez o CARD nascer, lida da marca de origem — `null` quando o
 * negócio não nasceu de campanha. Pura: o dossiê e o card leem daqui, e nenhum
 * deles abre `source_metadata` por caminho solto.
 */
export function campanhaDaMarca(
  source: string | null | undefined,
  sourceMetadata: Record<string, unknown> | null | undefined,
): { id: string | null; nome: string } | null {
  if (source !== ORIGEM_CAMPANHA) return null;
  const nome = sourceMetadata?.campaign_name;
  if (typeof nome !== "string" || nome.trim() === "") return null;
  const id = sourceMetadata?.campaign_id;
  return { id: typeof id === "string" ? id : null, nome };
}

/**
 * A campanha do negócio que JÁ existia quando a pessoa respondeu: ele não nasceu
 * dela (a marca é outra), mas foi movido por ela, e a linha "Respondeu à
 * campanha" mais recente diz qual. Pura, sobre as linhas que o dossiê já tem.
 */
export function campanhaDaUltimaResposta(
  itens: ReadonlyArray<{ type: string; payload: Record<string, unknown> | null; performed_at: string }>,
): { id: string | null; nome: string } | null {
  let melhor: { quando: string; id: string | null; nome: string } | null = null;
  for (const item of itens) {
    if (item.type !== ATIVIDADE_RESPOSTA_DA_CAMPANHA) continue;
    const nome = item.payload?.campaign_name;
    if (typeof nome !== "string" || nome.trim() === "") continue;
    if (melhor && melhor.quando >= item.performed_at) continue;
    const id = item.payload?.campaign_id;
    melhor = { quando: item.performed_at, id: typeof id === "string" ? id : null, nome };
  }
  return melhor ? { id: melhor.id, nome: melhor.nome } : null;
}

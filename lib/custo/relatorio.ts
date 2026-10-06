/**
 * O RELATÓRIO DE CUSTO da campanha oficial (issue #10): a estimativa antes do
 * disparo, o que a Meta cobrou, o que a IA custou, o custo por lead que
 * respondeu e as conversas que vieram de anúncio (janela grátis).
 *
 * ═══ De onde sai cada número ═══
 *
 * - estimativa: a tabela de preços × os telefones elegíveis do snapshot, pela
 *   categoria do modelo (`./estimativa.ts`) — a mesma função da prévia;
 * - Meta: `meta_message_costs` da campanha (real onde o webhook chegou,
 *   estimado onde ainda não);
 * - IA: `llm_calls` do contato de cada destinatário entre o envio e o fim da
 *   janela de atribuição de resposta — a mesma janela que decide "respondeu";
 *   está em centavos de dólar e é convertida pela cotação da instalação;
 * - por lead: (Meta + IA) ÷ quem respondeu. Sem resposta, `null`, nunca 0.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { lerConfiguracao } from "@/lib/campanhas/configuracao";
import { carregarModelo } from "@/lib/campanhas/modelo-da-campanha";

import { carregarCotacao } from "./cotacao";
import { estimarCusto, type EstimativaDeCusto } from "./estimativa";
import { carregarTabela, categoriaDoModelo } from "./tabela-de-precos";

/** Teto de linhas lidas para a estimativa, como o das métricas. Acima dele a resposta se declara parcial. */
const TETO_DE_LINHAS = 20_000;

export interface RelatorioDeCusto {
  oficial: boolean;
  estimativa: EstimativaDeCusto | null;
  /** A lista passou do teto de leitura: a estimativa conta só os primeiros. */
  estimativa_parcial: boolean;
  teto_gasto_cents: number | null;
  meta_cents: number;
  /** A parte de `meta_cents` cujo `pricing` ainda não chegou. */
  meta_estimado_cents: number;
  mensagens_com_custo: number;
  mensagens_sem_preco: number;
  ia_cents: number;
  ia_usd_cents: number;
  cotacao_usd_brl: number;
  cotacao_de_referencia: boolean;
  total_cents: number;
  responderam: number;
  custo_por_lead_que_respondeu_cents: number | null;
  conversas_de_anuncio: number;
  currency: "BRL";
}

export async function relatorioDeCusto(
  admin: SupabaseClient,
  organizationId: string,
  campanhaId: string,
): Promise<RelatorioDeCusto | null> {
  const { data: c } = await admin
    .from("campaigns")
    .select("id, meta_template_id, teto_gasto_cents")
    .eq("organization_id", organizationId)
    .eq("id", campanhaId)
    .maybeSingle();
  const campanha = c as { id: string; meta_template_id: string | null; teto_gasto_cents: unknown } | null;
  if (!campanha) return null;

  const [{ data: org }, cotacao, tabela] = await Promise.all([
    admin.from("organizations").select("settings").eq("id", organizationId).maybeSingle(),
    carregarCotacao(admin),
    carregarTabela(admin),
  ]);
  const janelaHoras = lerConfiguracao((org as { settings?: unknown } | null)?.settings).atribuicao_horas;

  let estimativa: EstimativaDeCusto | null = null;
  let estimativaParcial = false;
  if (campanha.meta_template_id) {
    const modelo = await carregarModelo(admin, organizationId, campanha.meta_template_id);
    const { data: linhas } = await admin
      .from("campaign_recipients")
      .select("recipient_address")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campanhaId)
      .eq("eligibility_status", "eligible")
      .limit(TETO_DE_LINHAS);
    estimativaParcial = (linhas ?? []).length >= TETO_DE_LINHAS;
    const telefones = ((linhas ?? []) as Array<{ recipient_address: string | null }>)
      .map((l) => l.recipient_address ?? "")
      .filter((t) => t !== "");
    estimativa = estimarCusto(telefones, categoriaDoModelo(modelo?.category), tabela);
  }

  const { data } = await admin.rpc("fn_custo_da_campanha", {
    p_org: organizationId,
    p_campaign: campanhaId,
    p_janela_horas: janelaHoras,
  });
  const r = ((Array.isArray(data) ? data[0] : data) ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => Number(v ?? 0);
  const meta = n(r.meta_cents);
  const iaUsd = n(r.ia_usd_cents);
  const ia = iaUsd * cotacao.valor;
  const responderam = n(r.responderam);
  const total = meta + ia;
  const teto = campanha.teto_gasto_cents === null ? null : Number(campanha.teto_gasto_cents);

  return {
    oficial: !!campanha.meta_template_id,
    estimativa,
    estimativa_parcial: estimativaParcial,
    teto_gasto_cents: teto,
    meta_cents: meta,
    meta_estimado_cents: n(r.meta_estimado_cents),
    mensagens_com_custo: n(r.mensagens_com_custo),
    mensagens_sem_preco: n(r.mensagens_sem_preco),
    ia_cents: ia,
    ia_usd_cents: iaUsd,
    cotacao_usd_brl: cotacao.valor,
    cotacao_de_referencia: cotacao.referencia,
    total_cents: total,
    responderam,
    custo_por_lead_que_respondeu_cents: responderam > 0 ? total / responderam : null,
    conversas_de_anuncio: n(r.conversas_de_anuncio),
    currency: "BRL",
  };
}

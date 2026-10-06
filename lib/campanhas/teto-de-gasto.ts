/**
 * O TETO DE GASTO da campanha oficial (issue #10): quanto a rodada ainda pode
 * reservar, e a pausa com motivo quando não cabe mais nada.
 *
 * Dois tetos: o da CAMPANHA (`campaigns.teto_gasto_cents`) e o MENSAL da
 * organização (`settings.campanhas.teto_gasto_mensal_cents`, no mês do fuso da
 * organização). Vale o menor. O que conta contra eles é o comprometido
 * (`fn_custo_comprometido`): custo registrado, real ou estimado, mais os
 * reservados em voo — e a reserva de verdade refaz a conta com a organização
 * travada (`fn_campanha_reservar_lote_no_teto`), para dois lotes simultâneos não
 * passarem juntos do teto.
 *
 * O preço de referência de quem ainda não tem custo é o MAIOR da categoria na
 * tabela: na dúvida sobre o país, o teto erra para o lado de gastar menos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { fusoDaJanela } from "@/lib/agent-engine/pacing/store";
import { audit } from "@/lib/audit";
import { inicioDoMesNoFuso } from "@/lib/custo/atendimento-gratis";
import { emReais } from "@/lib/custo/formato";
import {
  carregarTabela,
  categoriaDoModelo,
  maiorPreco,
  ROTULO_DA_CATEGORIA,
  type LinhaDePreco,
} from "@/lib/custo/tabela-de-precos";
import { mensagensQueCabem } from "@/lib/custo/teto";

import { lerConfiguracao } from "./configuracao";

/**
 * Por que o SISTEMA pausou a campanha — o mesmo vocabulário do CHECK
 * `campaigns_pausa_motivo_check` (migration 0540). Os seis primeiros são da
 * issue #9 (qualidade do número, modelo, aceite do risco); `teto_de_gasto` é
 * desta. Nulo no banco = pausa manual ou nenhuma.
 */
export const MOTIVOS_DA_PAUSA = [
  "qualidade_vermelha",
  "modelo_rejeitado",
  "modelo_pausado",
  "modelo_desativado",
  "modelo_recategorizado",
  "risco_nao_aceito",
  "teto_de_gasto",
] as const;
export type MotivoDaPausa = (typeof MOTIVOS_DA_PAUSA)[number];

export interface TetoDaRodada {
  /** Quantas mensagens ainda cabem nos dois tetos (Infinity = sem teto). */
  cabem: number;
  /** Qual teto acabou, quando `cabem === 0`. */
  esgotado: "campanha" | "organizacao" | null;
  /** Os parâmetros da reserva travada. `null` = sem teto: reserva como sempre. */
  reserva: {
    p_preco: number;
    p_teto_campanha: number | null;
    p_teto_organizacao: number | null;
    p_inicio_do_mes: string;
  } | null;
  tabela: LinhaDePreco[];
  detalhe: string | null;
}

export async function tetoDaRodada(
  admin: SupabaseClient,
  campanha: { id: string; organization_id: string; teto_gasto_cents: number | string | null },
  categoriaDoModeloMeta: string | null,
  agora: Date,
): Promise<TetoDaRodada> {
  const tabela = await carregarTabela(admin);
  const { data: org } = await admin
    .from("organizations")
    .select("timezone, settings")
    .eq("id", campanha.organization_id)
    .maybeSingle();
  const o = org as { timezone?: string | null; settings?: unknown } | null;
  const tetoCampanha = campanha.teto_gasto_cents === null ? null : Number(campanha.teto_gasto_cents);
  const tetoOrg = lerConfiguracao(o?.settings).teto_gasto_mensal_cents;
  const categoria = categoriaDoModelo(categoriaDoModeloMeta);
  const preco = maiorPreco(categoria, tabela);
  // Sem teto, ou categoria de preço zero: não há o que medir.
  if ((tetoCampanha === null && tetoOrg === null) || preco === 0) {
    return { cabem: Infinity, esgotado: null, reserva: null, tabela, detalhe: null };
  }
  // Há teto e a tabela não tem preço para a categoria: sem preço o teto não
  // mede, e seguir enviando seria prometer um teto que ninguém confere.
  if (preco === null) {
    return {
      cabem: 0,
      esgotado: tetoCampanha !== null ? "campanha" : "organizacao",
      reserva: null,
      tabela,
      detalhe:
        `Há teto de gasto, mas a tabela de preços da Meta não tem preço para ${ROTULO_DA_CATEGORIA[categoria].toLowerCase()}: ` +
        "sem o preço não dá para garantir o teto. Peça a quem administra a instalação para completar a tabela em Painel › Preços da Meta.",
    };
  }

  const inicio = inicioDoMesNoFuso(agora, fusoDaJanela(null, o?.timezone ?? null));
  const { data } = await admin.rpc("fn_custo_comprometido", {
    p_org: campanha.organization_id,
    p_campaign: campanha.id,
    p_desde: inicio.toISOString(),
    p_preco: preco,
  });
  const linha = ((Array.isArray(data) ? data[0] : data) ?? {}) as { da_campanha?: unknown; da_organizacao?: unknown };
  const daCampanha = Number(linha.da_campanha ?? 0);
  const daOrganizacao = Number(linha.da_organizacao ?? 0);
  const naCampanha = mensagensQueCabem(tetoCampanha, daCampanha, preco);
  const naOrganizacao = mensagensQueCabem(tetoOrg, daOrganizacao, preco);
  const cabem = Math.min(naCampanha, naOrganizacao);

  let esgotado: TetoDaRodada["esgotado"] = null;
  let detalhe: string | null = null;
  if (cabem === 0) {
    if (naCampanha === 0) {
      esgotado = "campanha";
      detalhe =
        `A campanha atingiu o teto de gasto: ${emReais(daCampanha)} de ${emReais(tetoCampanha!)}. ` +
        "Aumente o teto da campanha para retomar.";
    } else {
      esgotado = "organizacao";
      detalhe =
        `A empresa atingiu o teto de gasto do mês: ${emReais(daOrganizacao)} de ${emReais(tetoOrg!)}. ` +
        "Aumente o teto mensal em Campanhas › Configuração ou espere o mês virar para retomar.";
    }
  }
  return {
    cabem,
    esgotado,
    reserva: {
      p_preco: preco,
      p_teto_campanha: tetoCampanha,
      p_teto_organizacao: tetoOrg,
      p_inicio_do_mes: inicio.toISOString(),
    },
    tabela,
    detalhe,
  };
}

/**
 * Pausa a campanha em andamento com o motivo e a frase que a tela mostra.
 * Compare-and-set: só quem ainda está `running` pausa, e só uma vez audita.
 */
export async function pausarPorTeto(
  admin: SupabaseClient,
  organizationId: string,
  campanhaId: string,
  detalhe: string,
  agora: Date,
): Promise<boolean> {
  const motivo: MotivoDaPausa = "teto_de_gasto";
  const { data } = await admin
    .from("campaigns")
    .update({ status: "paused", paused_at: agora.toISOString(), pausa_motivo: motivo, pausa_detalhe: detalhe })
    .eq("organization_id", organizationId)
    .eq("id", campanhaId)
    .eq("status", "running")
    .select("id");
  const pausou = (data ?? []).length > 0;
  if (pausou) {
    void audit({
      action: "campaign.auto_paused",
      organizationId,
      resourceType: "campaign",
      resourceId: campanhaId,
      metadata: { motivo },
    });
  }
  return pausou;
}

/**
 * A COTAÇÃO DO DÓLAR que soma o custo de IA ao da Meta (issue #10).
 *
 * O CRM registra o custo de IA em centavos de DÓLAR (`llm_calls.cost_cents`,
 * preço dos provedores), e a Meta cobra em reais. Somar os dois exige uma
 * cotação, e ela é da instalação: `platform_settings.cotacao_usd_brl`, editada
 * no mesmo painel da tabela de preços.
 *
 * Nula = a REFERÊNCIA abaixo. Ela é um ponto de partida declarado, não uma
 * cotação do dia: o painel mostra que é a referência e convida a trocar. Sem
 * ela, uma instalação recém-feita mostraria o custo por lead sem a IA — um
 * número menor que o real, que é o pior lado para errar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const COTACAO_DE_REFERENCIA = 5.4;

/** Nunca lança: cotação ilegível é a referência. */
export async function carregarCotacao(admin: SupabaseClient): Promise<{ valor: number; referencia: boolean }> {
  const { data } = await admin.from("platform_settings").select("cotacao_usd_brl").eq("id", 1).maybeSingle();
  const v = Number((data as { cotacao_usd_brl?: unknown } | null)?.cotacao_usd_brl);
  return Number.isFinite(v) && v > 0 ? { valor: v, referencia: false } : { valor: COTACAO_DE_REFERENCIA, referencia: true };
}

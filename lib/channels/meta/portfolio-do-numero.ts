/**
 * O PORTFÓLIO de um número oficial já conectado, descoberto depois (issue #9).
 *
 * A conexão grava `meta_portfolio_id` (`conectarNumeroOficial`), mas o número
 * conectado ANTES desta coluna existir fica sem ele — e sem ele duas
 * organizações do mesmo portfólio não se enxergam, e cada uma gasta o limite
 * inteiro. O motor de campanhas pergunta aqui antes de contar o limite: com a
 * credencial do próprio número, lê o dono da WABA e grava.
 *
 * Melhor esforço, e com freio: a rodada oficial roda a cada poucos segundos, e
 * uma Graph que não responde não pode virar uma chamada por rodada. Uma
 * tentativa por número por hora, por processo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import { lerPortfolioDaConta } from "./conexao-guiada";
import { resolveMetaCreds } from "./credentials";

const INTERVALO_ENTRE_TENTATIVAS_MS = 60 * 60_000;
const ultimaTentativa = new Map<string, number>();

export interface NumeroSemPortfolio {
  id: string;
  organization_id: string;
  meta_phone_number_id: string | null;
  meta_waba_id: string | null;
}

/**
 * Lê o portfólio da WABA do número e o grava. Devolve o portfólio, ou `null`
 * quando não deu (sem credencial, Graph fora, freio da última hora). Nunca lança.
 */
export async function descobrirPortfolioDoNumero(
  admin: SupabaseClient,
  numero: NumeroSemPortfolio,
  agora: Date = new Date(),
): Promise<string | null> {
  if (!numero.meta_phone_number_id || !numero.meta_waba_id) return null;
  const antes = ultimaTentativa.get(numero.id);
  if (antes !== undefined && agora.getTime() - antes < INTERVALO_ENTRE_TENTATIVAS_MS) return null;
  ultimaTentativa.set(numero.id, agora.getTime());
  try {
    const creds = await resolveMetaCreds(admin, {
      organizationId: numero.organization_id,
      phoneNumberId: numero.meta_phone_number_id,
    });
    if (!creds) return null;
    const portfolio = await lerPortfolioDaConta({ wabaId: numero.meta_waba_id, token: creds.token });
    if (!portfolio) return null;
    const { error } = await admin
      .from("channel_sessions")
      .update({ meta_portfolio_id: portfolio })
      .eq("organization_id", numero.organization_id)
      .eq("id", numero.id)
      .is("meta_portfolio_id", null);
    if (error) {
      logger.warn("[meta.portfolio] portfólio lido e não gravado", { codigo: error.code, sessao: numero.id });
    }
    return portfolio;
  } catch (err) {
    logger.warn("[meta.portfolio] não deu para descobrir o portfólio do número", {
      sessao: numero.id,
      motivo: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

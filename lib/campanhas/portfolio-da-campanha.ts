/**
 * O limite do portfólio de UMA campanha, lido do banco (issue #9). A regra de
 * quem divide o limite é pura e mora em `./portfolio.ts`; a conta de contatos
 * alcançados mora no banco (`fn_portfolio_contatos_alcancados`, 0539), a mesma
 * que a reserva do lote usa — a tela e o motor leem o mesmo número.
 *
 * ─── A leitura entre organizações ───────────────────────────────────────────
 *
 * Admin client SEM filtro de organização na leitura dos números, e é a exceção
 * declarada à regra do service role: o limite é da Meta, por portfólio, e um
 * portfólio pode ter números de mais de uma organização desta instalação (ver
 * `./portfolio.ts`). Sai daqui só o que a conta precisa — id, organização,
 * WABA, portfólio e faixa dos números oficiais —, e para fora só vão o teto e a
 * contagem. Nenhum contato, mensagem ou campanha de outra organização.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { CHANNEL_PROVIDER_META } from "@/lib/channels/capabilities";
import { descobrirPortfolioDoNumero } from "@/lib/channels/meta/portfolio-do-numero";

import { portfolioDoNumero, type NumeroDoPortfolio, type PortfolioDoNumero } from "./portfolio";

/**
 * O portfólio do número principal da campanha — todos os números do pool são da
 * conta do modelo, e a conta é de um portfólio só. Entram os números oficiais
 * arquivados também: o que eles mandaram nas últimas 24 h ainda conta no limite.
 */
export async function portfolioDaCampanha(
  admin: SupabaseClient,
  campanha: { channel_session_id: string },
): Promise<PortfolioDoNumero> {
  const { data } = await admin
    .from("channel_sessions")
    .select("id, organization_id, meta_waba_id, meta_portfolio_id, meta_limite_de_mensagens, meta_phone_number_id")
    .eq("provider", CHANNEL_PROVIDER_META);
  const numeros = (data ?? []) as Array<NumeroDoPortfolio & { meta_phone_number_id: string | null }>;

  // Número conectado antes da coluna existir: sem o portfólio, ele não enxerga o
  // número de OUTRA organização do mesmo portfólio, e os dois gastariam o limite
  // inteiro cada um. Descobre-se na Meta antes de contar (com freio por hora).
  const alvo = numeros.find((n) => n.id === campanha.channel_session_id);
  if (alvo && !alvo.meta_portfolio_id) {
    const descoberto = await descobrirPortfolioDoNumero(admin, alvo);
    if (descoberto) alvo.meta_portfolio_id = descoberto;
  }
  return portfolioDoNumero(numeros, campanha.channel_session_id);
}

export interface UsoDoPortfolio {
  /** Contatos alcançados por modelo nas últimas 24 h, no portfólio inteiro. */
  alcancados: number;
  /** O teto em contatos por 24 h; `null` = ilimitado. */
  teto: number | null;
  /** A faixa da Meta que deu o teto; `null` quando valeu a inicial. */
  limite: string | null;
}

/** O uso do limite agora, para a tela da campanha. `null` = não deu para ler. */
export async function usoDoPortfolio(
  admin: SupabaseClient,
  campanha: { channel_session_id: string },
  agora: Date = new Date(),
): Promise<UsoDoPortfolio | null> {
  const portfolio = await portfolioDaCampanha(admin, campanha);
  const { data, error } = await admin.rpc("fn_portfolio_contatos_alcancados", {
    p_sessoes: portfolio.sessoes,
    p_agora: agora.toISOString(),
  });
  if (error || typeof data !== "number") return null;
  return {
    alcancados: data,
    teto: Number.isFinite(portfolio.teto) ? portfolio.teto : null,
    limite: portfolio.limite,
  };
}

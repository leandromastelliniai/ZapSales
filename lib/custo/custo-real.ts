/**
 * O CUSTO REAL de uma mensagem (issue #10), a partir do `pricing` que a Meta
 * manda no webhook de status:
 *
 *   pricing: { billable, pricing_model: "PMP", type, category }
 *
 * ═══ Quem decide o quê ═══
 *
 * A META decide SE cobra (`billable`) e em que categoria (`category`) — inclusive
 * quando recategoriza um modelo, ou quando a mensagem cai nas 1.000 de atendimento
 * grátis do mês. A TABELA decide QUANTO, porque o webhook não traz valor. Por
 * isso não há regra de gratuidade aqui: replicar a regra da Meta seria a segunda
 * fonte que um dia discorda da fatura.
 *
 * Puro: nada aqui toca banco nem rede.
 */
import { z } from "zod";

import { ehCategoriaDePreco, precoPara, type CategoriaDePreco, type LinhaDePreco } from "./tabela-de-precos";

const pricingSchema = z.object({
  billable: z.boolean().optional(),
  pricing_model: z.string().optional(),
  type: z.string().optional(),
  category: z.string(),
});

/**
 * A conversa veio de um anúncio Click-to-WhatsApp: a Meta abre uma janela grátis.
 * `free_entry_point` é o `type` do modelo por mensagem; `referral_conversion` é a
 * categoria do modelo antigo, que ainda chega em contas migradas.
 */
const ANUNCIO = { tipo: "free_entry_point", categoria: "referral_conversion" } as const;

export interface CustoDaMensagem {
  billable: boolean;
  /** Categoria da Meta, crua quando fora das quatro de cobrança (ex.: `referral_conversion`). */
  category: string;
  pricing_type: string | null;
  country: string | null;
  unit_price_cents: number | null;
  /** `null` = cobrável sem preço na tabela: desconhecido, nunca zero. */
  cost_cents: number | null;
  currency: string;
  janela_gratis_de_anuncio: boolean;
}

export function custoDaMensagem(
  pricing: unknown,
  telefone: string,
  tabela: readonly LinhaDePreco[],
): CustoDaMensagem | null {
  const p = pricingSchema.safeParse(pricing);
  if (!p.success) return null;
  const { category, type } = p.data;
  const janelaDeAnuncio = type === ANUNCIO.tipo || category === ANUNCIO.categoria;
  // Sem `billable` explícito, a categoria de anúncio é grátis e o resto, cobrado.
  const billable = p.data.billable ?? !janelaDeAnuncio;
  const linha = ehCategoriaDePreco(category) ? precoPara(telefone, category as CategoriaDePreco, tabela) : null;
  return {
    billable,
    category,
    pricing_type: type ?? null,
    country: linha?.country ?? null,
    unit_price_cents: linha?.unit_price_cents ?? null,
    cost_cents: !billable ? 0 : (linha?.unit_price_cents ?? null),
    currency: linha?.currency ?? "BRL",
    janela_gratis_de_anuncio: janelaDeAnuncio,
  };
}

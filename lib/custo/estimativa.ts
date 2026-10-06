/**
 * A ESTIMATIVA antes do disparo (issue #10): quanto o público escolhido vai custar
 * pela tabela da Meta.
 *
 * É a mesma função para a prévia (público ainda não congelado) e para a campanha
 * preparada (o snapshot): estimativa que mede por outro caminho é estimativa que
 * mente, e a mentira só aparece na fatura.
 *
 * Quem não tem preço na tabela (país sem linha) é CONTADO à parte, nunca somado a
 * zero: "R$ 32,17" para uma lista em que metade é de Portugal seria um número
 * bonito e falso.
 */
import { precoPara, type CategoriaDePreco, type LinhaDePreco } from "./tabela-de-precos";

export interface EstimativaDeCusto {
  categoria: CategoriaDePreco;
  mensagens: number;
  total_cents: number;
  currency: string;
  /** Destinatários de país sem linha na tabela. */
  sem_preco: number;
  por_pais: Array<{ country: string; quantidade: number; unit_price_cents: number; subtotal_cents: number }>;
}

export function estimarCusto(
  telefones: readonly string[],
  categoria: CategoriaDePreco,
  tabela: readonly LinhaDePreco[],
): EstimativaDeCusto {
  const porPais = new Map<string, { country: string; quantidade: number; unit_price_cents: number; subtotal_cents: number }>();
  let semPreco = 0;
  let total = 0;
  let moeda = "BRL";
  for (const tel of telefones) {
    const linha = precoPara(tel, categoria, tabela);
    if (!linha) {
      semPreco += 1;
      continue;
    }
    moeda = linha.currency;
    total += linha.unit_price_cents;
    const p = porPais.get(linha.country) ?? {
      country: linha.country,
      quantidade: 0,
      unit_price_cents: linha.unit_price_cents,
      subtotal_cents: 0,
    };
    p.quantidade += 1;
    p.subtotal_cents += linha.unit_price_cents;
    porPais.set(linha.country, p);
  }
  return {
    categoria,
    mensagens: telefones.length,
    total_cents: total,
    currency: moeda,
    sem_preco: semPreco,
    por_pais: [...porPais.values()],
  };
}

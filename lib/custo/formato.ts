/**
 * Dinheiro em reais para a tela, a partir de centavos (`_cents`).
 *
 * O espaço depois de `R$` é o comum, não o não-separável que o `style:
 * "currency"` do Intl põe: a mesma frase vai para o banco (`pausa_detalhe`), para
 * o audit e para a tela, e um espaço invisível diferente faz busca e teste
 * discordarem do que a pessoa lê.
 */
export function emReais(cents: number, casas = 2): string {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
}

/** Preço unitário da tabela da Meta: quatro casas (R$ 0,3217). */
export function precoUnitario(cents: number): string {
  return emReais(cents, 4);
}

/** O que a pessoa digita em reais ("1.234,56" ou "1234.56") em centavos; vazio = `null`. */
export function centavosDoTexto(texto: string): number | null {
  const limpo = texto.trim().replace(/\s|R\$/g, "");
  if (limpo === "") return null;
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const reais = Number(normalizado);
  return Number.isFinite(reais) && reais > 0 ? Math.round(reais * 10_000) / 100 : null;
}

/** Centavos para o campo de texto em reais ("12,50"); `null` = vazio. */
export function textoDosCentavos(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

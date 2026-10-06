/**
 * O TETO DE GASTO (issue #10): quantas mensagens ainda cabem sem estourar.
 *
 * Dois tetos, o da campanha e o mensal da empresa; a rodada pergunta aos dois e
 * fica com o menor. `comprometido` é o que já saiu (custo real quando o webhook
 * chegou, estimativa quando ainda não) MAIS o que está em voo — por isso a régua
 * nunca deixa passar do teto: o que pode custar é contado antes de sair.
 */

/** Folga contra erro de ponto flutuante: 96,51 − 64,34 tem de caber 1 × 32,17. */
const EPSILON = 1e-6;

export function mensagensQueCabem(
  tetoCents: number | null,
  comprometidoCents: number,
  precoUnitarioCents: number,
): number {
  if (tetoCents === null || precoUnitarioCents <= 0) return Infinity;
  const folga = tetoCents - comprometidoCents;
  if (folga <= EPSILON) return 0;
  return Math.max(0, Math.floor(folga / precoUnitarioCents + EPSILON));
}

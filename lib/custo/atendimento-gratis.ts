/**
 * As 1.000 MENSAGENS DE ATENDIMENTO GRÁTIS do mês, por número (issue #10).
 *
 * Desde 01/10/2026 a Meta cobra mensagem de atendimento depois das 1.000 grátis
 * do mês de cada número. Quem decide se UMA mensagem foi grátis é a própria Meta,
 * no `pricing` do webhook (`./custo-real.ts`); o que o produto faz é CONTAR, para
 * o gestor saber antes da fatura: aviso na Central em 80% e em 100%.
 *
 * O mês é o do FUSO DA CONTA: a virada às 21h do dia 30 em UTC não pode zerar o
 * contador de quem ainda está no dia 30 em São Paulo.
 */
import { monthStartInTz } from "@/lib/agent-engine/pacing/engine";

export const GRATIS_POR_MES = 1000;

/** Os limiares do aviso, em % das grátis. */
const LIMIARES = [80, 100] as const;
export type LimiarDoAtendimentoGratis = (typeof LIMIARES)[number];

export function inicioDoMesNoFuso(agora: Date, fuso: string): Date {
  return monthStartInTz(agora, fuso);
}

/**
 * O MAIOR limiar que a contagem do mês já alcançou, ou `null`.
 *
 * Não é "cruzou agora?" (antes < marca ≤ depois): dois webhooks simultâneos que
 * gravam a 800ª e a 801ª podem ler os dois 801, e nenhum dos dois "cruzaria" o
 * 800 — o aviso de 80% se perderia para sempre. O "uma vez por limiar" mora no
 * banco (índice único do aviso por número, mês e limiar), não nesta conta.
 */
export function limiarAtingido(usadas: number): LimiarDoAtendimentoGratis | null {
  let atingido: LimiarDoAtendimentoGratis | null = null;
  for (const pct of LIMIARES) {
    if (usadas >= (GRATIS_POR_MES * pct) / 100) atingido = pct;
  }
  return atingido;
}

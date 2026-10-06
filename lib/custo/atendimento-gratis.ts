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
 * A contagem passou de `antes` para `depois`: cruzou algum limiar? Devolve o
 * MAIOR cruzado (pular de 790 para 1.001 avisa só o 100%), ou `null`.
 * "Uma vez por limiar" sai daqui: depois de cruzado, o próximo incremento não
 * cruza de novo.
 */
export function alertaDoAtendimentoGratis(antes: number, depois: number): LimiarDoAtendimentoGratis | null {
  let cruzado: LimiarDoAtendimentoGratis | null = null;
  for (const pct of LIMIARES) {
    const marca = (GRATIS_POR_MES * pct) / 100;
    if (antes < marca && depois >= marca) cruzado = pct;
  }
  return cruzado;
}

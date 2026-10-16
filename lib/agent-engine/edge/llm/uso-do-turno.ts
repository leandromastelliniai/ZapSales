/**
 * O gasto de TODAS as chamadas ao modelo de um turno, medido sem mudar nenhuma delas.
 *
 * ═══ POR QUE EXISTE ═══
 *
 * A tela de teste do agente mostra tokens e custo por resposta (issue #90). A
 * primeira versão somava só a chamada PRINCIPAL ao modelo, e a prova na produção
 * (2026-10-16) mediu a diferença: 4 turnos de teste gastaram US$ 0,0107 em
 * `llm_calls`, e a tela mostrava ~US$ 0,0040 — o checkpoint, o classificador de
 * etapa e as duas conferências por modelo ficavam de fora. Um número que parece o
 * gasto e é 38% dele é pior que nenhum.
 *
 * Um turno chama o modelo de vários lugares (principal, checkpoint, classificador,
 * jailbreak, promessa), mas TODOS passam por `runModelCall`. Em vez de levar um
 * coletor por cada assinatura, `runModelCall` avisa aqui e quem abriu a medição
 * recebe a soma. `AsyncLocalStorage` mantém duas medições simultâneas separadas —
 * dois testes ao mesmo tempo na mesma instância não somam um no outro.
 *
 * Fora de uma medição, `somarUsoDoTurno` é um `getStore()` e um `return`: o turno
 * real não paga nada por existir.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface UsoDoTurno {
  tokensIn: number;
  tokensOut: number;
  /** Centavos de DÓLAR, a mesma unidade de `llm_calls.cost_cents`. */
  costCents: number;
}

const medicao = new AsyncLocalStorage<UsoDoTurno>();

/** Roda `fn` e devolve, junto do resultado, o gasto de toda chamada ao modelo que ela fez. */
export async function medirUsoDoTurno<T>(
  fn: () => Promise<T>,
): Promise<{ resultado: T; uso: UsoDoTurno }> {
  const uso: UsoDoTurno = { tokensIn: 0, tokensOut: 0, costCents: 0 };
  const resultado = await medicao.run(uso, fn);
  return { resultado, uso };
}

/**
 * Chamada por `runModelCall` a cada resposta do modelo. `costCents` nulo é modelo sem
 * preço conhecido: os tokens contam e o custo não é inventado.
 */
export function somarUsoDoTurno(u: {
  tokensIn: number;
  tokensOut: number;
  costCents: number | null;
}): void {
  const atual = medicao.getStore();
  if (!atual) return;
  atual.tokensIn += u.tokensIn;
  atual.tokensOut += u.tokensOut;
  atual.costCents += u.costCents ?? 0;
}

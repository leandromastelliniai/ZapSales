/**
 * O que a casa RECOMENDA para a distribuição de atendimento, pelo tamanho da equipe.
 *
 * É só uma sugestão mostrada na tela de Distribuição ("Recomendado", com o motivo): nunca
 * muda o que está salvo, e a pessoa escolhe o que quiser. O número que entra é o de membros
 * que podem atender (agente, gerente e administrador, sem convite revogado), o mesmo
 * "total" que `quemPodeAssumirAgora` conta.
 *
 * As faixas vêm do que cada modo faz (`lib/routing/decide.ts`):
 *  - até 1 pessoa não há o que distribuir: cada um pega o que quiser;
 *  - de 2 a 6, o rodízio entrega o cliente novo a quem está há mais tempo sem receber, e
 *    ninguém fura a fila;
 *  - a partir de 7, o rodízio puro deixa um atendente com a carteira cheia enquanto outro
 *    está parado: entregar a quem tem menos conversas abertas equilibra.
 * Na visibilidade, equipe de até 2 pessoas costuma se ajudar (todos veem tudo); a partir de 3,
 * cada um foca na própria carteira e ainda enxerga quem acabou de chegar.
 */
import type { VisibilityMode } from "@/lib/auth/types";
import type { RoutingMode } from "@/lib/schemas/routing";

export type MotivoDoModo = "sem_equipe" | "rodizio" | "carga";
export type MotivoDaVisibilidade = "equipe_pequena" | "carteira_propria";

export interface RecomendacaoDeDistribuicao {
  modo: RoutingMode;
  motivoDoModo: MotivoDoModo;
  visibilidade: VisibilityMode;
  motivoDaVisibilidade: MotivoDaVisibilidade;
}

export function recomendacaoDeDistribuicao(totalDeAtendentes: number): RecomendacaoDeDistribuicao {
  const modo =
    totalDeAtendentes <= 1
      ? ({ modo: "manual", motivoDoModo: "sem_equipe" } as const)
      : totalDeAtendentes <= 6
        ? ({ modo: "round_robin", motivoDoModo: "rodizio" } as const)
        : ({ modo: "load", motivoDoModo: "carga" } as const);
  const visibilidade =
    totalDeAtendentes <= 2
      ? ({ visibilidade: "all", motivoDaVisibilidade: "equipe_pequena" } as const)
      : ({ visibilidade: "own_and_unassigned", motivoDaVisibilidade: "carteira_propria" } as const);
  return { ...modo, ...visibilidade };
}

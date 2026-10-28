/**
 * O RESUMO DA EVOLUÇÃO DA IA — as quatro respostas da faixa no alto, para que o que está travando (o
 * bloco mais acionável, no FIM de uma página de quatro blocos) apareça antes de quem lê rolar.
 *
 * Puro e sem número novo: soma o que o payload já traz (`learned`, `activity`, `outcome`) e conta as
 * lacunas que `montaLacunas` já monta. Nenhuma meta, nenhum "bom" ou "ruim" é inventado.
 *
 * ⚠️ "NADA TRAVANDO" NÃO É ELOGIO. A tela de baixo (`EvolutionGaps`, `boaNoticia`) só elogia uma fonte
 * quando tem evidência dela; lista de lacunas vazia, sozinha, não diz que está tudo bem. Por isso a
 * conferência de zero lacunas é `ok` com um texto FACTUAL ("nenhuma lacuna apareceu") e a faixa não
 * repete a boa notícia detalhada.
 *
 * ⚠️ APRENDER NADA E NÃO USAR NADA SÃO `info`, NUNCA `atencao`. Um período curto, ou uma empresa que
 * ainda não instalou habilidade, não está errado — e a tela abaixo já oferece o caminho em cada caso.
 */

export interface EntradaDaEvolucao {
  /** Regras + melhorias aprovadas + habilidades instaladas no período. */
  aprendeu: number;
  /** Habilidades usadas + consultas aos materiais + encaminhamentos, no período. */
  usos: number;
  fechados: number;
  perdidos: number;
  /** Quantas lacunas `montaLacunas` devolveu. */
  travas: number;
}

export type IdDaConferenciaDaEvolucao = "travando" | "aprendizado" | "atividade";

export interface ConferenciaDaEvolucao {
  id: IdDaConferenciaDaEvolucao;
  estado: "ok" | "atencao" | "info";
  motivo: string;
  quantidade?: number;
}

export interface ResumoDaEvolucao extends EntradaDaEvolucao {
  conferencias: ConferenciaDaEvolucao[];
}

export function resumoDaEvolucao(e: EntradaDaEvolucao): ResumoDaEvolucao {
  const conferencias: ConferenciaDaEvolucao[] = [
    e.travas > 0
      ? { id: "travando", estado: "atencao", motivo: "travando", quantidade: e.travas }
      : { id: "travando", estado: "ok", motivo: "sem_lacunas" },
    e.aprendeu > 0
      ? { id: "aprendizado", estado: "ok", motivo: "aprendeu", quantidade: e.aprendeu }
      : { id: "aprendizado", estado: "info", motivo: "nada_aprendeu" },
    e.usos > 0
      ? { id: "atividade", estado: "ok", motivo: "usou", quantidade: e.usos }
      : { id: "atividade", estado: "info", motivo: "nada_usou" },
  ];
  return { ...e, conferencias };
}

export function contarAtencaoDaEvolucao(conferencias: readonly ConferenciaDaEvolucao[]): number {
  return conferencias.filter((c) => c.estado === "atencao").length;
}

/**
 * O RESUMO DO FUNIL — as contas que a tela "Etapas do funil" mostra antes de qualquer campo.
 *
 * Tudo aqui é leitura do que o funil já tem (as etapas e o mapa passo-do-agente → etapa que
 * `GET /api/v1/pipelines/:id/agent-mapping` devolve); nada é gravado e nenhuma regra nasce neste
 * arquivo. Puro de propósito: é a afirmação que a tela faz ("o agente move o card em 2 de 7
 * passos"), e afirmação de tela precisa ser testável sem montar um componente.
 *
 * ⚠️ «NÃO MOVER» CONTINUA SENDO ESCOLHA (migration 0084, repetida no cabeçalho de `_mapping.tsx`).
 * Por isso o agente parado é conferência `info`, nunca `atencao`: ela avisa e não conta como
 * pendência. Já a falta de etapa de fechamento ou de perda é fato sobre o funil, e é `atencao`.
 */
import { LEAD_STAGES, type LeadStage } from "@/lib/agent-engine/agent/lead-state";

/** O que a conta precisa de cada etapa. Arquivadas não chegam aqui — quem lê a API já as tirou. */
export interface EtapaDoResumo {
  id: string;
  name: string;
  is_won: boolean;
  is_lost: boolean;
}

/** Passo do agente → id da etapa escolhida (`null` = «não mover o card»). */
export type MapaDoResumo = Record<LeadStage, string | null>;

export type IdDaConferenciaDoFunil = "etapas" | "fechamento" | "perda" | "agente";

export interface ConferenciaDoFunil {
  id: IdDaConferenciaDoFunil;
  estado: "ok" | "atencao" | "info";
  motivo: string;
  /** Os nomes citados na frase (etapas de fechamento/perda). */
  nomes?: string[];
}

export interface ResumoDoFunil {
  /** Todas as colunas do quadro, abertas ou não — o número que a pessoa conta na tela. */
  total: number;
  /** Etapas que recebem card no dia a dia (nem fechamento, nem perda). */
  abertas: number;
  fechamento: string[];
  perda: string[];
  passosMovidos: number;
  totalDePassos: number;
  conferencias: ConferenciaDoFunil[];
}

export function resumoDoFunil(etapas: EtapaDoResumo[], mapa: MapaDoResumo): ResumoDoFunil {
  const abertas = etapas.filter((e) => !e.is_won && !e.is_lost).length;
  const fechamento = etapas.filter((e) => e.is_won).map((e) => e.name);
  const perda = etapas.filter((e) => e.is_lost).map((e) => e.name);
  const passosMovidos = LEAD_STAGES.filter((p) => mapa[p] !== null).length;

  const conferencias: ConferenciaDoFunil[] = [
    abertas > 0
      ? { id: "etapas", estado: "ok", motivo: "tem_etapas_abertas" }
      : { id: "etapas", estado: "atencao", motivo: "sem_etapa_aberta" },
    fechamento.length > 0
      ? { id: "fechamento", estado: "ok", motivo: "tem_fechamento", nomes: fechamento }
      : { id: "fechamento", estado: "atencao", motivo: "sem_fechamento" },
    perda.length > 0
      ? { id: "perda", estado: "ok", motivo: "tem_perda", nomes: perda }
      : { id: "perda", estado: "atencao", motivo: "sem_perda" },
    passosMovidos > 0
      ? { id: "agente", estado: "ok", motivo: "agente_move" }
      : { id: "agente", estado: "info", motivo: "agente_nao_move" },
  ];

  return {
    total: etapas.length,
    abertas,
    fechamento,
    perda,
    passosMovidos,
    totalDePassos: LEAD_STAGES.length,
    conferencias,
  };
}

export function contarAtencaoDoFunil(conferencias: ConferenciaDoFunil[]): number {
  return conferencias.filter((c) => c.estado === "atencao").length;
}

/** Um passo que a sugestão preencheria e a etapa que ela escolheu para ele. */
export interface PassoSugerido {
  passo: "won" | "lost";
  etapa: EtapaDoResumo;
}

/**
 * O que a casa recomenda preencher — e SÓ o que não tem dúvida.
 *
 * «Ganho» tem uma única casa possível (etapa marcada como fechamento) e «Perdido», idem (etapa de
 * perda): o CHECK da 0084 já impede qualquer outra. Os cinco passos do meio dependem do desenho do
 * quadro de cada negócio (a 0084 diz que "Em separação" e "Pós-venda" nem têm equivalente), e
 * chutar ali moveria cards para a coluna errada com cara de recomendação. Esses ficam com quem
 * conhece o próprio funil.
 *
 * Nunca sobrescreve: passo que já tem etapa escolhida (ou em rascunho) não entra, e a primeira
 * etapa da ordem do funil desempata quando há mais de uma de fechamento ou de perda.
 */
export function sugerirMapeamento(etapas: EtapaDoResumo[], mapa: MapaDoResumo): PassoSugerido[] {
  const sugestao: PassoSugerido[] = [];
  if (mapa.won === null) {
    const etapa = etapas.find((e) => e.is_won);
    if (etapa) sugestao.push({ passo: "won", etapa });
  }
  if (mapa.lost === null) {
    const etapa = etapas.find((e) => e.is_lost);
    if (etapa) sugestao.push({ passo: "lost", etapa });
  }
  return sugestao;
}

/** Como o dono chama as coisas do funil, para quem nunca viu o vocabulário em inglês do banco. */
export interface Vocabulario {
  lead: string;
  deal: string;
  won: string;
  lost: string;
}

export interface ExemploDeVocabulario extends Vocabulario {
  id: string;
  /** Tipo de negócio, em português — o texto da tela passa por `t()`. */
  negocio: string;
}

/**
 * Três exemplos para quem trava diante de quatro caixas vazias. São sugestões de preenchimento
 * (a tela só copia para as caixas; quem grava é o botão Salvar), não regra nem padrão do produto.
 */
export const EXEMPLOS_DE_VOCABULARIO: readonly ExemploDeVocabulario[] = [
  { id: "loja", negocio: "Loja", lead: "Cliente", deal: "Pedido", won: "Pago", lost: "Cancelado" },
  { id: "clinica", negocio: "Clínica", lead: "Paciente", deal: "Tratamento", won: "Fechado", lost: "Perdido" },
  { id: "servicos", negocio: "Serviços", lead: "Cliente", deal: "Orçamento", won: "Fechado", lost: "Perdido" },
];

/** O vocabulário gravado, só com o que é texto de verdade — `{}` e `null` viram `null`. */
export function vocabularioLido(bruto: Record<string, string> | null): Partial<Vocabulario> | null {
  if (!bruto) return null;
  const saida: Partial<Vocabulario> = {};
  for (const chave of ["lead", "deal", "won", "lost"] as const) {
    const v = bruto[chave];
    if (typeof v === "string" && v.trim() !== "") saida[chave] = v.trim();
  }
  return Object.keys(saida).length > 0 ? saida : null;
}

/**
 * O exemplo como UMA frase — e é a frase inteira que se traduz, nunca a palavra solta.
 *
 * Traduzir "Pago" ou "Fechado" sozinhos põe essas palavras no dicionário global, e o e2e de
 * espanhol passa a acusar toda tela que mostra uma etapa chamada "Pago" (dado do usuário, não
 * texto do produto) como português sem tradução. A frase composta não coincide com dado nenhum.
 */
export function rotuloDoExemplo(ex: ExemploDeVocabulario): string {
  return `${ex.negocio}: ${ex.lead} · ${ex.deal} · ${ex.won} · ${ex.lost}`;
}

/** O rótulo e as quatro palavras já no idioma da tela; se a tradução vier torta, cai no português. */
export function exemploTraduzido(
  ex: ExemploDeVocabulario,
  t: (texto: string) => string,
): { rotulo: string; palavras: Vocabulario } {
  const rotulo = t(rotuloDoExemplo(ex));
  const [, resto = ""] = rotulo.split(": ");
  const [lead, deal, won, lost] = resto.split(" · ");
  if (lead && deal && won && lost) return { rotulo, palavras: { lead, deal, won, lost } };
  return { rotulo: rotuloDoExemplo(ex), palavras: { lead: ex.lead, deal: ex.deal, won: ex.won, lost: ex.lost } };
}

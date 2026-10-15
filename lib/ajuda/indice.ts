import type { AjudaDaPagina } from "./tipos";

/**
 * O índice do "Como funciona": chave da tela → como carregar o texto dela.
 *
 * Cada entrada é uma importação DINÂMICA, escrita por extenso (nunca montada por template): o
 * empacotador só separa em pedaços os módulos que consegue ler daqui. É isto que mantém o texto de
 * ajuda fora do pacote inicial — ele só é baixado quando a pessoa clica no botão.
 *
 * Tela nova que ganha o botão acrescenta uma linha aqui e o módulo em `./conteudo/`.
 * `tests/unit/ajuda-da-pagina.test.ts` cobra que toda entrada tenha os três idiomas.
 */
export const INDICE_DE_AJUDA = {
  agenda: () => import("./conteudo/agenda"),
  agentes: () => import("./conteudo/agentes"),
  alertas: () => import("./conteudo/alertas"),
  "api-tokens": () => import("./conteudo/api-tokens"),
  atividades: () => import("./conteudo/atividades"),
  auditoria: () => import("./conteudo/auditoria"),
  "aviso-no-whatsapp": () => import("./conteudo/aviso-no-whatsapp"),
  campanhas: () => import("./conteudo/campanhas"),
  casos: () => import("./conteudo/casos"),
  chamadas: () => import("./conteudo/chamadas"),
  "chaves-de-acesso": () => import("./conteudo/chaves-de-acesso"),
  comandas: () => import("./conteudo/comandas"),
  conexoes: () => import("./conteudo/conexoes"),
  conhecimento: () => import("./conteudo/conhecimento"),
  contatos: () => import("./conteudo/contatos"),
  desempenho: () => import("./conteudo/desempenho"),
  "distribuicao-de-atendimento": () => import("./conteudo/distribuicao-de-atendimento"),
  empresas: () => import("./conteudo/empresas"),
  equipe: () => import("./conteudo/equipe"),
  "etapas-do-funil": () => import("./conteudo/etapas-do-funil"),
  "evolucao-da-ia": () => import("./conteudo/evolucao-da-ia"),
  faturamento: () => import("./conteudo/faturamento"),
  "fluxos-de-atendimento": () => import("./conteudo/fluxos-de-atendimento"),
  "follow-ups": () => import("./conteudo/follow-ups"),
  funis: () => import("./conteudo/funis"),
  honorarios: () => import("./conteudo/honorarios"),
  importacoes: () => import("./conteudo/importacoes"),
  lgpd: () => import("./conteudo/lgpd"),
  "linha-telefonica": () => import("./conteudo/linha-telefonica"),
  marca: () => import("./conteudo/marca"),
  memoria: () => import("./conteudo/memoria"),
  notificacoes: () => import("./conteudo/notificacoes"),
  organizacao: () => import("./conteudo/organizacao"),
  perfil: () => import("./conteudo/perfil"),
  pessoas: () => import("./conteudo/pessoas"),
  "plano-e-cobranca": () => import("./conteudo/plano-e-cobranca"),
  produtos: () => import("./conteudo/produtos"),
  propostas: () => import("./conteudo/propostas"),
  prospeccao: () => import("./conteudo/prospeccao"),
  radar: () => import("./conteudo/radar"),
  "respostas-rapidas": () => import("./conteudo/respostas-rapidas"),
  roteadores: () => import("./conteudo/roteadores"),
  seguranca: () => import("./conteudo/seguranca"),
  skills: () => import("./conteudo/skills"),
  "sugestoes-da-ia": () => import("./conteudo/sugestoes-da-ia"),
  tarefas: () => import("./conteudo/tarefas"),
  "tipos-de-agendamento": () => import("./conteudo/tipos-de-agendamento"),
  "uso-e-orcamento": () => import("./conteudo/uso-e-orcamento"),
  webhooks: () => import("./conteudo/webhooks"),
} satisfies Record<string, () => Promise<{ default: AjudaDaPagina }>>;

export type ChaveDeAjuda = keyof typeof INDICE_DE_AJUDA;

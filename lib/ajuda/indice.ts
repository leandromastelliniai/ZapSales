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
  contatos: () => import("./conteudo/contatos"),
  equipe: () => import("./conteudo/equipe"),
  funis: () => import("./conteudo/funis"),
  produtos: () => import("./conteudo/produtos"),
  tarefas: () => import("./conteudo/tarefas"),
  "respostas-rapidas": () => import("./conteudo/respostas-rapidas"),
} satisfies Record<string, () => Promise<{ default: AjudaDaPagina }>>;

export type ChaveDeAjuda = keyof typeof INDICE_DE_AJUDA;

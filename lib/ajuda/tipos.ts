import type { Idioma } from "@/lib/i18n/idiomas";

/**
 * O texto do botão "Como funciona" de UMA tela.
 *
 * Mora aqui, e não no dicionário de `t()`, por dois motivos:
 *   1. É texto LONGO (parágrafos e passos), que só interessa a quem abre o painel — não deve pesar
 *      no pacote que toda tela baixa. Cada tela tem o seu módulo, carregado só ao abrir
 *      (`lib/ajuda/indice.ts`).
 *   2. Traduzir parágrafo por chave-em-português dá uma chave de 300 caracteres. Aqui os idiomas
 *      moram lado a lado, na mesma entrada, e quem revisa o texto lê os três juntos.
 *
 * Idioma sem entrada cai em inglês e depois em português — nunca em erro, nunca em chave crua.
 */
export interface ConteudoDeAjuda {
  /** O que a tela mostra, em uma ou duas frases. Fala de negócio, não de código. */
  readonly oQueMostra: string;
  /** O caminho de quem chega pela primeira vez, na ordem em que se faz. */
  readonly passos: readonly string[];
  /** Palavras da tela que um dono de negócio pode não conhecer, e o que elas querem dizer. */
  readonly termos?: readonly { readonly termo: string; readonly significa: string }[];
}

export type AjudaDaPagina = { readonly "pt-BR": ConteudoDeAjuda } & Partial<Record<Idioma, ConteudoDeAjuda>>;

/** Escolhe o texto do idioma de quem olha, com a queda en → pt-BR. */
export function conteudoNoIdioma(ajuda: AjudaDaPagina, idioma: Idioma): ConteudoDeAjuda {
  return ajuda[idioma] ?? ajuda.en ?? ajuda["pt-BR"];
}

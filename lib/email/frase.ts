import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

/**
 * Uma frase de e-mail no idioma de quem lê.
 *
 * A CHAVE é a frase inteira em português, com `{marcadores}` — a mesma regra
 * das telas (`lib/i18n/dicionario.ts`): o espanhol mora no dicionário e o
 * inglês em `traducoes/en.json`. A varredura de `i18n-espanhol-cobre-a-tela`
 * só enxerga `t(...)`/`traduzir(...)` com o literal no próprio sítio, e não
 * esta função; quem cobra os e-mails é `tests/unit/emails-nos-tres-idiomas`,
 * que monta cada um em cada idioma e reprova frase que caiu no português.
 *
 * Os marcadores são trocados DEPOIS da tradução, para a ordem das palavras ser
 * a de cada língua, e o guarda de forma do catálogo
 * (`catalogo-de-idioma-tem-forma`) reprova a tradução que perder um deles.
 */
export function frase(idioma: Idioma, chave: string, valores: Record<string, string> = {}): string {
  let texto = traduzir(chave, idioma);
  for (const [nome, valor] of Object.entries(valores)) texto = texto.replaceAll(`{${nome}}`, valor);
  return texto;
}

/**
 * A mesma frase para o corpo HTML. A tradução e cada valor passam por escape;
 * `marcacao` entra crua porque é montada pelo template (um `<strong>` em volta
 * de um valor que ele mesmo escapou), nunca dado de fora.
 */
export function fraseHtml(
  idioma: Idioma,
  chave: string,
  valores: Record<string, string> = {},
  marcacao: Record<string, string> = {},
): string {
  let texto = escapeHtml(traduzir(chave, idioma));
  for (const [nome, valor] of Object.entries(marcacao)) texto = texto.replaceAll(`{${nome}}`, valor);
  for (const [nome, valor] of Object.entries(valores))
    texto = texto.replaceAll(`{${nome}}`, escapeHtml(valor));
  return texto;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

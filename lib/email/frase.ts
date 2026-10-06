import { escapeHtml } from "@/lib/html/escapar";
import { preencher } from "@/lib/i18n/aviso-no-idioma";
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
 *
 * As duas são REPASSE (o corpo é uma chamada, a chave atravessa): é a forma que
 * o guarda "dado do operador" de `i18n-espanhol-cobre-a-tela` reconhece como
 * entrada da tradução, e não como tela escolhendo traduzir um dado.
 */
export const frase = (idioma: Idioma, chave: string, valores: Record<string, string> = {}): string =>
  preencher(traduzir(chave, idioma), valores);

/**
 * A mesma frase para o corpo HTML. A tradução e cada valor passam por escape;
 * `marcacao` entra crua porque é montada pelo template (um `<strong>` em volta
 * de um valor que ele mesmo escapou), nunca dado de fora.
 */
export const fraseHtml = (
  idioma: Idioma,
  chave: string,
  valores: Record<string, string> = {},
  marcacao: Record<string, string> = {},
): string =>
  preencher(
    preencher(escapeHtml(traduzir(chave, idioma)), marcacao),
    Object.fromEntries(Object.entries(valores).map(([nome, valor]) => [nome, escapeHtml(valor)])),
  );

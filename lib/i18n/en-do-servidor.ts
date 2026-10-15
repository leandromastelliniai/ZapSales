import CATALOGO_EN from "./traducoes/en.json";

/**
 * O catálogo em inglês, para o SERVIDOR (`dicionario.ts` o lê para `traduzir`).
 *
 * Existe como módulo próprio, e não como `import` direto do JSON, para que o navegador possa trocá-lo:
 * `next.config.ts` (`turbopack.resolveAlias`, condição `browser`) resolve este caminho para `en-do-navegador.ts`.
 * Sem isso, o pedaço em espanhol (`catalogos/es.ts`, que importa `dicionario.ts` para achatar o `es`) levava
 * junto os ~0,9 MB do inglês — texto que quem usa espanhol nunca lê. O inglês do navegador continua vindo
 * de `catalogos/en.ts`, que importa o JSON direto.
 */
export default CATALOGO_EN as Readonly<Record<string, string>>;

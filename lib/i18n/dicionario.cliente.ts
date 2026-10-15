import { catalogoPronto, traduzirCom, type Catalogo } from "./catalogos";
import type { Idioma } from "./idiomas";

/**
 * A versão de NAVEGADOR de `dicionario.ts`: mesma assinatura de `traduzir` e `temTraducao`, sem os ~2 MB.
 *
 * `next.config.ts` (`turbopack.resolveAlias`, condição `browser`) troca o import de
 * `@/lib/i18n/dicionario` por este módulo na compilação do cliente — então as dezenas de arquivos que
 * importam `traduzir` (tanto componentes quanto módulos de texto de `lib/`) continuam como estão, e o
 * dicionário inteiro só existe no servidor. No navegador, o catálogo do idioma chega por
 * `IdiomaProvider` (ver `catalogos.ts`) antes de qualquer tela que dependa dele ser pintada.
 *
 * Idioma sem catálogo na memória devolve o texto em português: a tradução nunca lança nem devolve
 * vazio, que é o contrato de `traduzir` desde o começo.
 */
const SEM_CATALOGO: Catalogo = Object.freeze({});

export function traduzir(texto: string, idioma: Idioma): string {
  return traduzirCom(catalogoPronto(idioma) ?? SEM_CATALOGO, idioma, texto);
}

export function temTraducao(texto: string, idioma: Idioma): boolean {
  if (idioma === "pt-BR") return true;
  const catalogo = catalogoPronto(idioma);
  return catalogo !== undefined && Object.hasOwn(catalogo, texto);
}

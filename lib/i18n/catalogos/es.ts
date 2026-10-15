import { DICIONARIO } from "../dicionario";

import type { Catalogo } from "../catalogos";

/**
 * O catálogo em espanhol, plano (frase em português → espanhol). Existe só para ser importado de forma
 * dinâmica por `../catalogos`: o dicionário em si fica onde sempre esteve, e este módulo apenas o
 * achata para o navegador.
 */
const es: Record<string, string> = {};
for (const [frase, traducoes] of Object.entries(DICIONARIO)) {
  const texto = traducoes.es;
  if (texto !== undefined) es[frase] = texto;
}

export default es as Catalogo;

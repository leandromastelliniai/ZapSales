import type { Idioma } from "./idiomas";

/**
 * Os catálogos de tradução, carregados SOB DEMANDA e só no navegador de quem os usa.
 *
 * ─── Por que isto existe ─────────────────────────────────────────────────────
 *
 * O dicionário (`dicionario.ts`, ~1,1 MB, mais o `en.json`, ~0,9 MB) ia inteiro no JavaScript de
 * TODA tela, porque `useT()` o importava de forma estática. Medido na produção em 15/10/2026: um único
 * arquivo de 570 KB comprimidos (1,85 MB descomprimidos) era o maior da tela de Contatos, e quase tudo
 * nele era texto de tradução — para quem usa português, que não precisa de um byte dele: em português a
 * chave É o texto.
 *
 * ─── Como funciona ───────────────────────────────────────────────────────────
 *
 *   - `pt-BR` não tem catálogo (vazio): nada para baixar.
 *   - `es` e `en` viram um módulo cada (`./catalogos/es`, `./catalogos/en`), importado de forma
 *     DINÂMICA, então o empacotador os separa em pedaços que só quem usa o idioma baixa — e o navegador
 *     guarda em cache entre as telas.
 *   - O `IdiomaProvider` suspende até o catálogo chegar (`use`). Na hidratação isso mantém o HTML que o
 *     servidor já traduziu na tela, em vez de piscar em português; no servidor o import resolve antes de
 *     a resposta sair.
 *
 * O servidor continua usando `traduzir()` de `dicionario.ts`, com tudo na memória: lá peso de pacote
 * não existe. Quem for CLIENTE nunca deve importar `dicionario.ts` — `tests/unit/dicionario-fora-do-cliente.test.ts`
 * cobra isso.
 */
export type Catalogo = Readonly<Record<string, string>>;

const VAZIO: Catalogo = Object.freeze({});

const prontos = new Map<Idioma, Catalogo>([["pt-BR", VAZIO]]);
const emVoo = new Map<Idioma, Promise<Catalogo>>();

/** O catálogo, se já está na memória (sempre, para `pt-BR`). Nunca dispara carga. */
export function catalogoPronto(idioma: Idioma): Catalogo | undefined {
  return prontos.get(idioma);
}

function importar(idioma: Idioma): Promise<Catalogo> {
  switch (idioma) {
    case "es":
      return import("./catalogos/es").then((m) => m.default);
    case "en":
      return import("./catalogos/en").then((m) => m.default);
    default:
      // Idioma sem catálogo próprio cai no português, como `traduzir()` sempre fez.
      return Promise.resolve(VAZIO);
  }
}

/** Carrega o catálogo (uma vez por idioma) e devolve a MESMA promessa para quem pedir de novo. */
export function carregarCatalogo(idioma: Idioma): Promise<Catalogo> {
  const pronto = prontos.get(idioma);
  if (pronto) return Promise.resolve(pronto);
  let promessa = emVoo.get(idioma);
  if (!promessa) {
    promessa = importar(idioma).then((catalogo) => {
      prontos.set(idioma, catalogo);
      return catalogo;
    });
    emVoo.set(idioma, promessa);
  }
  return promessa;
}

/** SÓ para testes: faz o próximo pedido de um idioma carregar de novo, como num navegador recém-aberto. */
export function esquecerCatalogosParaTeste(): void {
  for (const idioma of [...prontos.keys()]) if (idioma !== "pt-BR") prontos.delete(idioma);
  emVoo.clear();
}

/** Traduz com um catálogo já em mãos: a frase sem tradução volta em português, nunca vazia nem em erro. */
export function traduzirCom(catalogo: Catalogo, idioma: Idioma, texto: string): string {
  if (idioma === "pt-BR") return texto;
  return Object.hasOwn(catalogo, texto) ? (catalogo[texto] ?? texto) : texto;
}

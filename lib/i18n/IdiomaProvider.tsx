"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// ⚠️ NUNCA importe `./dicionario` aqui: este módulo é CLIENTE, e o dicionário (~2 MB com o inglês) iria
// no pacote de toda tela. Os catálogos chegam por `./catalogos`, de forma dinâmica e só para quem usa
// o idioma (ver o cabeçalho de `catalogos.ts`).
import { carregarCatalogo, catalogoPronto, traduzirCom, type Catalogo } from "./catalogos";
import { normalizarIdioma, IDIOMA_PADRAO, type Idioma } from "./idiomas";

/**
 * O idioma da interface, com contexto PRÓPRIO — não pendurado no de autenticação.
 *
 * ─── Por que separado ──────────────────────────────────────────────────────
 *
 * A primeira versão lia o idioma do `AuthProvider`, que é onde o dado mora. Não
 * compilou o mundo real: dezenas de testes fazem `vi.mock` do módulo de
 * autenticação, e o mock não conhecia a função nova — 32 casos quebraram por
 * causa de um RÓTULO.
 *
 * O erro não foi o mock: foi o acoplamento. Traduzir é apresentação e não
 * precisa saber quem está logado; amarrá-lo à autenticação faz toda tela que
 * mostra texto depender de quem sabe permissão. O provider de idioma recebe o
 * código pronto de quem já o tem (o layout) e não pergunta nada a ninguém.
 *
 * ─── Ausência é o padrão, nunca erro ───────────────────────────────────────
 *
 * Sem provider, `t` devolve português. Um componente renderizado fora da árvore
 * — num teste, num e-mail, num fragmento isolado — continua mostrando texto
 * legível. A tradução não pode ser o motivo de nada quebrar.
 *
 * ─── Por que ele tem ESTADO, se o idioma vem do servidor ───────────────────
 *
 * Para a troca ser instantânea. O seletor do topo grava a escolha no servidor,
 * e o servidor é a verdade — mas esperar o round-trip e o re-render do RSC
 * deixaria a interface no idioma velho por um tempo visível, exatamente no
 * clique em que a pessoa quer ver o efeito.
 *
 * O `useEffect` reconcilia: quando o servidor devolve um valor diferente do que
 * está na tela (a gravação terminou, ou a pessoa navegou), o de fora vence. Sem
 * essa reconciliação o estado local venceria para sempre e uma gravação que
 * FALHOU continuaria parecendo aplicada.
 */
const SEM_CATALOGO: Catalogo = Object.freeze({});

const Ctx = createContext<{ idioma: Idioma; catalogo: Catalogo; aplicar: (i: Idioma) => void }>({
  idioma: IDIOMA_PADRAO,
  catalogo: SEM_CATALOGO,
  aplicar: () => {},
});

/**
 * Espelho do idioma atual fora da árvore React.
 *
 * Existe só para `showApiError` (components/feedback/ApiErrorToast.tsx), que é
 * passado por REFERÊNCIA como `onError` em ~80 lugares e por isso não pode
 * virar hook — chamar `useContext` fora de um componente quebra o app. O
 * provider já é o único escritor de idioma da árvore inteira, então espelhar
 * o valor aqui, num `useEffect`, é a única leitura possível de fora sem
 * inventar um segundo mecanismo de estado.
 */
let idiomaFora: Idioma = IDIOMA_PADRAO;
let catalogoFora: Catalogo = SEM_CATALOGO;

export function idiomaAtual(): Idioma {
  return idiomaFora;
}

/** Traduz no idioma em vigor, de fora da árvore React (o espelho de `idiomaAtual`, com o catálogo dele). */
export function traduzirFora(texto: string): string {
  return traduzirCom(catalogoFora, idiomaFora, texto);
}

export function IdiomaProvider({
  locale,
  children,
}: {
  locale: string | null | undefined;
  children: React.ReactNode;
}) {
  const doServidor = normalizarIdioma(locale);
  const [idioma, setIdioma] = useState<Idioma>(doServidor);
  // O catálogo do idioma em vigor. Português e idioma já carregado não esperam nada; um idioma novo
  // SUSPENDE até o pedaço chegar — e na hidratação isso mantém na tela o HTML que o servidor já
  // traduziu, em vez de piscar em português (o servidor resolve o import antes de responder).
  //
  // Suspende pelo protocolo clássico (lançar a promessa), e NÃO com `use()`: o React reexecuta um
  // componente que suspendeu em `use` reaproveitando a lista de hooks, e um `use` condicional (só quando
  // o catálogo falta) mudava a ordem na segunda passada — erro #467 ("update hook called on initial
  // render"), medido no servidor de produção. `use` incondicional, por outro lado, quebrava o teste de
  // componentes com diálogos do Radix. Lançar a promessa descarta a renderização e recomeça do zero.
  const catalogo = catalogoPronto(idioma);
  if (!catalogo) throw carregarCatalogo(idioma);

  useEffect(() => {
    // Só adota o idioma do servidor com o catálogo dele na mão: trocar antes suspenderia a árvore.
    if (catalogoPronto(doServidor)) setIdioma(doServidor);
    else void carregarCatalogo(doServidor).then(() => setIdioma(doServidor));
  }, [doServidor]);

  // O espelho de fora da árvore segue o idioma EM VIGOR, não o do servidor:
  // quem troca no seletor vê o toast de erro já no idioma novo, sem esperar o
  // round-trip. Ancorá-lo em `doServidor` deixaria `showApiError` um idioma
  // atrás exatamente no clique em que a pessoa quer ver o efeito.
  useEffect(() => {
    idiomaFora = idioma;
    catalogoFora = catalogo;
    document.documentElement.lang = idioma;
    return () => {
      idiomaFora = IDIOMA_PADRAO;
      catalogoFora = SEM_CATALOGO;
    };
  }, [idioma, catalogo]);

  // A troca pelo seletor também espera o catálogo: com ele em cache (português, ou um idioma já
  // visitado) é imediata; sem ele, a tela continua no idioma velho até o pedaço chegar.
  const aplicar = useCallback((novo: Idioma) => {
    if (catalogoPronto(novo)) setIdioma(novo);
    else void carregarCatalogo(novo).then(() => setIdioma(novo));
  }, []);

  const valor = useMemo(() => ({ idioma, catalogo, aplicar }), [idioma, catalogo, aplicar]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** `t("Assumir")` → "Asumir" para quem escolheu espanhol. */
export function useT(): (texto: string) => string {
  const { idioma, catalogo } = useContext(Ctx);
  // Identidade estável: sem isto, todo `useMemo`/`useEffect` que dependa de `t`
  // reexecutaria a cada render.
  return useMemo(() => (texto: string) => traduzirCom(catalogo, idioma, texto), [idioma, catalogo]);
}

/** O idioma em vigor, para quem precisa do código e não da tradução. */
export function useIdioma(): Idioma {
  return useContext(Ctx).idioma;
}

/**
 * Pinta a interface no idioma novo AGORA, sem esperar o servidor.
 *
 * Quem chama é o seletor do topo, junto com a gravação. Se a gravação falhar,
 * o `useEffect` acima devolve o valor do servidor no próximo render — a tela
 * não fica mentindo que salvou.
 */
export function useAplicarIdioma(): (idioma: Idioma) => void {
  return useContext(Ctx).aplicar;
}

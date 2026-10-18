/**
 * O `fetch` da rede segura (issue #108) — o que se entrega a um SDK no lugar do
 * `fetch` global quando o endereço foi escolhido por um usuário.
 *
 * O `fetch` global julga nada e resolve o nome por conta própria: mesmo que
 * quem chama tenha julgado o endereço antes, entre o julgamento e o `connect`
 * existe uma segunda resolução (rebinding com TTL zero). Este aqui passa a
 * requisição por `buscarSeguroEmFluxo`: resolve UMA vez, julga o conjunto
 * inteiro e conecta só no que foi julgado — e devolve um `Response` padrão cujo
 * corpo chega em fluxo, que é o que a resposta SSE de um modelo exige.
 *
 * Contrato com o SDK:
 *  - entra o que o `fetch` aceita (string, `URL` ou `Request`; corpo em string,
 *    bytes ou `FormData`). `new Request(...)` normaliza tudo isso, inclusive a
 *    fronteira do multipart. O corpo da REQUISIÇÃO é lido inteiro antes de
 *    sair (chat e áudio cabem; upload em fluxo não é suportado);
 *  - **não segue redirecionamento** (devolve o 3xx, como `redirect: "manual"`),
 *    a menos que `maxRedirecionamentos` venha na política;
 *  - **os erros têm a forma do `fetch`**, porque é nela que o SDK e os
 *    classificadores se apoiam: falha de conexão e prazo estourado saem como
 *    `TypeError("fetch failed")` com a causa (é o que o SDK retenta e o que
 *    `run-model-call.ts` lê como provedor indisponível); uma queda no meio do
 *    corpo, como `TypeError("terminated")`; o cancelamento do SDK, como o motivo
 *    do próprio `AbortSignal` (`AbortError`/`TimeoutError`), antes ou durante a
 *    leitura. Já a **recusa da política** (`unsafe_url:*`) e o teto de bytes
 *    (`net:response_too_large`) não são falha de rede e saem com o próprio
 *    código, que é o `message`;
 *  - os prazos padrão são os do `fetch` global (undici: 300 s para cabeçalhos e
 *    300 s de silêncio no corpo), e não os 10 s do webhook: uma completação sem
 *    streaming só devolve cabeçalhos quando termina. O teto de duração de uma
 *    chamada é o `AbortSignal` de quem chama.
 */
import { buscarSeguroEmFluxo, ErroDeRedeSegura, type OpcoesDeFluxo } from "./cliente";

const PRAZO_DO_FETCH_MS = 300_000;

/** A política e os limites do transporte; o que é da requisição vem da própria requisição. */
export type OpcoesDoFetchSeguro = Omit<OpcoesDeFluxo, "metodo" | "headers" | "corpo" | "signal">;

function cabecalhosDaResposta(brutos: Record<string, string | string[] | undefined>): Headers {
  const headers = new Headers();
  for (const [nome, valor] of Object.entries(brutos)) {
    if (valor === undefined) continue;
    for (const v of Array.isArray(valor) ? valor : [valor]) headers.append(nome, v);
  }
  return headers;
}

/** A falha como o `fetch` a teria dado; o que não é falha de rede segue com o próprio código. */
function comoErroDeFetch(erro: unknown, sinal: AbortSignal, mensagem: "fetch failed" | "terminated"): unknown {
  if (sinal.aborted) return sinal.reason ?? new DOMException("This operation was aborted", "AbortError");
  if (erro instanceof ErroDeRedeSegura) {
    if (erro.codigo === "net:connection_failed") return new TypeError(mensagem, { cause: erro.cause ?? erro });
    if (erro.codigo === "net:timeout") return new TypeError(mensagem, { cause: erro });
  }
  return erro;
}

/** Repassa o corpo trocando o erro de transporte pelo erro do `fetch`. */
function corpoComErrosDeFetch(corpo: ReadableStream<Uint8Array> | null, sinal: AbortSignal): ReadableStream<Uint8Array> | null {
  if (!corpo) return null;
  const leitor = corpo.getReader();
  return new ReadableStream<Uint8Array>(
    {
      async pull(controle) {
        try {
          const { value, done } = await leitor.read();
          if (done) controle.close();
          else controle.enqueue(value);
        } catch (erro) {
          throw comoErroDeFetch(erro, sinal, "terminated");
        }
      },
      cancel: (motivo) => leitor.cancel(motivo),
    },
    { highWaterMark: 0 },
  );
}

export function fetchSeguro(opcoes: OpcoesDoFetchSeguro = {}): typeof fetch {
  return async (input, init) => {
    const req = new Request(input, init);
    const corpo = req.body ? new Uint8Array(await req.arrayBuffer()) : undefined;
    let resposta;
    try {
      resposta = await buscarSeguroEmFluxo(req.url, {
        timeoutMs: PRAZO_DO_FETCH_MS,
        timeoutEntreTrechosMs: PRAZO_DO_FETCH_MS,
        ...opcoes,
        metodo: req.method,
        headers: Object.fromEntries(req.headers.entries()),
        ...(corpo ? { corpo } : {}),
        signal: req.signal,
      });
    } catch (erro) {
      throw comoErroDeFetch(erro, req.signal, "fetch failed");
    }

    const res = new Response(corpoComErrosDeFetch(resposta.corpo, req.signal), {
      status: resposta.status,
      headers: cabecalhosDaResposta(resposta.headers),
    });
    // `Response.url` não é gravável pelo construtor; o SDK a usa em mensagens de erro.
    Object.defineProperty(res, "url", { value: resposta.urlFinal });
    return res;
  };
}

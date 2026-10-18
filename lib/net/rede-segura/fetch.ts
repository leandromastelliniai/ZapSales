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
 *    fronteira do multipart;
 *  - **não segue redirecionamento** (devolve o 3xx, como `redirect: "manual"`),
 *    a menos que `maxRedirecionamentos` venha na política;
 *  - recusa e falha de transporte saem como exceção com o código da política
 *    (`unsafe_url:*`, `net:*`) — que é o `message`; o cancelamento do SDK sai
 *    como o motivo do próprio `AbortSignal`, como no `fetch`;
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
      // O SDK distingue "cancelei" (AbortError/TimeoutError do próprio sinal) de
      // "falhou": devolve o motivo do sinal, e não o código de transporte.
      if (req.signal.aborted && erro instanceof ErroDeRedeSegura && erro.codigo === "net:aborted") {
        throw req.signal.reason ?? new DOMException("This operation was aborted", "AbortError");
      }
      throw erro;
    }

    const res = new Response(resposta.corpo, {
      status: resposta.status,
      headers: cabecalhosDaResposta(resposta.headers),
    });
    // `Response.url` não é gravável pelo construtor; o SDK a usa em mensagens de erro.
    Object.defineProperty(res, "url", { value: resposta.urlFinal });
    return res;
  };
}

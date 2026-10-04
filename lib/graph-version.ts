/**
 * A VERSÃO DA GRAPH API TEM UM LUGAR SÓ.
 *
 * O número estava escrito à mão em dez arquivos de produção, sempre com o mesmo
 * `"v22.0"` copiado. A cópia é o defeito: no dia do bump, quem sobe a versão
 * edita dez lugares e esquece um — o esquecido não falha, ele responde. A
 * instalação passa a falar duas versões da mesma plataforma, e o sintoma chega
 * como "o template aprovado não envia" numa tela só.
 *
 * O número mora aqui. Quem cobra é
 * `tests/unit/versao-da-graph-num-lugar-so.test.ts`: literal de versão da Graph
 * fora deste arquivo reprova a suíte.
 *
 * O CANAL SUBIU PARA A v26.0 (issue #4), o ANÚNCIO NÃO. A v26.0 saiu em
 * 29/07/2026 e é a versão em que a Meta documenta o modelo novo de contas
 * (`messaging_account_id` ao lado da WABA) e o BSUID — as duas coisas que o canal
 * oficial passou a usar. O eixo de anúncio continua na versão anterior porque
 * subir ali exige reconferir campo a campo (a lição medida em
 * `lib/plataformas-de-anuncio/meta/insights.ts`: campo válido some entre versões,
 * sem aviso), e essa reconferência não fez parte da mudança do canal.
 *
 * Dois eixos, duas constantes, um arquivo:
 * - `graphVersion()` — canais de mensagem (`lib/channels/**`,
 *   `app/api/v1/channels/**`, `scripts/spike-*`) e honra `META_GRAPH_VERSION`,
 *   como o `.env.example` já documenta. Sem a variável, cai em
 *   `VERSAO_PADRAO_DA_GRAPH`.
 * - `VERSAO_DA_GRAPH_DE_ANUNCIO` — o eixo de anúncio
 *   (`lib/plataformas-de-anuncio/meta/**`), que NÃO herda a variável do canal de
 *   mensagem: são credenciais e ciclos de vida diferentes. Conviver com duas
 *   versões é dívida declarada aqui, não acidente — o bump do anúncio é a
 *   reconferência de campos dele.
 */

/** O default da instalação. `bump` aqui é mudança deliberada, não deriva. */
export const VERSAO_PADRAO_DA_GRAPH = "v26.0";

/** A versão do eixo de anúncio. Ver o cabeçalho: sobe com a reconferência dos campos dele. */
export const VERSAO_DA_GRAPH_DE_ANUNCIO = "v22.0";

/**
 * A versão com que a Graph API é chamada hoje.
 *
 * `META_GRAPH_VERSION` continua mandando quando existe — instalação que já
 * apontou a variável para outra versão segue apontada.
 *
 * Vazia (ou só espaço) conta como ausente: `??` devolveria a string vazia e o
 * endereço sairia com um separador a mais, sem versão no meio. `META_GRAPH_VERSION=`
 * é estado real de quem copiou o `.env.example` e apagou o valor.
 */
export function graphVersion(): string {
  const daVariavel = process.env.META_GRAPH_VERSION?.trim();
  return daVariavel ? daVariavel : VERSAO_PADRAO_DA_GRAPH;
}

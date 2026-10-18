/**
 * A rede de saída segura — o ÚNICO ponto por onde o servidor alcança um
 * endereço que um usuário informou (issue #88).
 *
 * Antes eram três implementações: o webhook de saída (guarda textual + um
 * `lookup` seguido de um `fetch` que resolvia o nome DE NOVO), o download de
 * extensões e o banco externo. A política, agora num lugar só:
 *
 *  1. **Texto da URL:** só `https` (o `http` é um interruptor explícito de quem
 *     chama, nunca o padrão), sem `localhost`, sem IPv4 especial por extenso e
 *     sem literal IPv6 (a menos que quem chama peça para julgá-lo).
 *  2. **DNS resolvido UMA vez e julgado inteiro:** se QUALQUER endereço do nome é
 *     especial, o nome inteiro é recusado — resposta com um público e um privado
 *     é a assinatura do rebinding.
 *  3. **O socket recebe só o que foi julgado** (`lookup` fixado): não existe
 *     segunda resolução, então não existe janela de rebinding. O nome continua
 *     sendo o do `Host`/SNI — o que quebrava TLS na tentativa anterior era trocar
 *     a URL pelo IP; fixar o `lookup` não troca nada.
 *  4. **Redirecionamento recomeça do zero:** cada salto passa pelas regras 1–3,
 *     com teto de saltos. Cabeçalho de credencial não atravessa origens.
 *  5. **Limites:** prazo TOTAL (DNS + conexão + cabeçalhos + corpo, o que pega a
 *     resposta lenta) e teto de bytes contado no corpo lido (o que pega a gigante).
 *
 * `ipPermitido` é a única válvula: o IP especial que o dono da INSTALAÇÃO
 * autorizou (`destinos-internos-autorizados.ts`). Vale por endereço, nunca por
 * nome, e nunca é passada em nome de uma organização.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupAddress, LookupOptions } from "node:dns";
import * as http from "node:http";
import * as https from "node:https";
import { isIPv4, isIPv6, type LookupFunction } from "node:net";
import { pipeline, type Readable, type Transform } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

import { ipEhDeRedeLocal, ipEhEspecial, semColchetes } from "./ip";

/** Recusa da política ou falha de transporte. `message` É o código. */
export class ErroDeRedeSegura extends Error {
  readonly codigo: string;
  constructor(codigo: string, options?: { cause?: unknown }) {
    super(codigo, options);
    this.name = "ErroDeRedeSegura";
    this.codigo = codigo;
  }

  /** A política disse não (`unsafe_url:*`) — diferente de o transporte ter falhado (`net:*`). */
  get ehRecusa(): boolean {
    return this.codigo.startsWith("unsafe_url:");
  }
}

export type ResolvedorDeNomes = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

/** O que decide SE um endereço pode ser alcançado. */
export interface PoliticaDeDestino {
  /** `http:` é aceito. Padrão `false`: a política é HTTPS. */
  permitirHttp?: boolean;
  /** Literal IPv6 na URL é julgado pelo IP, em vez de recusado de saída. */
  julgarLiteralIpv6?: boolean;
  /** Deixa passar este IP especial (lista da instalação). Nunca o nome. */
  ipPermitido?: (ip: string) => boolean;
  /** Troca o DNS — para teste e para quem já resolveu o nome. */
  resolver?: ResolvedorDeNomes;
}

function resolvedorPadrao(hostname: string) {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

const NOME_LOCAL = /(^|\.)localhost$/;

/**
 * Julga o texto da URL, sem rede. Devolve a URL já normalizada (o `new URL`
 * converte `2130706433` e `0x7f.1` em `127.0.0.1`, e é isto que se julga).
 */
export function validarUrl(bruta: string, politica: PoliticaDeDestino = {}): URL {
  let url: URL;
  try {
    url = new URL(bruta);
  } catch {
    throw new ErroDeRedeSegura("unsafe_url:invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ErroDeRedeSegura("unsafe_url:scheme");
  if (url.protocol === "http:" && !politica.permitirHttp) throw new ErroDeRedeSegura("unsafe_url:https_required");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[")) {
    if (!politica.julgarLiteralIpv6) throw new ErroDeRedeSegura("unsafe_url:ipv6_literal");
    return url;
  }
  // `localhost` é recusado pelo nome, a menos que quem chama traga uma válvula de
  // IP: aí o nome é resolvido e o endereço (127.0.0.1) é julgado pela válvula —
  // é o que a lista de destinos internos da instalação sempre fez.
  if (NOME_LOCAL.test(host) && !politica.ipPermitido) throw new ErroDeRedeSegura("unsafe_url:private_host");
  if (isIPv4(host) && ipEhDeRedeLocal(host) && !politica.ipPermitido?.(host)) {
    throw new ErroDeRedeSegura("unsafe_url:private_host");
  }
  return url;
}

/**
 * Resolve o nome e devolve os endereços JULGADOS — os únicos a que o socket
 * pode se conectar. Recusa o conjunto inteiro se qualquer um for especial e não
 * estiver liberado.
 */
export async function resolverEJulgar(hostname: string, politica: PoliticaDeDestino = {}): Promise<LookupAddress[]> {
  const nome = semColchetes(hostname);
  const julgar = (enderecos: LookupAddress[]) => {
    for (const { address } of enderecos) {
      if (ipEhEspecial(address) && !politica.ipPermitido?.(address)) throw new ErroDeRedeSegura("unsafe_url:private_ip");
    }
    return enderecos;
  };

  if (isIPv4(nome) || isIPv6(nome)) return julgar([{ address: nome, family: isIPv4(nome) ? 4 : 6 }]);

  let enderecos: LookupAddress[];
  try {
    enderecos = await (politica.resolver ?? resolvedorPadrao)(nome);
  } catch (cause) {
    // Falhar fechado custa uma chamada; falhar aberto custa a rede interna.
    throw new ErroDeRedeSegura("unsafe_url:dns_failed", { cause });
  }
  if (enderecos.length === 0) throw new ErroDeRedeSegura("unsafe_url:dns_empty");
  return julgar(enderecos);
}

type RespostaDeLookup = (erro: NodeJS.ErrnoException | null, endereco: string | LookupAddress[], familia?: number) => void;

function responder(enderecos: LookupAddress[], opcoes: LookupOptions, callback: RespostaDeLookup): void {
  if (opcoes.all) {
    callback(null, enderecos);
    return;
  }
  const primeiro = opcoes.family ? (enderecos.find((e) => e.family === opcoes.family) ?? enderecos[0]) : enderecos[0];
  if (!primeiro) {
    callback(Object.assign(new Error("Sem endereço julgado."), { code: "EHOSTUNREACH" }), "", 0);
    return;
  }
  callback(null, primeiro.address, primeiro.family);
}

/** O `lookup` do socket: devolve só os endereços já julgados, nunca resolve nada. */
function lookupFixado(hostnameEsperado: string, enderecos: LookupAddress[]): LookupFunction {
  return (hostname: string, opcoes: LookupOptions, callback) => {
    if (hostname !== hostnameEsperado) {
      callback(Object.assign(new Error("Hostname inesperado."), { code: "EHOSTUNREACH" }), "", 0);
      return;
    }
    responder(enderecos, opcoes, callback as RespostaDeLookup);
  };
}

/**
 * Um `lookup` que RESOLVE E JULGA no instante em que o socket pede o endereço, e
 * responde com o que julgou. Para quem abre o próprio socket (o `pg` do banco
 * externo) e por isso não passa por `buscarSeguro`: não há resolução anterior que
 * possa divergir da conexão, porque a resolução É a da conexão.
 */
export function lookupJulgado(politica: PoliticaDeDestino = {}): LookupFunction {
  return (hostname: string, opcoes: LookupOptions, callback) => {
    resolverEJulgar(hostname, politica).then(
      (enderecos) => responder(enderecos, opcoes, callback as RespostaDeLookup),
      (erro: unknown) => callback(erro as NodeJS.ErrnoException, "", 0),
    );
  };
}

export interface OpcoesDeBusca extends PoliticaDeDestino {
  metodo?: string;
  headers?: Record<string, string>;
  corpo?: string | Uint8Array;
  /**
   * Quantos redirecionamentos seguir. Padrão 0: o 3xx volta como resposta, igual
   * ao `fetch` com `redirect: "manual"`. Cada salto passa pela política inteira.
   */
  maxRedirecionamentos?: number;
  /** Prazo TOTAL (DNS, conexão, cabeçalhos e corpo, todos os saltos). Padrão 10 s. */
  timeoutMs?: number;
  /** Teto do corpo lido, em bytes, contado sobre o que chega. Padrão 1 MiB. */
  maxBytes?: number;
  /** `false` devolve só o status e os cabeçalhos e derruba o corpo sem lê-lo. */
  lerResposta?: boolean;
  /** Cancelamento de quem chamou; soma-se ao prazo. */
  signal?: AbortSignal;
}

const TIMEOUT_PADRAO_MS = 10_000;
const MAX_BYTES_PADRAO = 1024 * 1024;

export interface RespostaSegura {
  status: number;
  headers: http.IncomingHttpHeaders;
  corpo: Buffer;
  /** A URL que respondeu — difere da pedida quando houve redirecionamento. */
  urlFinal: string;
}

function pedir(
  url: URL,
  enderecos: LookupAddress[],
  metodo: string,
  headers: Record<string, string>,
  corpo: string | Uint8Array | undefined,
  sinal: AbortSignal,
): Promise<http.IncomingMessage> {
  const transporte = url.protocol === "https:" ? https : http;
  const host = semColchetes(url.hostname);
  return new Promise((resolve, reject) => {
    const req = transporte.request(
      url,
      {
        method: metodo,
        // Os cabeçalhos que o `fetch` mandava por conta própria: receptor e WAF que
        // recusam requisição sem User-Agent continuam atendidos.
        headers: { "user-agent": "node", accept: "*/*", "accept-encoding": "identity", ...headers },
        agent: false,
        signal: sinal,
        lookup: lookupFixado(host, enderecos),
        ...(url.protocol === "https:" && !isIPv4(host) && !isIPv6(host) ? { servername: host } : {}),
      },
      resolve,
    );
    req.once("error", reject);
    req.end(corpo === undefined ? undefined : Buffer.from(corpo));
  });
}

async function lerCorpo(resposta: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  const anunciado = Number(resposta.headers["content-length"]);
  if (Number.isFinite(anunciado) && anunciado > maxBytes) {
    resposta.destroy();
    throw new ErroDeRedeSegura("net:response_too_large");
  }
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of resposta) {
    const bytes = Buffer.from(parte);
    total += bytes.length;
    if (total > maxBytes) {
      resposta.destroy();
      throw new ErroDeRedeSegura("net:response_too_large");
    }
    partes.push(bytes);
  }
  return Buffer.concat(partes);
}

const STATUS_DE_REDIRECIONAMENTO = new Set([301, 302, 303, 307, 308]);
const CABECALHO_DE_CREDENCIAL = /^(authorization|cookie|proxy-authorization)$|key|token|secret|signature|auth/i;

/** Cabeçalhos de credencial não atravessam para outra origem. */
function semCredenciais(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([nome]) => !CABECALHO_DE_CREDENCIAL.test(nome)));
}

/** O salto final da cadeia: a resposta aberta, ainda sem corpo lido. */
interface Conexao {
  status: number;
  resposta: http.IncomingMessage;
  /** A URL que respondeu — difere da pedida quando houve redirecionamento. */
  urlFinal: string;
}

type OpcoesDaConexao = PoliticaDeDestino &
  Pick<OpcoesDeBusca, "metodo" | "headers" | "corpo" | "maxRedirecionamentos">;

/**
 * Resolve, julga, conecta e segue os redirecionamentos permitidos, até a
 * resposta final com o corpo ainda por ler. Quem chama decide como o corpo é
 * consumido (inteiro em `buscarSeguro`, em fluxo em `buscarSeguroEmFluxo`);
 * a política é a mesma nos dois, porque ela mora aqui.
 */
async function abrirConexao(
  bruta: string,
  opcoes: OpcoesDaConexao,
  sinal: AbortSignal,
  aoReceber: (resposta: http.IncomingMessage) => void,
): Promise<Conexao> {
  const maxSaltos = opcoes.maxRedirecionamentos ?? 0;
  let url = validarUrl(bruta, opcoes);
  let metodo = (opcoes.metodo ?? "GET").toUpperCase();
  let headers = opcoes.headers ?? {};
  let corpo = opcoes.corpo;

  for (let salto = 0; ; salto++) {
    const enderecos = await resolverEJulgar(url.hostname, opcoes);
    const resposta = await pedir(url, enderecos, metodo, headers, corpo, sinal);
    aoReceber(resposta);
    const status = resposta.statusCode ?? 0;
    const destino = resposta.headers.location;

    if (maxSaltos > 0 && STATUS_DE_REDIRECIONAMENTO.has(status) && destino) {
      resposta.destroy();
      if (salto >= maxSaltos) throw new ErroDeRedeSegura("net:too_many_redirects");
      let proxima: URL;
      try {
        proxima = new URL(destino, url);
      } catch {
        throw new ErroDeRedeSegura("unsafe_url:invalid");
      }
      proxima = validarUrl(proxima.toString(), opcoes);
      if (proxima.origin !== url.origin) headers = semCredenciais(headers);
      if (status === 303 || ((status === 301 || status === 302) && metodo === "POST")) {
        metodo = "GET";
        corpo = undefined;
        headers = Object.fromEntries(Object.entries(headers).filter(([nome]) => !/^content-/i.test(nome)));
      }
      url = proxima;
      continue;
    }
    return { status, resposta, urlFinal: url.toString() };
  }
}

/** O erro de transporte com código estável; o detalhe do socket fica na causa. */
function comoErroDeRede(erro: unknown): ErroDeRedeSegura {
  // `fetch failed`/ECONNREFUSED/ENOTFOUND chegam com o detalhe do socket; o
  // código estável é o que a tela e o log mostram, e a causa fica encadeada
  // para `lib/net/alcance.ts` distinguir "não existe" de "caiu".
  return erro instanceof ErroDeRedeSegura ? erro : new ErroDeRedeSegura("net:connection_failed", { cause: erro });
}

export async function buscarSeguro(bruta: string, opcoes: OpcoesDeBusca = {}): Promise<RespostaSegura> {
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(new ErroDeRedeSegura("net:timeout")), opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS);
  const aoCancelar = () => controle.abort(new ErroDeRedeSegura("net:aborted"));
  if (opcoes.signal?.aborted) aoCancelar();
  else opcoes.signal?.addEventListener("abort", aoCancelar, { once: true });

  // O que estiver em voo quando o prazo vence é derrubado: socket aberto depois
  // do estouro seria exatamente o vazamento que o teto de tempo existe para evitar.
  let emVoo: http.IncomingMessage | null = null;
  const estouro = new Promise<never>((_, rejeitar) => {
    const falhar = () => {
      emVoo?.destroy();
      rejeitar(controle.signal.reason);
    };
    if (controle.signal.aborted) falhar();
    else controle.signal.addEventListener("abort", falhar, { once: true });
  });
  estouro.catch(() => undefined);

  const executar = async (): Promise<RespostaSegura> => {
    const { status, resposta, urlFinal } = await abrirConexao(bruta, opcoes, controle.signal, (r) => (emVoo = r));
    if (opcoes.lerResposta === false) {
      resposta.destroy();
      return { status, headers: resposta.headers, corpo: Buffer.alloc(0), urlFinal };
    }
    const lido = await lerCorpo(resposta, opcoes.maxBytes ?? MAX_BYTES_PADRAO);
    return { status, headers: resposta.headers, corpo: lido, urlFinal };
  };

  try {
    return await Promise.race([executar(), estouro]);
  } catch (erro) {
    throw comoErroDeRede(erro);
  } finally {
    clearTimeout(prazo);
    opcoes.signal?.removeEventListener("abort", aoCancelar);
  }
}

// ─── O corpo em fluxo ───────────────────────────────────────────────────────

export interface OpcoesDeFluxo extends PoliticaDeDestino {
  metodo?: string;
  headers?: Record<string, string>;
  corpo?: string | Uint8Array;
  /** Igual a `OpcoesDeBusca.maxRedirecionamentos`; padrão 0. */
  maxRedirecionamentos?: number;
  /** Prazo para os CABEÇALHOS chegarem (DNS, conexão, todos os saltos). Padrão 10 s. */
  timeoutMs?: number;
  /**
   * Silêncio máximo entre dois trechos do corpo. O corpo de um modelo dura o que
   * a geração durar, então o prazo não é total: é o servidor ficar calado. Cada
   * trecho renova o prazo; sem leitor (contrapressão) ele não corre. Padrão 60 s.
   */
  timeoutEntreTrechosMs?: number;
  /** Teto do corpo INTEIRO, em bytes, contado sobre o que sai decodificado. Padrão 64 MiB. */
  maxBytes?: number;
  /** Cancelamento de quem chamou; vale também durante a leitura do corpo. */
  signal?: AbortSignal;
}

const SILENCIO_PADRAO_MS = 60_000;
const MAX_BYTES_DO_FLUXO_PADRAO = 64 * 1024 * 1024;
const SEM_CORPO = new Set([204, 205, 304]);

export interface RespostaEmFluxo {
  status: number;
  /** Sem `content-encoding` nem `content-length` quando o corpo foi decodificado aqui. */
  headers: http.IncomingHttpHeaders;
  /** `null` quando a resposta não tem corpo (204/205/304, HEAD). */
  corpo: ReadableStream<Uint8Array> | null;
  urlFinal: string;
}

/** O decodificador do `content-encoding`, que o `fetch` aplicava e o `http` cru não. */
function decodificadorDe(codificacao: string | undefined): Transform | null {
  switch ((codificacao ?? "").trim().toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return createGunzip();
    case "deflate":
      return createInflate();
    case "br":
      return createBrotliDecompress();
    default:
      return null;
  }
}

function paraFluxoWeb(
  resposta: http.IncomingMessage,
  fonte: Readable,
  limites: { maxBytes: number; silencioMs: number },
  aoEncerrar: () => void,
): ReadableStream<Uint8Array> {
  const iterador = fonte[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
  let total = 0;
  let relogio: NodeJS.Timeout | undefined;
  const encerrar = () => {
    clearTimeout(relogio);
    aoEncerrar();
  };
  return new ReadableStream<Uint8Array>(
    {
      async pull(controle) {
        relogio = setTimeout(() => resposta.destroy(new ErroDeRedeSegura("net:timeout")), limites.silencioMs);
        try {
          const { value, done } = await iterador.next();
          clearTimeout(relogio);
          if (done) {
            encerrar();
            controle.close();
            return;
          }
          total += value.length;
          if (total > limites.maxBytes) throw new ErroDeRedeSegura("net:response_too_large");
          controle.enqueue(new Uint8Array(value));
        } catch (erro) {
          encerrar();
          resposta.destroy();
          fonte.destroy();
          throw comoErroDeRede(erro);
        }
      },
      cancel() {
        encerrar();
        resposta.destroy();
        fonte.destroy();
      },
    },
    // Sem fila adiantada: ler do socket só quando o consumidor pede.
    { highWaterMark: 0 },
  );
}

/**
 * `buscarSeguro` com o corpo EM FLUXO (issue #108): a mesma política de destino,
 * a mesma conexão presa ao endereço julgado, mas a resposta é devolvida assim que
 * os cabeçalhos chegam e o corpo é lido sob demanda. É o que um SDK de modelo
 * precisa — a resposta é SSE e dura o tempo da geração.
 *
 * Os limites mudam de natureza para caber nisso: o prazo total vira prazo de
 * cabeçalhos (`timeoutMs`) mais silêncio máximo entre trechos
 * (`timeoutEntreTrechosMs`), e o teto de bytes vale para o corpo inteiro, contado
 * trecho a trecho. Estourar qualquer um derruba o socket e o fluxo termina com o
 * `ErroDeRedeSegura` correspondente.
 */
export async function buscarSeguroEmFluxo(bruta: string, opcoes: OpcoesDeFluxo = {}): Promise<RespostaEmFluxo> {
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(new ErroDeRedeSegura("net:timeout")), opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS);
  const aoCancelar = () => controle.abort(new ErroDeRedeSegura("net:aborted"));
  if (opcoes.signal?.aborted) aoCancelar();
  else opcoes.signal?.addEventListener("abort", aoCancelar, { once: true });
  const soltarSinal = () => opcoes.signal?.removeEventListener("abort", aoCancelar);

  let emVoo: http.IncomingMessage | null = null;
  const estouro = new Promise<never>((_, rejeitar) => {
    const falhar = () => {
      emVoo?.destroy(controle.signal.reason);
      rejeitar(controle.signal.reason);
    };
    if (controle.signal.aborted) falhar();
    else controle.signal.addEventListener("abort", falhar, { once: true });
  });
  estouro.catch(() => undefined);

  let conexao: Conexao;
  try {
    conexao = await Promise.race([abrirConexao(bruta, opcoes, controle.signal, (r) => (emVoo = r)), estouro]);
  } catch (erro) {
    soltarSinal();
    throw comoErroDeRede(erro);
  } finally {
    // Os cabeçalhos chegaram (ou falhou): o prazo de cabeçalhos acabou. Daqui em
    // diante só o silêncio entre trechos e o cancelamento de quem chamou valem.
    clearTimeout(prazo);
  }

  const { status, resposta, urlFinal } = conexao;
  const metodo = (opcoes.metodo ?? "GET").toUpperCase();
  const maxBytes = opcoes.maxBytes ?? MAX_BYTES_DO_FLUXO_PADRAO;
  const decodificador = decodificadorDe(resposta.headers["content-encoding"]);
  const headers: http.IncomingHttpHeaders = { ...resposta.headers };
  if (decodificador) {
    delete headers["content-encoding"];
    delete headers["content-length"];
  }

  if (metodo === "HEAD" || SEM_CORPO.has(status)) {
    resposta.destroy();
    soltarSinal();
    return { status, headers, corpo: null, urlFinal };
  }

  const anunciado = Number(resposta.headers["content-length"]);
  if (!decodificador && Number.isFinite(anunciado) && anunciado > maxBytes) {
    resposta.destroy();
    soltarSinal();
    throw new ErroDeRedeSegura("net:response_too_large");
  }

  // Cancelar durante a leitura derruba a resposta com o motivo, e o fluxo erra com ele.
  const aoAbortar = () => resposta.destroy(controle.signal.reason);
  controle.signal.addEventListener("abort", aoAbortar, { once: true });

  let fonte: Readable = resposta;
  if (decodificador) {
    pipeline(resposta, decodificador, () => undefined);
    fonte = decodificador;
  }
  const corpo = paraFluxoWeb(
    resposta,
    fonte,
    { maxBytes, silencioMs: opcoes.timeoutEntreTrechosMs ?? SILENCIO_PADRAO_MS },
    () => {
      controle.signal.removeEventListener("abort", aoAbortar);
      soltarSinal();
    },
  );
  return { status, headers, corpo, urlFinal };
}

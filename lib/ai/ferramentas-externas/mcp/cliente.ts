/**
 * O CLIENTE MCP do produto: fala com um servidor MCP de terceiros pelo transporte
 * Streamable HTTP, e SÓ pela rede segura única (`lib/net/rede-segura`).
 *
 * Por que não o cliente do SDK: o transporte dele abre o `fetch` global, que resolve o nome
 * DE NOVO na hora de conectar (a janela de DNS rebinding que a rede segura existe para
 * fechar), segue redirecionamento sozinho e lê o fluxo sem teto de bytes. Aqui cada pedido
 * passa por `buscarSeguro`: endereço julgado e fixado no socket, sem redirecionamento, com
 * prazo TOTAL e teto de bytes contado sobre o que chega.
 *
 * O que é falado (o suficiente para listar e chamar ferramentas):
 *   1. `initialize` — negocia a versão do protocolo e abre a sessão, se o servidor usar sessão;
 *   2. `notifications/initialized`;
 *   3. `tools/list` (com paginação) ou `tools/call`;
 *   4. fecha a sessão (cortesia, sem esperar).
 * A resposta de cada POST vem como JSON ou como fluxo SSE com a resposta dentro — os dois são
 * lidos por inteiro, com teto. O fluxo separado de notificações do servidor (GET) NÃO é aberto:
 * o agente não recebe nada que o servidor "empurre".
 *
 * Duas fases, um critério: a falha ANTES de `tools/call` sair (apresentação, aviso) é CERTA —
 * nada foi executado lá. Depois que o pedido saiu, só a recusa explícita é certa; prazo, rede,
 * 5xx e resposta ilegível deixam o desfecho INCERTO, e ação que altera não se repete nesse caso.
 *
 * Nada aqui lança: todo desfecho é um resultado.
 */
import { ErroDeRedeSegura, buscarSeguro, type PoliticaDeDestino } from "@/lib/net/rede-segura";

import { conteudoDeTexto, motivoDoErro, type ResultadoDaChamada } from "../chamar";
import { MOTIVOS_DE_FALHA_CERTA, type MotivoDeFalha } from "../tipos";
import { sanitizarTextoDoServidor } from "./esquema";
import {
  CABECALHO_PADRAO_DA_CREDENCIAL,
  LIMITES_DO_MCP,
  VERSOES_DO_PROTOCOLO,
  recusaDoCabecalho,
  type FerramentaDoServidor,
  type InfoDoServidor,
} from "./tipos";

export interface ServidorMcp {
  url: string;
  /** A credencial em claro, ou `null` (servidor sem credencial). */
  credencial: string | null;
  /** O cabeçalho que a leva. `authorization` manda `Bearer <credencial>`; outro nome manda o valor cru. */
  cabecalho: string;
}

export interface DependenciasDoMcp {
  /**
   * Quem escolhe o endereço é uma ORGANIZAÇÃO (admin): nenhuma válvula de destino interno da
   * instalação vale aqui. Só o teste traz uma política própria (o servidor dele está em 127.0.0.1).
   */
  politica?: PoliticaDeDestino;
  dormir?: (ms: number) => Promise<void>;
  /** O prazo TOTAL de uma tentativa (apresentação, aviso e a operação). */
  timeoutMs?: number;
  agora?: () => number;
}

class FalhaMcp extends Error {
  constructor(
    readonly motivo: MotivoDeFalha,
    readonly httpStatus: number | null,
    readonly detalhe?: string,
    /**
     * Substitui a regra «o motivo é de desfecho certo ou incerto». A falha da apresentação é CERTA
     * (`false`) qualquer que seja o motivo: nada foi executado lá. Ausente = vale a regra do motivo.
     */
    readonly incerto?: boolean,
  ) {
    super(motivo);
  }
}

function politicaPadrao(deps: DependenciasDoMcp): PoliticaDeDestino {
  return deps.politica ?? { permitirHttp: process.env.NODE_ENV !== "production" };
}

function valorDaCredencial(servidor: ServidorMcp): string | null {
  if (!servidor.credencial) return null;
  if (servidor.cabecalho.toLowerCase() !== CABECALHO_PADRAO_DA_CREDENCIAL) return servidor.credencial;
  // Quem colou «Bearer abc» (ou «Basic …») inteiro não leva «Bearer Bearer abc».
  return /^(bearer|basic)\s/i.test(servidor.credencial) ? servidor.credencial : `Bearer ${servidor.credencial}`;
}

function motivoDoStatus(status: number): { motivo: MotivoDeFalha; repetivel: boolean } {
  if (status >= 300 && status < 400) return { motivo: "redirecionamento", repetivel: false };
  if (status === 401 || status === 403) return { motivo: "credencial_recusada", repetivel: false };
  if (status === 408 || status === 429 || status >= 500) return { motivo: "erro_do_outro_sistema", repetivel: true };
  return { motivo: "recusada_pelo_outro_sistema", repetivel: false };
}

interface MensagemRpc {
  jsonrpc?: string;
  id?: unknown;
  result?: unknown;
  error?: { code?: unknown; message?: unknown };
  method?: unknown;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
}

/** As mensagens JSON-RPC que um corpo carrega: JSON simples, lote ou fluxo SSE. */
function mensagensDoCorpo(tipo: string, corpo: string): MensagemRpc[] {
  if (/text\/event-stream/i.test(tipo)) {
    const mensagens: MensagemRpc[] = [];
    for (const evento of corpo.split(/\r?\n\r?\n/)) {
      const dados = evento
        .split(/\r?\n/)
        .filter((linha) => linha.startsWith("data:"))
        .map((linha) => linha.slice(5).replace(/^ /, ""))
        .join("\n");
      if (!dados.trim()) continue;
      try {
        const lido = JSON.parse(dados) as unknown;
        for (const m of Array.isArray(lido) ? lido : [lido]) {
          if (objeto(m)) mensagens.push(m as MensagemRpc);
        }
      } catch {
        /* evento que não é JSON-RPC: ignorado */
      }
    }
    return mensagens;
  }
  try {
    const lido = JSON.parse(corpo) as unknown;
    return (Array.isArray(lido) ? lido : [lido]).filter((m): m is MensagemRpc => objeto(m) !== null);
  } catch {
    return [];
  }
}

/** Uma sessão aberta: já apresentada ao servidor e avisada. */
interface Sessao {
  info: InfoDoServidor;
  requisitar: (metodo: string, params: unknown, maxBytes: number) => Promise<unknown>;
}

async function comSessao<T>(
  servidor: ServidorMcp,
  deps: DependenciasDoMcp,
  operacao: (sessao: Sessao) => Promise<T>,
): Promise<{ ok: true; valor: T } | { ok: false; falha: FalhaMcp }> {
  const agora = deps.agora ?? Date.now;
  const prazoTotal = deps.timeoutMs ?? LIMITES_DO_MCP.timeoutMs;
  const inicio = agora();
  const politica = politicaPadrao(deps);
  const credencial = valorDaCredencial(servidor);
  const nomeDoCabecalho = servidor.cabecalho.toLowerCase();
  // Linha escrita por fora da tela com um cabeçalho que o protocolo controla (`content-type`, `host`…):
  // a credencial NÃO sai por ele — falha fechada, antes de qualquer conexão.
  if (credencial && recusaDoCabecalho(servidor.cabecalho) !== null) {
    return { ok: false, falha: new FalhaMcp("protocolo_invalido", null, undefined, false) };
  }

  let idDaSessao: string | null = null;
  let versao: string | null = null;
  let proximoId = 1;
  let chamadaSaiu = false;

  const cabecalhos = (): Record<string, string> => ({
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "user-agent": "AgentMcpClient/1.0",
    ...(versao ? { "mcp-protocol-version": versao } : {}),
    ...(idDaSessao ? { "mcp-session-id": idDaSessao } : {}),
    ...(credencial ? { [nomeDoCabecalho]: credencial } : {}),
  });

  const restante = () => prazoTotal - (agora() - inicio);

  async function enviar(corpo: Record<string, unknown>, maxBytes: number) {
    const sobra = restante();
    if (sobra <= 0) throw new FalhaMcp("timeout", null);
    try {
      return await buscarSeguro(servidor.url, {
        ...politica,
        metodo: "POST",
        headers: cabecalhos(),
        corpo: JSON.stringify(corpo),
        timeoutMs: sobra,
        maxBytes,
        // Sem `maxRedirecionamentos`: o 3xx volta como resposta e vira falha. A credencial não vai
        // atrás de um endereço que ninguém cadastrou.
      });
    } catch (erro) {
      if (erro instanceof ErroDeRedeSegura) {
        const { motivo } = motivoDoErro(erro);
        // Na recusa da política o código (`unsafe_url:*`) vai junto: é com ele que a tela diz a CAUSA
        // certa («não encontrei este nome» não é «rede interna»).
        throw new FalhaMcp(motivo, null, erro.ehRecusa ? erro.codigo : undefined);
      }
      throw new FalhaMcp("rede", null);
    }
  }

  async function requisitar(metodo: string, params: unknown, maxBytes: number): Promise<unknown> {
    const id = proximoId++;
    const res = await enviar({ jsonrpc: "2.0", id, method: metodo, ...(params !== undefined ? { params } : {}) }, maxBytes);
    if (res.status < 200 || res.status >= 300) {
      const { motivo } = motivoDoStatus(res.status);
      throw new FalhaMcp(motivo, res.status);
    }
    const recebido = res.headers["mcp-session-id"];
    // O id da sessão volta em todo pedido seguinte: só aceita o que um cabeçalho pode carregar (ASCII
    // visível, curto) — o que o servidor mandar fora disso é ignorado, não repassado.
    if (metodo === "initialize" && typeof recebido === "string" && /^[!-~]{1,256}$/.test(recebido)) idDaSessao = recebido;
    const tipo = String(res.headers["content-type"] ?? "");
    const mensagem = mensagensDoCorpo(tipo, res.corpo.toString("utf8")).find((m) => m.id === id);
    if (!mensagem) throw new FalhaMcp("protocolo_invalido", res.status);
    if (mensagem.error) {
      const codigo = typeof mensagem.error.code === "number" ? mensagem.error.code : null;
      // -32601 (método inexistente) e -32602 (dados inválidos): o servidor RECUSOU, não executou.
      const recusa = codigo === -32601 || codigo === -32602;
      const texto = typeof mensagem.error.message === "string" ? sanitizarTextoDoServidor(mensagem.error.message, 200) : undefined;
      throw new FalhaMcp(recusa ? "recusada_pelo_outro_sistema" : "erro_do_outro_sistema", res.status, texto);
    }
    return mensagem.result;
  }

  async function avisar(metodo: string): Promise<void> {
    const res = await enviar({ jsonrpc: "2.0", method: metodo }, LIMITES_DO_MCP.maxBytesDaResposta);
    if (res.status < 200 || res.status >= 300) {
      const { motivo } = motivoDoStatus(res.status);
      throw new FalhaMcp(motivo, res.status);
    }
  }

  async function encerrar(): Promise<void> {
    if (!idDaSessao) return;
    try {
      await buscarSeguro(servidor.url, {
        ...politica,
        metodo: "DELETE",
        headers: cabecalhos(),
        timeoutMs: Math.min(LIMITES_DO_MCP.timeoutDeEncerrarMs, Math.max(restante(), 200)),
        maxBytes: 4_096,
        lerResposta: false,
      });
    } catch {
      /* cortesia: o servidor expira a sessão sozinho */
    }
  }

  try {
    // 1 e 2: apresentar-se e avisar. Falhou aqui, nada foi executado.
    let info: InfoDoServidor;
    try {
      const resultado = objeto(
        await requisitar(
          "initialize",
          {
            protocolVersion: VERSOES_DO_PROTOCOLO[0],
            capabilities: {},
            clientInfo: { name: "agent-mcp-client", version: "1.0.0" },
          },
          LIMITES_DO_MCP.maxBytesDaResposta,
        ),
      );
      const negociada = typeof resultado?.protocolVersion === "string" ? resultado.protocolVersion : null;
      if (!negociada || !(VERSOES_DO_PROTOCOLO as readonly string[]).includes(negociada)) {
        throw new FalhaMcp("protocolo_invalido", null);
      }
      versao = negociada;
      const dadosDoServidor = objeto(resultado?.serverInfo);
      info = {
        nome: typeof dadosDoServidor?.name === "string" ? sanitizarTextoDoServidor(dadosDoServidor.name, 80) : null,
        versao: typeof dadosDoServidor?.version === "string" ? sanitizarTextoDoServidor(dadosDoServidor.version, 40) : null,
        protocolo: negociada,
      };
      await avisar("notifications/initialized");
    } catch (erro) {
      if (erro instanceof FalhaMcp) {
        throw new FalhaMcp(erro.motivo, erro.httpStatus, erro.detalhe, false);
      }
      throw erro;
    }

    // 3: a operação.
    const sessao: Sessao = {
      info,
      requisitar: async (metodo, params, maxBytes) => {
        if (metodo === "tools/call") chamadaSaiu = true;
        return requisitar(metodo, params, maxBytes);
      },
    };
    return { ok: true, valor: await operacao(sessao) };
  } catch (erro) {
    if (erro instanceof FalhaMcp) {
      // A falha de depois do pedido ter saído segue a regra do motivo; a de antes é certa.
      return {
        ok: false,
        falha:
          erro.incerto === undefined && !chamadaSaiu
            ? new FalhaMcp(erro.motivo, erro.httpStatus, erro.detalhe, false)
            : erro,
      };
    }
    return { ok: false, falha: new FalhaMcp("rede", null, undefined, chamadaSaiu ? undefined : false) };
  } finally {
    await encerrar();
  }
}

// ─── Listar as ferramentas ───────────────────────────────────────────────────

export type ResultadoDaListagem =
  | {
      ok: true;
      servidor: InfoDoServidor;
      ferramentas: FerramentaDoServidor[];
      /** O servidor tem mais ferramentas do que a descoberta devolve (páginas ou teto). */
      listaIncompleta: boolean;
    }
  | { ok: false; motivo: MotivoDeFalha; httpStatus: number | null; detalhe?: string };

const NOME_DE_FERRAMENTA_NO_SERVIDOR = /^[A-Za-z0-9_.-]{1,128}$/;

function ferramentaDoServidor(bruta: unknown): FerramentaDoServidor | null {
  const t = objeto(bruta);
  if (!t || typeof t.name !== "string" || !NOME_DE_FERRAMENTA_NO_SERVIDOR.test(t.name)) return null;
  const anotacoes = objeto(t.annotations);
  return {
    nome: t.name,
    titulo: typeof t.title === "string" && t.title.trim() ? sanitizarTextoDoServidor(t.title, 60) : null,
    descricao: typeof t.description === "string" ? sanitizarTextoDoServidor(t.description, 600) : "",
    esquema: t.inputSchema ?? null,
    somenteLeituraDeclarado: typeof anotacoes?.readOnlyHint === "boolean" ? anotacoes.readOnlyHint : null,
  };
}

/** Lista as ferramentas do servidor. É também o «teste de conexão»: apresentou-se e listou, funciona. */
export async function listarFerramentasDoServidor(
  servidor: ServidorMcp,
  deps: DependenciasDoMcp = {},
): Promise<ResultadoDaListagem> {
  const feito = await comSessao(servidor, deps, async (sessao) => {
    const ferramentas: FerramentaDoServidor[] = [];
    let cursor: string | null = null;
    let incompleta = false;
    for (let pagina = 0; pagina < LIMITES_DO_MCP.maxPaginasDaLista; pagina++) {
      const resultado = objeto(
        await sessao.requisitar("tools/list", cursor ? { cursor } : {}, LIMITES_DO_MCP.maxBytesDaLista),
      );
      const lista = Array.isArray(resultado?.tools) ? resultado.tools : null;
      if (!lista) throw new FalhaMcp("protocolo_invalido", null);
      for (const bruta of lista) {
        const t = ferramentaDoServidor(bruta);
        if (!t) continue;
        if (ferramentas.length >= LIMITES_DO_MCP.maxFerramentasDescobertas) {
          incompleta = true;
          break;
        }
        ferramentas.push(t);
      }
      cursor = typeof resultado?.nextCursor === "string" && resultado.nextCursor ? resultado.nextCursor : null;
      if (!cursor) break;
      if (pagina === LIMITES_DO_MCP.maxPaginasDaLista - 1) incompleta = true;
    }
    return { ferramentas, incompleta, info: sessao.info };
  });
  if (!feito.ok) {
    return { ok: false, motivo: feito.falha.motivo, httpStatus: feito.falha.httpStatus, ...(feito.falha.detalhe ? { detalhe: feito.falha.detalhe } : {}) };
  }
  return { ok: true, servidor: feito.valor.info, ferramentas: feito.valor.ferramentas, listaIncompleta: feito.valor.incompleta };
}

// ─── Chamar uma ferramenta ───────────────────────────────────────────────────

export interface EntradaDaChamadaMcp {
  servidor: ServidorMcp;
  /** O nome da ferramenta NO SERVIDOR. */
  ferramenta: string;
  /** `altera` não repete nunca. */
  efeito: "consulta" | "altera";
  /** O que o agente preencheu, JÁ validado contra o esquema da ferramenta. */
  argumentos: Record<string, unknown>;
  /** O id do pedido aprovado, para o servidor poder deduplicar (`_meta`). */
  idDeEntrega?: string;
}

/** O texto de um resultado de `tools/call`: só texto chega ao agente; o resto é dito, não enviado. */
function textoDoResultado(resultado: Record<string, unknown>): string {
  const partes = Array.isArray(resultado.content) ? resultado.content : [];
  const textos: string[] = [];
  for (const bruta of partes) {
    const parte = objeto(bruta);
    if (!parte) continue;
    if (parte.type === "text" && typeof parte.text === "string") textos.push(parte.text);
    else if (parte.type === "resource" && typeof objeto(parte.resource)?.text === "string") textos.push(String(objeto(parte.resource)!.text));
    else if (typeof parte.type === "string") textos.push(`[conteúdo do tipo ${sanitizarTextoDoServidor(parte.type, 20)} omitido]`);
  }
  if (textos.length === 0 && resultado.structuredContent !== undefined) {
    return JSON.stringify(resultado.structuredContent);
  }
  return textos.join("\n");
}

export async function chamarFerramentaDoServidor(
  entrada: EntradaDaChamadaMcp,
  deps: DependenciasDoMcp = {},
): Promise<ResultadoDaChamada> {
  const agora = deps.agora ?? Date.now;
  const dormir = deps.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const inicio = agora();
  const teto = entrada.efeito === "altera" ? 1 : LIMITES_DO_MCP.tentativasDaConsulta;

  let ultima: FalhaMcp = new FalhaMcp("rede", null);
  let usadas = 0;
  for (let tentativa = 1; tentativa <= teto; tentativa++) {
    usadas = tentativa;
    const feito = await comSessao(entrada.servidor, deps, async (sessao) => {
      return objeto(
        await sessao.requisitar(
          "tools/call",
          {
            name: entrada.ferramenta,
            arguments: entrada.argumentos,
            ...(entrada.idDeEntrega ? { _meta: { "agent/delivery_id": entrada.idDeEntrega } } : {}),
          },
          LIMITES_DO_MCP.maxBytesDaResposta,
        ),
      );
    });

    if (feito.ok) {
      const resultado = feito.valor;
      if (!resultado) {
        ultima = new FalhaMcp("protocolo_invalido", 200);
      } else if (resultado.isError === true) {
        // A ferramenta disse «deu erro». O que ela já tinha feito antes de falhar, ninguém sabe:
        // incerto, e o texto do erro (de terceiro, pode ter segredo) fica só para o administrador.
        const texto = conteudoDeTexto(textoDoResultado(resultado)).texto;
        return {
          ok: false,
          motivo: "ferramenta_com_erro",
          httpStatus: 200,
          tentativas: tentativa,
          duracaoMs: agora() - inicio,
          desfechoIncerto: true,
          ...(texto ? { detalhe: sanitizarTextoDoServidor(texto, 300) } : {}),
        };
      } else {
        const { texto, truncado } = conteudoDeTexto(textoDoResultado(resultado));
        return { ok: true, httpStatus: 200, conteudo: texto, truncado, tentativas: tentativa, duracaoMs: agora() - inicio };
      }
    } else {
      ultima = feito.falha;
    }

    const repetivel =
      ultima.motivo === "timeout" ||
      ultima.motivo === "rede" ||
      (ultima.motivo === "erro_do_outro_sistema" && ultima.httpStatus !== null);
    if (!repetivel || tentativa === teto) break;
    await dormir(LIMITES_DO_MCP.esperaEntreTentativasMs);
  }

  const incerto = ultima.incerto ?? !MOTIVOS_DE_FALHA_CERTA.has(ultima.motivo);
  return {
    ok: false,
    motivo: ultima.motivo,
    httpStatus: ultima.httpStatus,
    tentativas: usadas,
    duracaoMs: agora() - inicio,
    desfechoIncerto: incerto,
    ...(ultima.detalhe ? { detalhe: ultima.detalhe } : {}),
  };
}

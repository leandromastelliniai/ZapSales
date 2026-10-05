/**
 * O FALSO GRAPH — a fronteira de teste do canal oficial (issue #4).
 *
 * Um servidor HTTP de verdade em `127.0.0.1`, para onde a instalação aponta pelo
 * knob que já existe (`META_GRAPH_BASE_URL`, `lib/channels/meta/graph-base.ts`).
 * Ele faz duas coisas, e só elas:
 *
 * 1. **Grava cada chamada** (método, versão, caminho, busca, corpo, token) — é o
 *    que prova o que chegou à "Meta", pelo fio, sem dublê de `fetch`.
 * 2. **Responde como a Graph responde**: sucesso realista por rota (validar o
 *    número, listar os números da WABA, assinar o app, apontar o webhook, enviar
 *    mensagem, listar modelos) ou o erro PROGRAMADO pelo teste, com o corpo de
 *    erro no formato da Graph (`erroDaGraph`).
 *
 * O que ele NÃO é: um simulador de regra de negócio da Meta. Janela de 24h,
 * qualidade e limite de portfólio são decididos pelo teste, programando a
 * resposta — o falso Graph não inventa comportamento.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface ChamadaAoGraph {
  metodo: string;
  /** `v26.0` — o primeiro segmento do caminho. */
  versao: string;
  /** O caminho SEM a versão: `/123/messages`. */
  caminho: string;
  busca: string;
  corpo: Record<string, unknown> | null;
  authorization: string | undefined;
}

export interface RespostaDoGraph {
  status: number;
  corpo: unknown;
}

/** Quando a regra programada vale. Sem `caminho`, vale para qualquer caminho do método. */
export interface CasamentoDeChamada {
  metodo: "GET" | "POST" | "DELETE";
  /** O caminho sem a versão termina com isto (`/messages`, `/subscribed_apps`). */
  terminaCom?: string;
}

export interface OpcoesDoFalsoGraph {
  phoneNumberId: string;
  wabaId: string;
  /** O que o `GET /{número}` devolve. */
  numeroExibido?: string;
  nomeVerificado?: string;
}

export interface FalsoGraph {
  /** Para `META_GRAPH_BASE_URL`. */
  base: string;
  chamadas: ChamadaAoGraph[];
  /** A próxima chamada que casar recebe esta resposta (fila: uma vez por regra). */
  programar(casamento: CasamentoDeChamada, resposta: RespostaDoGraph): void;
  /** As chamadas à API de mensagens (`POST /{número}/messages`). */
  envios(): ChamadaAoGraph[];
  limpar(): void;
  fechar(): Promise<void>;
}

/**
 * Corpo de erro no formato da Graph (`{ error: { message, type, code, … } }`).
 * O status HTTP padrão é 400, que é o que a Cloud API devolve para recusa de
 * envio; limite de taxa costuma vir com 429 — o teste escolhe.
 */
export function erroDaGraph(
  code: number,
  opcoes: { status?: number; subcode?: number; message?: string; details?: string } = {},
): RespostaDoGraph {
  return {
    status: opcoes.status ?? 400,
    corpo: {
      error: {
        message: opcoes.message ?? `(#${code}) erro programado pelo teste`,
        type: "OAuthException",
        code,
        ...(opcoes.subcode !== undefined ? { error_subcode: opcoes.subcode } : {}),
        ...(opcoes.details ? { error_data: { messaging_product: "whatsapp", details: opcoes.details } } : {}),
        fbtrace_id: "FalsoGraphTrace",
      },
    },
  };
}

export async function subirFalsoGraph(opcoes: OpcoesDoFalsoGraph): Promise<FalsoGraph> {
  const chamadas: ChamadaAoGraph[] = [];
  const programadas: Array<{ casamento: CasamentoDeChamada; resposta: RespostaDoGraph }> = [];
  let contadorDeMensagens = 0;

  function respostaPadrao(c: ChamadaAoGraph): RespostaDoGraph {
    const { phoneNumberId, wabaId } = opcoes;
    if (c.metodo === "POST" && c.caminho === `/${phoneNumberId}/messages`) {
      // O "digitando"/lido não devolve mensagem — só sucesso.
      if (c.corpo?.status === "read") return { status: 200, corpo: { success: true } };
      contadorDeMensagens += 1;
      const destino = (c.corpo?.to ?? c.corpo?.recipient ?? "") as string;
      return {
        status: 200,
        corpo: {
          messaging_product: "whatsapp",
          contacts: [{ input: destino, wa_id: c.corpo?.to ? destino : undefined }],
          messages: [{ id: `wamid.FALSO.${contadorDeMensagens}` }],
        },
      };
    }
    if (c.metodo === "GET" && c.caminho === `/${phoneNumberId}`) {
      return {
        status: 200,
        corpo: {
          id: phoneNumberId,
          display_phone_number: opcoes.numeroExibido ?? "+55 31 90000-0000",
          verified_name: opcoes.nomeVerificado ?? "Loja de Teste",
          quality_rating: "GREEN",
        },
      };
    }
    if (c.metodo === "GET" && c.caminho === `/${wabaId}/phone_numbers`) {
      return { status: 200, corpo: { data: [{ id: phoneNumberId }] } };
    }
    if (c.metodo === "POST" && c.caminho === `/${wabaId}/subscribed_apps`) {
      return { status: 200, corpo: { success: true } };
    }
    if (c.metodo === "POST" && c.caminho === `/${phoneNumberId}`) {
      return { status: 200, corpo: { success: true } };
    }
    if (c.metodo === "GET" && c.caminho === `/${wabaId}/message_templates`) {
      return { status: 200, corpo: { data: [], paging: {} } };
    }
    return erroDaGraph(100, { message: `(#100) rota desconhecida no falso Graph: ${c.metodo} ${c.caminho}` });
  }

  function casa(casamento: CasamentoDeChamada, c: ChamadaAoGraph): boolean {
    if (casamento.metodo !== c.metodo) return false;
    return casamento.terminaCom === undefined || c.caminho.endsWith(casamento.terminaCom);
  }

  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    let bruto = "";
    for await (const pedaco of req) bruto += String(pedaco);
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const [, versao = "", ...resto] = url.pathname.split("/");
    let corpo: Record<string, unknown> | null = null;
    try {
      corpo = bruto ? (JSON.parse(bruto) as Record<string, unknown>) : null;
    } catch {
      corpo = { _bruto: bruto };
    }
    const chamada: ChamadaAoGraph = {
      metodo: req.method ?? "",
      versao,
      caminho: `/${resto.join("/")}`,
      busca: url.search,
      corpo,
      authorization: req.headers.authorization,
    };
    chamadas.push(chamada);

    const i = programadas.findIndex((p) => casa(p.casamento, chamada));
    const resposta = i >= 0 ? programadas.splice(i, 1)[0]!.resposta : respostaPadrao(chamada);
    res.statusCode = resposta.status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(resposta.corpo));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    base: `http://127.0.0.1:${port}`,
    chamadas,
    programar: (casamento, resposta) => programadas.push({ casamento, resposta }),
    envios: () =>
      chamadas.filter((c) => c.metodo === "POST" && c.caminho === `/${opcoes.phoneNumberId}/messages`),
    limpar: () => {
      chamadas.length = 0;
      programadas.length = 0;
    },
    fechar: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

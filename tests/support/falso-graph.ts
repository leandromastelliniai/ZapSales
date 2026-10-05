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
import { createHmac } from "node:crypto";
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
  /** O app dono do token (`debug_token.app_id`) — e o `client_id` da troca de código. */
  appId?: string;
  /**
   * O App Secret do app. Com ele, o falso Graph confere o `appsecret_proof` como a
   * Graph confere (HMAC-SHA256 do token com o segredo) e recusa o que não bate.
   */
  appSecret?: string;
  /** O que a troca do código do Embedded Signup devolve como token de negócio. */
  tokenDoEmbeddedSignup?: string;
  /**
   * O `client_secret` que a troca do código aceita. É o segredo do app da
   * INSTALAÇÃO (o Tech Provider) — pode ser outro app que não o do token do
   * assistente. Ausente = vale `appSecret`.
   */
  segredoDaTroca?: string;
  /**
   * Porta fixa. Sem ela o sistema escolhe uma livre — o certo quando o teste e
   * o app rodam no mesmo processo. A prova pela tela precisa da fixa: o
   * `next start` lê `META_GRAPH_BASE_URL` do `.env.e2e`, escrito antes de a
   * spec existir (`scripts/gerar-env-e2e.sh`).
   */
  porta?: number;
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
    const appId = opcoes.appId ?? "1234567890";
    const busca = new URLSearchParams(c.busca);
    // `appsecret_proof` errado é recusado em QUALQUER rota, como na Graph.
    const prova = busca.get("appsecret_proof");
    if (prova !== null && opcoes.appSecret) {
      const token = (c.authorization ?? "").replace(/^Bearer /, "");
      const esperada = createHmac("sha256", opcoes.appSecret).update(token).digest("hex");
      if (prova !== esperada) {
        return {
          status: 400,
          corpo: {
            error: {
              message: "Invalid appsecret_proof provided in the API argument",
              type: "GraphMethodException",
              code: 100,
              fbtrace_id: "FalsoGraphTrace",
            },
          },
        };
      }
    }
    if (c.metodo === "GET" && c.caminho === "/debug_token") {
      return {
        status: 200,
        corpo: {
          data: {
            app_id: appId,
            application: "App de Teste",
            type: "SYSTEM_USER",
            is_valid: true,
            expires_at: 0,
            data_access_expires_at: 0,
            scopes: ["whatsapp_business_management", "whatsapp_business_messaging", "business_management"],
            granular_scopes: [
              { scope: "whatsapp_business_management", target_ids: [wabaId] },
              { scope: "whatsapp_business_messaging", target_ids: [wabaId] },
            ],
          },
        },
      };
    }
    if (c.metodo === "GET" && c.caminho === "/app") {
      return { status: 200, corpo: { id: appId, name: "App de Teste" } };
    }
    if (c.metodo === "GET" && c.caminho === `/${wabaId}`) {
      return {
        status: 200,
        corpo: {
          id: wabaId,
          name: "Conta de Teste",
          business_verification_status: "verified",
          account_review_status: "APPROVED",
          primary_funding_id: "998877",
          health_status: {
            can_send_message: "AVAILABLE",
            entities: [
              { entity_type: "WABA", id: wabaId, can_send_message: "AVAILABLE" },
              { entity_type: "APP", id: appId, can_send_message: "AVAILABLE" },
            ],
          },
        },
      };
    }
    if (c.metodo === "POST" && c.caminho === `/${phoneNumberId}/register`) {
      return { status: 200, corpo: { success: true } };
    }
    if (c.metodo === "POST" && c.caminho === `/${appId}/subscriptions`) {
      return { status: 200, corpo: { success: true } };
    }
    if (c.metodo === "GET" && c.caminho === "/oauth/access_token") {
      const segredoDaTroca = opcoes.segredoDaTroca ?? opcoes.appSecret;
      if (busca.get("client_id") !== appId || (segredoDaTroca && busca.get("client_secret") !== segredoDaTroca)) {
        return erroDaGraph(100, { message: "Error validating client secret." });
      }
      return {
        status: 200,
        corpo: { access_token: opcoes.tokenDoEmbeddedSignup ?? "EAAG-token-do-embedded-signup", token_type: "bearer" },
      };
    }
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
          whatsapp_business_manager_messaging_limit: "TIER_2K",
        },
      };
    }
    if (c.metodo === "GET" && c.caminho === `/${wabaId}/phone_numbers`) {
      return {
        status: 200,
        corpo: {
          data: [
            {
              id: phoneNumberId,
              display_phone_number: opcoes.numeroExibido ?? "+55 31 90000-0000",
              verified_name: opcoes.nomeVerificado ?? "Loja de Teste",
              quality_rating: "GREEN",
              code_verification_status: "VERIFIED",
              status: "CONNECTED",
              account_mode: "LIVE",
              whatsapp_business_manager_messaging_limit: "TIER_2K",
            },
          ],
        },
      };
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
  await new Promise<void>((resolve) => server.listen(opcoes.porta ?? 0, "127.0.0.1", resolve));
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

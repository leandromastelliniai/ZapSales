/**
 * A REDE DA VITRINE: responde, no navegador, as rotas que os componentes REAIS da
 * Inbox pedem — com os dados de exemplo de `./_dados.ts`, e nunca com um banco.
 *
 * É isto que permite a vitrine ser a Inbox de verdade (filtros, lista, cabeçalho,
 * fio, campo de resposta) em vez de uma cópia desenhada à parte: o código é o
 * mesmo do produto; só a resposta é de mentira. Tudo passa por `fetch`
 * (`lib/api/client.ts`), então interceptá-lo cobre todas as buscas.
 *
 * O token do tempo real responde 401 de propósito: sem token, os canais ficam
 * quietos (tentam de novo em silêncio) em vez de abrir conexão para lugar nenhum.
 * Mutações (assumir, enviar…) respondem 403 com uma mensagem clara: a vitrine não
 * grava nada.
 */
import { CONVERSA_ABERTA, LISTA, MENSAGENS, PASSAGENS } from "./_dados";
import { DEFAULT_CHANNEL_PROVIDER } from "@/lib/channels/capabilities";

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function respostaDe(url: URL, metodo: string): Response | null {
  const caminho = url.pathname;
  if (!caminho.startsWith("/api/v1/")) return null;

  if (caminho === "/api/v1/auth/realtime-token") {
    return json({ error: { code: "unauthenticated", message: "vitrine sem tempo real" } }, 401);
  }
  if (metodo !== "GET") {
    return json({ error: { code: "forbidden", message: "A vitrine não grava nada." } }, 403);
  }
  if (caminho === "/api/v1/conversations/counts") {
    return json({ data: { fila: 3, automatico: 2, unassigned: 3, mine: 8, all: 14, closed: 0, archived: 0 } });
  }
  if (caminho === "/api/v1/channel-sessions") {
    return json({
      data: [
        {
          id: "canal-1",
          provider: DEFAULT_CHANNEL_PROVIDER,
          display_name: "Recepção",
          phone_number: "+55 11 4002-8922",
          status: "WORKING",
          status_reason: null,
          last_health_check_at: null,
          last_status_change_at: null,
          daily_message_limit: 1000,
          is_warmup_complete: true,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });
  }
  if (caminho === "/api/v1/conversations") {
    return json({ data: LISTA.map((l) => l.conversa), meta: { cursor: null, has_more: false } });
  }
  if (caminho === `/api/v1/conversations/${CONVERSA_ABERTA}/messages`) {
    return json({ data: MENSAGENS, meta: { cursor: null, has_more: false } });
  }
  if (caminho === `/api/v1/conversations/${CONVERSA_ABERTA}/passagens`) {
    return json({ data: PASSAGENS });
  }
  if (caminho.endsWith("/draft-reply")) return json({ data: { drafts: [] } });
  if (caminho === "/api/v1/ai/automatico-ativo") return json({ data: { ativo: true } });
  if (caminho === "/api/v1/voice/sessions/status") {
    return json({ data: { configured: false, channelSessionId: null, status: null, paired: false, jid: null } });
  }
  if (caminho === "/api/v1/contacts") return json({ data: [], meta: { cursor: null, has_more: false } });
  // Tudo o mais que a Inbox pede ao abrir é lista: vazia é o estado honesto.
  return json({ data: [] });
}

let instalada = false;

export function instalarRedeDeExemplo(): void {
  if (instalada || typeof window === "undefined") return;
  instalada = true;
  const original = window.fetch.bind(window);
  window.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const bruto = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const url = new URL(bruto, window.location.origin);
    const metodo = (init?.method ?? (entrada instanceof Request ? entrada.method : "GET")).toUpperCase();
    return respostaDe(url, metodo) ?? original(entrada, init);
  };
}

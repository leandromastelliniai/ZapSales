/**
 * WEBHOOK DA META ASSINADO, POSTADO NA ROTA REAL — o lado de entrada da fronteira
 * de teste do canal oficial (issue #4). O lado de saída é `falso-graph.ts`.
 *
 * A Meta assina o corpo CRU com o App Secret (HMAC SHA-256, cabeçalho
 * `X-Hub-Signature-256: sha256=<hex>`). Este auxiliar assina igual e entrega o
 * corpo ao `POST` de `app/api/v1/webhooks/meta/[token]/route.ts` — a mesma
 * função que o Next chama em produção. Assinatura inválida é um parâmetro, para
 * o teste provar a recusa.
 *
 * Os montadores (`mensagemRecebida`, `statusDeEntrega`) seguem o formato da
 * documentação da Cloud API, inclusive o BSUID (`user_id`, `from_user_id`,
 * `recipient_user_id`) e o `pricing` do status.
 */
import { createHmac } from "node:crypto";

import { NextRequest } from "next/server";

export function assinarCorpoMeta(corpo: string, appSecret: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(corpo, "utf8").digest("hex")}`;
}

export interface EntregaDeWebhook {
  /** O `webhook_path_token` da sessão — o que está na URL de callback. */
  token: string;
  appSecret: string;
  corpo: unknown;
  /** Para provar a recusa: assina com outro segredo, ou manda este valor cru. */
  assinatura?: string;
}

export async function postarWebhookMeta(entrega: EntregaDeWebhook): Promise<Response> {
  const corpo = typeof entrega.corpo === "string" ? entrega.corpo : JSON.stringify(entrega.corpo);
  const { POST } = await import("@/app/api/v1/webhooks/meta/[token]/route");
  const req = new NextRequest(`http://localhost/api/v1/webhooks/meta/${entrega.token}`, {
    method: "POST",
    body: corpo,
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": entrega.assinatura ?? assinarCorpoMeta(corpo, entrega.appSecret),
    },
  });
  return POST(req, { params: Promise.resolve({ token: entrega.token }) });
}

interface Origem {
  wabaId: string;
  phoneNumberId: string;
  numeroExibido?: string;
}

function envelope(origem: Origem, value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: origem.wabaId,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: origem.numeroExibido ?? "5531900000000",
                phone_number_id: origem.phoneNumberId,
              },
              ...value,
            },
          },
        ],
      },
    ],
  };
}

export function mensagemRecebida(
  origem: Origem,
  m: {
    wamid: string;
    texto: string;
    nome?: string;
    telefone?: string;
    bsuid?: string;
    quando?: Date;
    /** `context.id`: o `wamid` da nossa mensagem que esta responde (issue #11). */
    respondendoA?: string;
  },
) {
  const contato: Record<string, unknown> = { profile: { name: m.nome ?? "Cliente" } };
  if (m.telefone) contato.wa_id = m.telefone;
  if (m.bsuid) contato.user_id = m.bsuid;
  const mensagem: Record<string, unknown> = {
    id: m.wamid,
    timestamp: String(Math.floor((m.quando ?? new Date()).getTime() / 1000)),
    type: "text",
    text: { body: m.texto },
  };
  if (m.telefone) mensagem.from = m.telefone;
  if (m.bsuid) mensagem.from_user_id = m.bsuid;
  if (m.respondendoA) mensagem.context = { from: origem.numeroExibido ?? "5531900000000", id: m.respondendoA };
  return envelope(origem, { contacts: [contato], messages: [mensagem] });
}

/**
 * O toque num botão de resposta rápida de um MODELO (`type: "button"`), como a
 * Cloud API o entrega: o rótulo, o payload e o `context.id` da mensagem do modelo.
 */
export function toqueNoBotao(
  origem: Origem,
  b: { wamid: string; rotulo: string; payload?: string; respondendoA: string; telefone: string; nome?: string; quando?: Date },
) {
  return envelope(origem, {
    contacts: [{ wa_id: b.telefone, profile: { name: b.nome ?? "Cliente" } }],
    messages: [
      {
        from: b.telefone,
        id: b.wamid,
        timestamp: String(Math.floor((b.quando ?? new Date()).getTime() / 1000)),
        type: "button",
        context: { from: origem.numeroExibido ?? "5531900000000", id: b.respondendoA },
        button: { text: b.rotulo, payload: b.payload ?? b.rotulo },
      },
    ],
  });
}

export function statusDeEntrega(
  origem: Origem,
  s: {
    wamid: string;
    status: "sent" | "delivered" | "read" | "failed";
    telefone?: string;
    bsuid?: string;
    erro?: { code: number; title: string };
    categoria?: "marketing" | "utility" | "authentication" | "service";
  },
) {
  const status: Record<string, unknown> = {
    id: s.wamid,
    status: s.status,
    timestamp: String(Math.floor(Date.now() / 1000)),
    pricing: { billable: true, pricing_model: "PMP", type: "regular", category: s.categoria ?? "marketing" },
  };
  if (s.telefone) status.recipient_id = s.telefone;
  if (s.bsuid) status.recipient_user_id = s.bsuid;
  if (s.erro) status.errors = [{ code: s.erro.code, title: s.erro.title }];
  const contatos = s.bsuid || s.telefone
    ? [{ ...(s.telefone ? { wa_id: s.telefone } : {}), ...(s.bsuid ? { user_id: s.bsuid } : {}) }]
    : [];
  return envelope(origem, { ...(contatos.length ? { contacts: contatos } : {}), statuses: [status] });
}

/**
 * Evento de MODELO (issue #6): `message_template_status_update`,
 * `message_template_quality_update` ou `template_category_update`. Vêm no
 * `entry.id` da WABA, sem `metadata` de número — modelo é da conta, não do número.
 */
export function eventoDeModelo(
  wabaId: string,
  field: "message_template_status_update" | "message_template_quality_update" | "template_category_update",
  value: Record<string, unknown>,
) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: wabaId, time: Math.floor(Date.now() / 1000), changes: [{ field, value }] }],
  };
}

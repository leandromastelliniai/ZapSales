/**
 * O WEBHOOK DA META COM BSUID — quem tem nome de usuário pode chegar sem telefone.
 *
 * Desde 31/03/2026 todo webhook de mensagem traz o BSUID (`contacts[].user_id` e
 * `messages[].from_user_id`), e quando o usuário esconde o número a Meta OMITE
 * `wa_id` e `from`. Até a issue #4 o parser descartava essa mensagem em silêncio
 * (`if (!id || !from) continue`) — o contato falava e nada chegava.
 *
 * Formato conferido na documentação oficial (business-scoped-user-ids),
 * 04/10/2026; a fixture real `tests/fixtures/meta/inbound-webhooks.json` já
 * carregava os dois campos.
 */
import { describe, expect, it } from "vitest";

import { parseMetaWebhook, type InboundMessageEvent } from "@/lib/channels/meta/webhook";

function envelope(value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA1", changes: [{ field: "messages", value }] }],
  };
}

const METADATA = { display_phone_number: "5531900000000", phone_number_id: "PN1" };

function recebidas(value: Record<string, unknown>): InboundMessageEvent[] {
  return parseMetaWebhook(envelope(value) as never).filter(
    (e): e is InboundMessageEvent => e.kind === "inbound_message",
  );
}

describe("mensagem recebida com BSUID", () => {
  it("só BSUID (sem wa_id/from) NÃO é descartada: chega com o BSUID e telefone nulo", () => {
    const [e] = recebidas({
      messaging_product: "whatsapp",
      metadata: METADATA,
      contacts: [{ profile: { name: "Ana", username: "ana.loja" }, user_id: "BR.13491208655302741918" }],
      messages: [
        {
          from_user_id: "BR.13491208655302741918",
          id: "wamid.SO_BSUID",
          timestamp: "1759600000",
          type: "text",
          text: { body: "oi" },
        },
      ],
    });
    expect(e).toBeDefined();
    expect(e!.from).toBeNull();
    expect(e!.fromUserId).toBe("BR.13491208655302741918");
    expect(e!.profileName).toBe("Ana");
    expect(e!.text).toBe("oi");
  });

  it("BSUID e telefone juntos: os dois chegam no evento", () => {
    const [e] = recebidas({
      messaging_product: "whatsapp",
      metadata: METADATA,
      contacts: [{ profile: { name: "Bia" }, wa_id: "5531988887777", user_id: "BR.222" }],
      messages: [
        { from: "5531988887777", from_user_id: "BR.222", id: "wamid.AMBOS", timestamp: "1", type: "text", text: { body: "x" } },
      ],
    });
    expect(e).toMatchObject({ from: "5531988887777", fromUserId: "BR.222", profileName: "Bia" });
  });

  it("BSUID só no bloco de contatos (sem from_user_id na mensagem) também vale", () => {
    const [e] = recebidas({
      messaging_product: "whatsapp",
      metadata: METADATA,
      contacts: [{ profile: { name: "Caio" }, wa_id: "5531977776666", user_id: "BR.333" }],
      messages: [{ from: "5531977776666", id: "wamid.C", timestamp: "1", type: "text", text: { body: "x" } }],
    });
    expect(e).toMatchObject({ from: "5531977776666", fromUserId: "BR.333" });
  });

  it("telefone sem BSUID continua como sempre (webhook antigo)", () => {
    const [e] = recebidas({
      messaging_product: "whatsapp",
      metadata: METADATA,
      contacts: [{ profile: { name: "Dani" }, wa_id: "5531966665555" }],
      messages: [{ from: "5531966665555", id: "wamid.D", timestamp: "1", type: "text", text: { body: "x" } }],
    });
    expect(e).toMatchObject({ from: "5531966665555", fromUserId: null, profileName: "Dani" });
  });

  it("sem telefone E sem BSUID continua descartada — payload capenga", () => {
    expect(
      recebidas({
        messaging_product: "whatsapp",
        metadata: METADATA,
        messages: [{ id: "wamid.E", timestamp: "1", type: "text", text: { body: "x" } }],
      }),
    ).toEqual([]);
  });
});

describe("status de entrega com BSUID", () => {
  it("lê `recipient_user_id` quando o destinatário só tem BSUID", () => {
    const [s] = parseMetaWebhook(
      envelope({
        messaging_product: "whatsapp",
        metadata: METADATA,
        contacts: [{ user_id: "BR.444" }],
        statuses: [{ id: "wamid.S", status: "delivered", timestamp: "1", recipient_user_id: "BR.444" }],
      }) as never,
    );
    expect(s).toMatchObject({ kind: "message_status", recipient: null, recipientUserId: "BR.444" });
  });
});

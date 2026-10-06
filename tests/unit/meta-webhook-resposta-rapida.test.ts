import { describe, expect, it } from "vitest";

import { parseMetaWebhook, type InboundMessageEvent } from "@/lib/channels/meta/webhook";

/**
 * O clique num botão de resposta rápida (issue #11).
 *
 * Quem responde a uma campanha oficial muitas vezes não digita: toca no botão
 * do modelo. A Meta entrega esse toque como `type: "button"` (botão de modelo)
 * ou `type: "interactive"` (botão/lista de mensagem interativa) — e o parser só
 * lia `text.body`. O texto vinha nulo, o tipo cru caía no CHECK de
 * `messages.type`, e a resposta mais valiosa da campanha sumia na ingestão.
 *
 * Formatos conforme a documentação da Cloud API (webhooks › messages).
 */
const envelope = (mensagem: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA-1",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "5531900000000", phone_number_id: "PN-1" },
            contacts: [{ wa_id: "5531991234567", profile: { name: "Ana" } }],
            messages: [
              { from: "5531991234567", id: "wamid.RESPOSTA", timestamp: "1790000000", ...mensagem },
            ],
          },
        },
      ],
    },
  ],
});

const primeira = (mensagem: Record<string, unknown>) =>
  parseMetaWebhook(envelope(mensagem)).find(
    (e): e is InboundMessageEvent => e.kind === "inbound_message",
  );

describe("botão de modelo (`type: button`)", () => {
  const e = primeira({
    type: "button",
    context: { from: "5531900000000", id: "wamid.DA.CAMPANHA" },
    button: { payload: "QUERO", text: "Quero saber mais" },
  });

  it("vira mensagem de TEXTO com o rótulo do botão — o que o atendente lê na conversa", () => {
    expect(e).toMatchObject({ type: "text", text: "Quero saber mais" });
  });

  it("guarda o clique: o rótulo e o payload", () => {
    expect(e!.respostaRapida).toEqual({ texto: "Quero saber mais", payload: "QUERO" });
  });

  it("guarda a mensagem respondida (`context.id`) — é o que liga o clique à campanha", () => {
    expect(e!.respondendoA).toBe("wamid.DA.CAMPANHA");
  });
});

describe("mensagem interativa", () => {
  it("botão (`button_reply`): rótulo é o `title`, payload é o `id`", () => {
    const e = primeira({
      type: "interactive",
      context: { id: "wamid.X" },
      interactive: { type: "button_reply", button_reply: { id: "b-sim", title: "Sim" } },
    });
    expect(e).toMatchObject({ type: "text", text: "Sim", respondendoA: "wamid.X" });
    expect(e!.respostaRapida).toEqual({ texto: "Sim", payload: "b-sim" });
  });

  it("lista (`list_reply`): mesma regra", () => {
    const e = primeira({
      type: "interactive",
      interactive: {
        type: "list_reply",
        list_reply: { id: "op-2", title: "Segunda opção", description: "x" },
      },
    });
    expect(e).toMatchObject({ type: "text", text: "Segunda opção" });
    expect(e!.respostaRapida).toEqual({ texto: "Segunda opção", payload: "op-2" });
  });
});

describe("o que não é clique", () => {
  it("texto digitado não tem resposta rápida, mas guarda o `context` quando a pessoa citou", () => {
    const e = primeira({ type: "text", text: { body: "oi" }, context: { id: "wamid.CITADA" } });
    expect(e).toMatchObject({ type: "text", text: "oi", respondendoA: "wamid.CITADA" });
    expect(e!.respostaRapida).toBeNull();
  });

  it("sem `context`, `respondendoA` é nulo", () => {
    const e = primeira({ type: "text", text: { body: "oi" } });
    expect(e!.respondendoA).toBeNull();
  });

  it("botão sem rótulo nem payload não inventa clique", () => {
    const e = primeira({ type: "button", button: {} });
    expect(e!.respostaRapida).toBeNull();
  });
});

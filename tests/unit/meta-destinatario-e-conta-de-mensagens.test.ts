/**
 * O CORPO DA CHAMADA À API DE MENSAGENS — destinatário por BSUID e conta de mensagens.
 *
 * Duas regras da Meta que a issue #4 trouxe para o canal oficial, medidas no
 * corpo que sai (dublê de `fetch`; a prova pelo fio é o falso Graph do
 * invariante `canal-oficial-ponta-a-ponta`):
 *
 * - **BSUID**: contato que só tem BSUID é endereçado por `recipient`, não por
 *   `to`. Com telefone, `to` (a Meta dá precedência ao telefone quando os dois
 *   vêm, então mandar só ele é o mesmo desfecho com menos superfície).
 * - **Conta de mensagens**: `messaging_account_id` vai em TODA chamada à API de
 *   mensagens quando a sessão (ou o ambiente) o tem — texto, mídia, modelo e o
 *   "digitando". Sem ele, o campo não vai: a Meta resolve pela única conta que o
 *   token alcança.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { getAdapter } from "@/lib/channels";
import { campoDoDestinatario, ehBsuid } from "@/lib/channels/meta/destinatario";
import { sendTemplate } from "@/lib/channels/meta/send-template";

vi.mock("@/lib/supabase/admin", () => {
  const alvo: Record<string, unknown> = {
    maybeSingle: async () => ({ data: null, error: null }),
  };
  alvo.select = () => alvo;
  alvo.eq = () => alvo;
  alvo.is = () => alvo;
  return { createAdminClient: () => ({ from: () => alvo, rpc: async () => ({ data: null, error: null }) }) };
});

const ORG = "00000000-0000-4000-8000-000000000004";
const BSUID = "BR.13491208655302741918";

function stubFetch() {
  const spy = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ messages: [{ id: "wamid.OK" }] }),
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function corpoDa(spy: ReturnType<typeof vi.fn>, i = 0): Record<string, unknown> {
  return JSON.parse(String((spy.mock.calls[i]![1] as RequestInit).body));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("resolveRecipient — telefone primeiro, BSUID quando é o que há", () => {
  const meta = getAdapter("meta_cloud");

  it("com telefone, dígitos E.164 (mesmo tendo BSUID)", () => {
    expect(
      meta.resolveRecipient({
        isGroup: false,
        groupChatId: null,
        phoneNumber: "+55 31 99123-4567",
        waIdentity: null,
        waBsuid: BSUID,
      }),
    ).toBe("5531991234567");
  });

  it("só BSUID: o próprio BSUID é o endereço", () => {
    expect(
      meta.resolveRecipient({ isGroup: false, groupChatId: null, phoneNumber: null, waIdentity: null, waBsuid: BSUID }),
    ).toBe(BSUID);
  });

  it("nem telefone nem BSUID: null (o handler grava missing_phone_number)", () => {
    expect(
      meta.resolveRecipient({ isGroup: false, groupChatId: null, phoneNumber: null, waIdentity: null, waBsuid: null }),
    ).toBeNull();
  });

  it("BSUID fora do formato não vira endereço", () => {
    expect(
      meta.resolveRecipient({ isGroup: false, groupChatId: null, phoneNumber: null, waIdentity: null, waBsuid: "lixo" }),
    ).toBeNull();
  });
});

describe("campoDoDestinatario", () => {
  it("telefone vai em `to`, BSUID e BSUID pai em `recipient`", () => {
    expect(campoDoDestinatario("5531991234567")).toEqual({ to: "5531991234567" });
    expect(campoDoDestinatario(BSUID)).toEqual({ recipient: BSUID });
    expect(campoDoDestinatario("US.ENT.11815799212886844830")).toEqual({
      recipient: "US.ENT.11815799212886844830",
    });
    expect(ehBsuid("5531991234567")).toBe(false);
  });
});

describe("send — o corpo que sai", () => {
  function credencialDoAmbiente(contaDeMensagens?: string) {
    vi.stubEnv("META_PHONE_NUMBER_ID", "PN1");
    vi.stubEnv("META_SYSTEM_USER_TOKEN", "tok");
    if (contaDeMensagens !== undefined) vi.stubEnv("META_MESSAGING_ACCOUNT_ID", contaDeMensagens);
  }

  it("contato só com BSUID sai com `recipient` e sem `to`", async () => {
    credencialDoAmbiente();
    const spy = stubFetch();
    await getAdapter("meta_cloud").send({ organizationId: ORG, sessionRef: "PN1", to: BSUID, kind: "text", body: "oi" });
    const corpo = corpoDa(spy);
    expect(corpo.recipient).toBe(BSUID);
    expect(corpo).not.toHaveProperty("to");
  });

  it("com conta de mensagens, `messaging_account_id` vai no corpo do texto", async () => {
    credencialDoAmbiente("MA-777");
    const spy = stubFetch();
    await getAdapter("meta_cloud").send({ organizationId: ORG, sessionRef: "PN1", to: "5531991234567", kind: "text", body: "oi" });
    expect(corpoDa(spy)).toMatchObject({ to: "5531991234567", messaging_account_id: "MA-777" });
  });

  it("sem conta de mensagens, o campo NÃO vai", async () => {
    credencialDoAmbiente("");
    const spy = stubFetch();
    await getAdapter("meta_cloud").send({ organizationId: ORG, sessionRef: "PN1", to: "5531991234567", kind: "text", body: "oi" });
    expect(corpoDa(spy)).not.toHaveProperty("messaging_account_id");
  });

  it("o \"digitando\" também leva a conta de mensagens", async () => {
    credencialDoAmbiente("MA-777");
    const spy = stubFetch();
    await getAdapter("meta_cloud").signalTyping!({
      organizationId: ORG,
      sessionRef: "PN1",
      recipient: "5531991234567",
      inboundExternalId: "wamid.IN",
    });
    expect(corpoDa(spy)).toMatchObject({ status: "read", messaging_account_id: "MA-777" });
  });
});

describe("sendTemplate — modelo para BSUID, com a conta de mensagens", () => {
  it("monta `recipient` e `messaging_account_id`", async () => {
    const spy = stubFetch();
    const r = await sendTemplate({
      phoneNumberId: "PN1",
      token: "tok",
      graphVersion: "v26.0",
      messagingAccountId: "MA-777",
      to: BSUID,
      binding: { name: "boas_vindas", language: "pt_BR", contractHash: "h", values: {} },
      current: {
        name: "boas_vindas",
        language: "pt_BR",
        contractHash: "h",
        status: "APPROVED",
        components: [{ type: "BODY", text: "Olá" }],
      },
    });
    expect(r).toMatchObject({ sent: true });
    const corpo = corpoDa(spy);
    expect(corpo).toMatchObject({ recipient: BSUID, messaging_account_id: "MA-777", type: "template" });
    expect(corpo).not.toHaveProperty("to");
    expect(String(spy.mock.calls[0]![0])).toContain("/v26.0/PN1/messages");
  });
});

describe("o formato do BSUID é o MESMO no código e no banco", () => {
  it("a regex de `ehBsuid` é a do CHECK e da RPC da migration 0535", async () => {
    // Quatro cópias de uma regra (CHECK, limpeza, guarda da RPC e o TypeScript):
    // se uma divergir, o banco recusa o que o código aceita, ou o contrário.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const raiz = path.join(__dirname, "..", "..");
    const migration = fs
      .readdirSync(path.join(raiz, "supabase", "migrations"))
      .find((f) => f.includes("_0535_"))!;
    const sql = fs.readFileSync(path.join(raiz, "supabase", "migrations", migration), "utf8");
    const noSql = [...sql.matchAll(/'(\^\[A-Z\]\{2\}[^']*)'/g)].map((m) => m[1]);
    expect(noSql.length).toBeGreaterThanOrEqual(3);
    const fonte = fs.readFileSync(path.join(raiz, "lib", "channels", "meta", "destinatario.ts"), "utf8");
    const noTs = /const FORMATO_DO_BSUID = \/(.+)\/;/.exec(fonte)![1];
    for (const r of noSql) expect(r).toBe(noTs);
  });
});

import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O WEBHOOK CONFERE A ENTREGA COM O APP DO NÚMERO (issue #5).
 *
 * O assistente de conexão recebe o App Secret e o verify token do app que o
 * administrador criou na Meta, e os guarda cifrados NA SESSÃO. A Meta assina a
 * entrega com o segredo do app que está inscrito na WABA — o DELE —, então a rota
 * precisa conferir com o par do número quando ele existe, e com o da instalação
 * quando não existe. O que se mede é o desfecho que a Meta enxerga: status.
 */

const SEGREDO_DO_NUMERO = "segredo-do-app-do-numero";
const TOKEN_DO_NUMERO = "verifica-do-numero";
const SEGREDO_DA_INSTALACAO = "segredo-da-instalacao";
const TOKEN_DA_INSTALACAO = "verifica-da-instalacao";

let sessao: Record<string, unknown> = {};

vi.mock("@/lib/channels/meta/session", () => ({
  metaSessionByWebhookToken: async () => sessao,
}));
vi.mock("@/lib/channels/meta/ingest", () => ({
  ingestMetaInbound: async () => ({ status: "ingested" }),
}));
vi.mock("@/lib/channels/meta/app", () => ({
  appDaMeta: async () => ({ appSecret: SEGREDO_DA_INSTALACAO, verifyToken: TOKEN_DA_INSTALACAO }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/webhooks/secrets", () => ({
  decryptWebhookSecret: async (_admin: unknown, cifrado: string) =>
    ({ "\\xSEGREDO": SEGREDO_DO_NUMERO, "\\xTOKEN": TOKEN_DO_NUMERO })[cifrado] ?? null,
}));

import { GET, POST } from "@/app/api/v1/webhooks/meta/[token]/route";

const ctx = { params: Promise.resolve({ token: "token-de-teste" }) } as never;
const WABA = "2434045433735175";

function handshake(verifyToken: string) {
  const params = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": verifyToken,
    "hub.challenge": "desafio",
  });
  return { nextUrl: { searchParams: params } } as never;
}

function entrega(segredo: string) {
  const cru = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: WABA, changes: [{ field: "messages", value: { messages: [] } }] }],
  });
  return {
    text: async () => cru,
    headers: new Headers({
      "x-hub-signature-256": `sha256=${createHmac("sha256", segredo).update(cru, "utf8").digest("hex")}`,
    }),
  } as never;
}

beforeEach(() => {
  sessao = { id: "sess-1", organizationId: "org-1", wabaId: WABA };
});

describe("número com o app próprio (par cifrado na sessão)", () => {
  beforeEach(() => {
    sessao = { ...sessao, par: { appSecretCifrado: "\\xSEGREDO", verifyTokenCifrado: "\\xTOKEN" } };
  });

  it("aceita a entrega assinada com o segredo DO NÚMERO", async () => {
    expect((await POST(entrega(SEGREDO_DO_NUMERO), ctx)).status).toBe(200);
  });

  it("recusa a assinada com o segredo da instalação — é outro app", async () => {
    expect((await POST(entrega(SEGREDO_DA_INSTALACAO), ctx)).status).toBe(401);
  });

  it("o handshake responde ao verify token do número, e não ao da instalação", async () => {
    expect((await GET(handshake(TOKEN_DO_NUMERO), ctx)).status).toBe(200);
    expect((await GET(handshake(TOKEN_DA_INSTALACAO), ctx)).status).toBe(403);
  });
});

describe("número sem app próprio", () => {
  it("vale o app da instalação, como sempre valeu", async () => {
    expect((await POST(entrega(SEGREDO_DA_INSTALACAO), ctx)).status).toBe(200);
    expect((await POST(entrega(SEGREDO_DO_NUMERO), ctx)).status).toBe(401);
    expect((await GET(handshake(TOKEN_DA_INSTALACAO), ctx)).status).toBe(200);
  });

  it("par do número que não decifra cai INTEIRO para a instalação", async () => {
    sessao = { ...sessao, par: { appSecretCifrado: "\\xSEGREDO", verifyTokenCifrado: "\\xQUEBRADO" } };
    expect((await POST(entrega(SEGREDO_DA_INSTALACAO), ctx)).status).toBe(200);
  });
});

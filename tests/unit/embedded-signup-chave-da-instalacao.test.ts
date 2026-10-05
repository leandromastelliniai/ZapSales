/**
 * EMBEDDED SIGNUP v4 ATRÁS DA CHAVE DA INSTALAÇÃO (issue #5).
 *
 * Critério de aceite: "com a chave desligada, o Embedded Signup não aparece;
 * ligada, o fluxo v4 conecta usando o falso Graph". Aqui se mede a chave e a
 * troca do código no servidor, contra o falso Graph de verdade; o caso de uso da
 * conexão é dublê (ele tem cobertura própria, com banco, em
 * `tests/invariants/conexao-guiada-ponta-a-ponta.test.ts`).
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { subirFalsoGraph, type FalsoGraph } from "../support/falso-graph";

const APP = "555000111";
const SEGREDO = "segredo-da-instalacao-32-chars-x";

let linha: Record<string, unknown> | null = null;
let segredoDaInstalacao: string | null = SEGREDO;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: linha, error: null }) }) }),
    }),
  }),
}));
vi.mock("@/lib/channels/meta/app", () => ({
  appDaMeta: async () => ({ appSecret: segredoDaInstalacao, verifyToken: segredoDaInstalacao ? "v" : null }),
}));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({ ok: true, user: { id: "user-1", idioma: "pt-BR" }, org: { orgId: "org-1" } }),
}));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
const conectar = vi.fn();
vi.mock("@/lib/channels/meta/conectar-numero", () => ({ conectarNumeroOficial: (i: unknown) => conectar(i) }));

import { embeddedSignupParaATela } from "@/lib/channels/meta/embedded-signup";
import { POST } from "@/app/api/v1/channels/official/embedded-signup/route";

let falso: FalsoGraph;

beforeAll(async () => {
  falso = await subirFalsoGraph({
    phoneNumberId: "1103328999528818",
    wabaId: "2434045433735175",
    appId: APP,
    appSecret: SEGREDO,
    tokenDoEmbeddedSignup: "EAAG-token-de-negocio",
  });
  vi.stubEnv("META_GRAPH_BASE_URL", falso.base);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await falso.fechar();
});
beforeEach(() => {
  falso.limpar();
  conectar.mockReset();
  conectar.mockResolvedValue({
    ok: true,
    channelSessionId: "sess-1",
    displayName: "Loja",
    phoneNumber: "+5531900000000",
    webhookRegistro: null,
    numeroRegistrado: true,
    webhookDoApp: null,
  });
  segredoDaInstalacao = SEGREDO;
});

const LIGADA = { app_id: APP, embedded_signup_config_id: "cfg-123", embedded_signup_ligado: true };

function pedir(corpo: unknown) {
  return POST(
    new NextRequest("http://localhost/api/v1/channels/official/embedded-signup", {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
  );
}

const CORPO = {
  code: "codigo-de-uso-unico-123",
  waba_id: "2434045433735175",
  phone_number_id: "1103328999528818",
  pin: "123456",
  uso: "ambos",
};

describe("com a chave DESLIGADA", () => {
  it("a tela não recebe o botão", async () => {
    linha = { ...LIGADA, embedded_signup_ligado: false };
    expect(await embeddedSignupParaATela()).toBeNull();
    linha = null;
    expect(await embeddedSignupParaATela()).toBeNull();
  });

  it("a rota é 404 e nada chega à Meta", async () => {
    linha = { ...LIGADA, embedded_signup_ligado: false };
    const res = await pedir(CORPO);
    expect(res.status).toBe(404);
    expect(falso.chamadas).toEqual([]);
    expect(conectar).not.toHaveBeenCalled();
  });

  it("ligada sem App Secret da instalação conta como desligada — o botão morreria na troca", async () => {
    linha = LIGADA;
    segredoDaInstalacao = null;
    expect(await embeddedSignupParaATela()).toBeNull();
    expect((await pedir(CORPO)).status).toBe(404);
  });
});

describe("com a chave LIGADA", () => {
  beforeEach(() => {
    linha = LIGADA;
  });

  it("a tela recebe só os ids públicos", async () => {
    expect(await embeddedSignupParaATela()).toEqual({ appId: APP, configId: "cfg-123" });
  });

  it("o código é trocado NO SERVIDOR e a conexão usa o token de negócio", async () => {
    const res = await pedir(CORPO);
    expect(res.status).toBe(200);
    const [troca] = falso.chamadas.filter((c) => c.caminho === "/oauth/access_token");
    expect(troca).toBeDefined();
    expect(new URLSearchParams(troca!.busca).get("code")).toBe(CORPO.code);
    expect(conectar).toHaveBeenCalledWith(
      expect.objectContaining({
        origem: "embedded_signup",
        organizationId: "org-1",
        entrada: expect.objectContaining({
          token: "EAAG-token-de-negocio",
          phoneNumberId: CORPO.phone_number_id,
          wabaId: CORPO.waba_id,
          pin: "123456",
          uso: "ambos",
        }),
      }),
    );
    // O App Secret nunca aparece na resposta.
    expect(JSON.stringify(await res.json())).not.toContain(SEGREDO);
  });

  it("código recusado pela Meta não conecta", async () => {
    falso.programar(
      { metodo: "GET", terminaCom: "/oauth/access_token" },
      { status: 400, corpo: { error: { message: "This authorization code has expired.", code: 100 } } },
    );
    const res = await pedir(CORPO);
    expect(res.status).toBe(422);
    expect(conectar).not.toHaveBeenCalled();
  });

  it("corpo sem PIN ou com id que não é número é recusado antes da Meta", async () => {
    expect((await pedir({ ...CORPO, pin: "12" })).status).toBe(422);
    expect((await pedir({ ...CORPO, waba_id: "../x" })).status).toBe(422);
    expect(falso.chamadas).toEqual([]);
  });
});

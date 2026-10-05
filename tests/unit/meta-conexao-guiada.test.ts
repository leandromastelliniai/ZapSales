/**
 * O ASSISTENTE DE CONEXÃO, NA FRONTEIRA COM A META (issue #5).
 *
 * O que se mede é o que chega à "Meta" (o falso Graph grava cada chamada) e o que
 * o assistente conclui da resposta — nunca a forma interna. O falso Graph é um
 * servidor HTTP de verdade, apontado pelo knob `META_GRAPH_BASE_URL`; nenhum
 * dublê de `fetch`.
 *
 * Os critérios de aceite que moram aqui:
 *  - token sem permissão, expirado ou de app em modo de desenvolvimento gera
 *    mensagem ESPECÍFICA do problema;
 *  - o assistente lista os números da conta (o usuário não digita ids);
 *  - o checklist (app em Live, forma de pagamento, empresa verificada);
 *  - registro do número com PIN, assinatura dos campos no app e troca do código
 *    do Embedded Signup acontecem no servidor.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assinarCamposDoApp,
  conferirSegredoDoApp,
  diagnosticarCredencial,
  registrarNumero,
} from "@/lib/channels/meta/conexao-guiada";
import { trocarCodigoDoEmbeddedSignup } from "@/lib/channels/meta/embedded-signup";

import { erroDaGraph, subirFalsoGraph, type FalsoGraph } from "../support/falso-graph";

const NUMERO = "1103328999528818";
const WABA = "2434045433735175";
const APP = "555000111";
const SEGREDO = "segredo-do-app-de-teste-32-chars";
const TOKEN = "EAAG-token-de-teste-com-tamanho-suficiente";

let falso: FalsoGraph;

beforeAll(async () => {
  falso = await subirFalsoGraph({
    phoneNumberId: NUMERO,
    wabaId: WABA,
    appId: APP,
    appSecret: SEGREDO,
    numeroExibido: "+55 31 90000-0000",
    nomeVerificado: "Loja de Teste",
  });
  vi.stubEnv("META_GRAPH_BASE_URL", falso.base);
  vi.stubEnv("META_GRAPH_VERSION", "");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await falso.fechar();
});

beforeEach(() => falso.limpar());

describe("diagnosticarCredencial — o caminho feliz", () => {
  it("lista os números da conta, sem o usuário digitar id, e o checklist fica verde", async () => {
    const d = await diagnosticarCredencial({ token: TOKEN, appSecret: SEGREDO });
    expect(d.problemas).toEqual([]);
    expect(d.ok).toBe(true);
    expect(d.appId).toBe(APP);
    expect(d.contas).toHaveLength(1);
    const [conta] = d.contas;
    expect(conta).toMatchObject({ wabaId: WABA, nome: "Conta de Teste" });
    expect(conta!.numeros).toEqual([
      expect.objectContaining({
        id: NUMERO,
        numeroExibido: "+55 31 90000-0000",
        nomeVerificado: "Loja de Teste",
        qualidade: "GREEN",
        limite: "TIER_2K",
      }),
    ]);
    expect(Object.fromEntries(conta!.checklist.map((i) => [i.item, i.estado]))).toEqual({
      app_live: "ok",
      forma_de_pagamento: "ok",
      empresa_verificada: "ok",
    });
  });

  it("o token vai no cabeçalho; o App Secret NUNCA sai — só a prova HMAC", async () => {
    await diagnosticarCredencial({ token: TOKEN, appSecret: SEGREDO });
    expect(falso.chamadas.length).toBeGreaterThan(0);
    for (const c of falso.chamadas) {
      expect(c.authorization).toBe(`Bearer ${TOKEN}`);
      expect(c.busca).not.toContain(SEGREDO);
      expect(JSON.stringify(c.corpo ?? {})).not.toContain(SEGREDO);
      expect(c.versao).toBe("v26.0");
    }
    expect(falso.chamadas.some((c) => c.busca.includes("appsecret_proof="))).toBe(true);
  });
});

describe("diagnosticarCredencial — cada problema com a sua mensagem", () => {
  it("token expirado", async () => {
    falso.programar(
      { metodo: "GET", terminaCom: "/debug_token" },
      erroDaGraph(190, { status: 401, subcode: 463, message: "Error validating access token: Session has expired" }),
    );
    const d = await diagnosticarCredencial({ token: TOKEN, appSecret: SEGREDO });
    expect(d.ok).toBe(false);
    expect(d.problemas.map((p) => p.codigo)).toEqual(["token_expirado"]);
    expect(d.problemas[0]!.mensagem).toMatch(/expirou/i);
    expect(d.contas).toEqual([]);
  });

  it("token inválido", async () => {
    falso.programar(
      { metodo: "GET", terminaCom: "/debug_token" },
      erroDaGraph(190, { status: 401, message: "Invalid OAuth access token - Cannot parse access token" }),
    );
    const d = await diagnosticarCredencial({ token: TOKEN, appSecret: SEGREDO });
    expect(d.problemas.map((p) => p.codigo)).toEqual(["token_invalido"]);
    expect(d.problemas[0]!.mensagem).toMatch(/não é válido/i);
  });

  it("token marcado inválido pela própria Meta (is_valid: false, expirado)", async () => {
    falso.programar(
      { metodo: "GET", terminaCom: "/debug_token" },
      {
        status: 200,
        corpo: { data: { app_id: APP, is_valid: false, expires_at: 1_600_000_000, scopes: [], error: { code: 190, subcode: 463 } } },
      },
    );
    const d = await diagnosticarCredencial({ token: TOKEN });
    expect(d.problemas.map((p) => p.codigo)).toEqual(["token_expirado"]);
  });

  it("token sem permissão nomeia a permissão que falta", async () => {
    falso.programar(
      { metodo: "GET", terminaCom: "/debug_token" },
      {
        status: 200,
        corpo: {
          data: {
            app_id: APP,
            is_valid: true,
            expires_at: 0,
            scopes: ["whatsapp_business_management"],
            granular_scopes: [{ scope: "whatsapp_business_management", target_ids: [WABA] }],
          },
        },
      },
    );
    const d = await diagnosticarCredencial({ token: TOKEN, appSecret: SEGREDO });
    expect(d.ok).toBe(false);
    expect(d.problemas.map((p) => p.codigo)).toEqual(["sem_permissao"]);
    expect(d.problemas[0]!.detalhe).toBe("whatsapp_business_messaging");
    expect(d.problemas[0]!.mensagem).toMatch(/permiss/i);
  });

  it("app em modo de desenvolvimento", async () => {
    falso.programar(
      { metodo: "GET", terminaCom: `/${WABA}` },
      {
        status: 200,
        corpo: {
          id: WABA,
          name: "Conta de Teste",
          business_verification_status: "verified",
          primary_funding_id: "998877",
          health_status: {
            can_send_message: "LIMITED",
            entities: [
              {
                entity_type: "APP",
                id: APP,
                can_send_message: "LIMITED",
                errors: [{ error_code: 141010, error_description: "App is in development mode", possible_solution: "Publish the app" }],
              },
            ],
          },
        },
      },
    );
    const d = await diagnosticarCredencial({ token: TOKEN, appSecret: SEGREDO });
    expect(d.ok).toBe(false);
    expect(d.problemas.map((p) => p.codigo)).toEqual(["app_em_desenvolvimento"]);
    expect(d.problemas[0]!.mensagem).toMatch(/Live/);
    expect(d.contas[0]!.checklist.find((i) => i.item === "app_live")!.estado).toBe("pendente");
  });

  it("App Secret que não é do app do token", async () => {
    const d = await diagnosticarCredencial({ token: TOKEN, appSecret: "segredo-de-outro-app-qualquer-xx" });
    expect(d.ok).toBe(false);
    expect(d.problemas.map((p) => p.codigo)).toEqual(["segredo_nao_confere"]);
  });

  it("token que não alcança conta nenhuma", async () => {
    falso.programar(
      { metodo: "GET", terminaCom: "/debug_token" },
      {
        status: 200,
        corpo: {
          data: {
            app_id: APP,
            is_valid: true,
            expires_at: 0,
            scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
            granular_scopes: [],
          },
        },
      },
    );
    const d = await diagnosticarCredencial({ token: TOKEN });
    expect(d.problemas.map((p) => p.codigo)).toEqual(["sem_conta"]);
  });

  it("token temporário é aviso, não bloqueio", async () => {
    const amanha = Math.floor(Date.now() / 1000) + 86_400;
    falso.programar(
      { metodo: "GET", terminaCom: "/debug_token" },
      {
        status: 200,
        corpo: {
          data: {
            app_id: APP,
            is_valid: true,
            expires_at: amanha,
            scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
            granular_scopes: [{ scope: "whatsapp_business_management", target_ids: [WABA] }],
          },
        },
      },
    );
    const d = await diagnosticarCredencial({ token: TOKEN });
    expect(d.ok).toBe(true);
    expect(d.avisos.map((a) => a.codigo)).toEqual(["token_temporario"]);
  });

  it("checklist: sem forma de pagamento e empresa não verificada ficam pendentes", async () => {
    falso.programar(
      { metodo: "GET", terminaCom: `/${WABA}` },
      {
        status: 200,
        corpo: {
          id: WABA,
          name: "Conta de Teste",
          business_verification_status: "not_verified",
          health_status: { can_send_message: "AVAILABLE", entities: [{ entity_type: "APP", id: APP, can_send_message: "AVAILABLE" }] },
        },
      },
    );
    const d = await diagnosticarCredencial({ token: TOKEN });
    const estados = Object.fromEntries(d.contas[0]!.checklist.map((i) => [i.item, i.estado]));
    expect(estados).toEqual({ app_live: "ok", forma_de_pagamento: "pendente", empresa_verificada: "pendente" });
    // Checklist pendente orienta, não bloqueia: dá para conectar e resolver depois.
    expect(d.ok).toBe(true);
  });

  it("rede indisponível não vira 'token inválido'", async () => {
    vi.stubEnv("META_GRAPH_BASE_URL", "http://127.0.0.1:1");
    try {
      const d = await diagnosticarCredencial({ token: TOKEN });
      expect(d.problemas.map((p) => p.codigo)).toEqual(["rede"]);
    } finally {
      vi.stubEnv("META_GRAPH_BASE_URL", falso.base);
    }
  });
});

describe("conferirSegredoDoApp — a conexão confere de novo, sem token na URL", () => {
  it("segredo certo devolve o app do token", async () => {
    expect(await conferirSegredoDoApp({ token: TOKEN, appSecret: SEGREDO })).toEqual({ ok: true, appId: APP });
    for (const c of falso.chamadas) {
      expect(c.busca).not.toContain(TOKEN);
      expect(c.busca).not.toContain(SEGREDO);
      expect(c.authorization).toBe(`Bearer ${TOKEN}`);
    }
  });

  it("segredo de outro app é recusado com a frase própria", async () => {
    const r = await conferirSegredoDoApp({ token: TOKEN, appSecret: "segredo-de-outro-app-qualquer-xx" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problema.codigo).toBe("segredo_nao_confere");
  });
});

describe("registrarNumero — o PIN de duas etapas", () => {
  it("registra o número na Cloud API", async () => {
    const r = await registrarNumero({ phoneNumberId: NUMERO, token: TOKEN, pin: "123456" });
    expect(r).toEqual({ ok: true });
    const [chamada] = falso.chamadas.filter((c) => c.caminho === `/${NUMERO}/register`);
    expect(chamada).toMatchObject({ metodo: "POST", corpo: { messaging_product: "whatsapp", pin: "123456" } });
  });

  it("PIN errado tem mensagem própria", async () => {
    falso.programar({ metodo: "POST", terminaCom: "/register" }, erroDaGraph(133005, { message: "Two step verification PIN Mismatch" }));
    const r = await registrarNumero({ phoneNumberId: NUMERO, token: TOKEN, pin: "000000" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toMatch(/PIN/);
  });
});

describe("assinarCamposDoApp — qualidade e limite só chegam pela URL do APP", () => {
  it("aponta o app para o webhook do número, com o token do app no CORPO", async () => {
    const r = await assinarCamposDoApp({
      appId: APP,
      appSecret: SEGREDO,
      callbackUrl: "https://painel.teste.local/api/v1/webhooks/meta/abc123",
      verifyToken: "verifica",
    });
    expect(r).toEqual({ ok: true });
    const [c] = falso.chamadas.filter((x) => x.caminho === `/${APP}/subscriptions`);
    expect(c!.metodo).toBe("POST");
    expect(c!.busca).not.toContain(SEGREDO);
    const corpo = new URLSearchParams(String(c!.corpo?._bruto ?? ""));
    expect(corpo.get("object")).toBe("whatsapp_business_account");
    expect(corpo.get("callback_url")).toBe("https://painel.teste.local/api/v1/webhooks/meta/abc123");
    expect(corpo.get("verify_token")).toBe("verifica");
    expect(corpo.get("access_token")).toBe(`${APP}|${SEGREDO}`);
    expect(corpo.get("fields")!.split(",")).toEqual(
      expect.arrayContaining(["messages", "message_template_status_update", "phone_number_quality_update", "business_capability_update"]),
    );
  });
});

describe("trocarCodigoDoEmbeddedSignup — no servidor", () => {
  it("troca o código pelo token de negócio", async () => {
    const r = await trocarCodigoDoEmbeddedSignup({ code: "codigo-de-uso-unico", appId: APP, appSecret: SEGREDO });
    expect(r).toEqual({ ok: true, token: "EAAG-token-do-embedded-signup" });
    const [c] = falso.chamadas.filter((x) => x.caminho === "/oauth/access_token");
    expect(new URLSearchParams(c!.busca).get("code")).toBe("codigo-de-uso-unico");
  });

  it("recusa da Meta vira motivo, não exceção", async () => {
    const r = await trocarCodigoDoEmbeddedSignup({ code: "x", appId: "outro-app", appSecret: SEGREDO });
    expect(r.ok).toBe(false);
  });
});

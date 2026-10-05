/**
 * A CONEXÃO GUIADA E A SAÚDE DO NÚMERO, PONTA A PONTA (issue #5).
 *
 * Mesma seam da issue #4 (`canal-oficial-ponta-a-ponta.test.ts`): o falso Graph
 * na saída, o webhook assinado na ROTA REAL na entrada, o sistema dirigido pelas
 * rotas do app sobre o banco de verdade (baseline aplicado). Dublê só da
 * IDENTIDADE de quem chama — este Postgres não tem GoTrue.
 *
 * Os critérios de aceite, na ordem em que aparecem:
 *  1. o assistente conecta um número do início ao fim SEM o usuário digitar ids
 *     (os ids da conexão saem da resposta do diagnóstico);
 *  2. token expirado, sem permissão ou de app em desenvolvimento gera mensagem
 *     específica;
 *  3. assinatura do app e registro do número são feitos pelo assistente;
 *  4. token e App Secret ficam cifrados e nunca voltam para a tela;
 *  5. o uso declarado fica salvo e visível;
 *  6. webhook de qualidade e de limite atualiza o painel e alerta na queda;
 *  7. com a chave desligada o Embedded Signup não aparece; ligada, conecta pelo
 *     falso Graph.
 */
import pg from "pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { pgComoSupabase } from "../pg-como-supabase";
import { erroDaGraph, subirFalsoGraph, type FalsoGraph } from "../support/falso-graph";
import { postarWebhookMeta } from "../support/webhook-meta-assinado";

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);

/** `bytea` volta como TEXTO (`\x…`), como o PostgREST serializa — ver o arquivo da #4. */
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 1,
  types: {
    getTypeParser: ((oid: number, formato?: unknown) =>
      oid === 17 ? (v: string) => v : pg.types.getTypeParser(oid, formato as never)) as never,
  },
});

const quem = vi.hoisted(() => ({ db: null as unknown, org: "", user: "" }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => quem.db }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    ...(quem.db as object),
    auth: { getUser: async () => ({ data: { user: { id: quem.user } }, error: null }) },
  }),
}));
vi.mock("@/lib/impersonate/support", async (original) => ({
  ...(await original<object>()),
  requireSupportWrite: async () => null,
}));

function usuario() {
  return {
    id: quem.user,
    email: `${quem.user.slice(0, 8)}@teste.local`,
    full_name: "Admin de Teste",
    avatar_url: null,
    is_platform_admin: false,
    support: null,
    idioma: "pt-BR",
  };
}
function orgAtiva() {
  return { orgId: quem.org, role: "admin", org_status: "active", name: "Org de Teste" };
}
vi.mock("@/lib/auth/server", async (original) => ({
  ...(await original<object>()),
  loadAuthUser: async () => usuario(),
}));
vi.mock("@/lib/auth/require-role", async (original) => ({
  ...(await original<object>()),
  requireRole: async () => ({ ok: true, user: usuario(), org: orgAtiva() }),
  orgAtivaDaApi: async () => ({ ok: true, org: orgAtiva() }),
}));

const ORG_A = "0d0e0005-0000-4000-8000-00000000000a";
const ORG_B = "0d0e0005-0000-4000-8000-00000000000b";
const USER_A = "0d0e0005-0000-4000-8000-0000000000a1";
const USER_B = "0d0e0005-0000-4000-8000-0000000000b1";

const NUMERO = "1103328999528819";
const WABA = "2434045433735176";
const APP = "778800112233";
const TOKEN_DA_META = "EAAG-token-do-assistente-com-tamanho-suficiente";
const SEGREDO_DO_APP = "segredo-do-app-do-cliente-32char";
const SEGREDO_DA_INSTALACAO = "segredo-da-instalacao-de-teste-xx";
const TOKEN_DO_EMBEDDED_SIGNUP = "EAAG-token-de-negocio-do-embedded-signup";

let falso: FalsoGraph;
let tokenDoWebhook = "";
let sessaoId = "";

function como(org: string, user: string) {
  quem.org = org;
  quem.user = user;
}

async function json<T = unknown>(res: Response): Promise<{ data: T } & Record<string, unknown>> {
  return (await res.json()) as { data: T } & Record<string, unknown>;
}

function pedido(url: string, metodo: string, corpo?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: metodo,
    ...(corpo !== undefined
      ? { body: JSON.stringify(corpo), headers: { "content-type": "application/json" } }
      : {}),
  });
}

interface Diagnostico {
  ok: boolean;
  problemas: Array<{ codigo: string; mensagem: string; detalhe?: string }>;
  contas: Array<{
    wabaId: string;
    checklist: Array<{ item: string; estado: string }>;
    numeros: Array<{ id: string; numeroExibido: string | null }>;
  }>;
}

async function diagnosticar(corpo: Record<string, unknown>) {
  const { POST } = await import("@/app/api/v1/channels/official/assistente/route");
  return POST(pedido("/api/v1/channels/official/assistente", "POST", corpo));
}

async function conectar(corpo: Record<string, unknown>) {
  const { POST } = await import("@/app/api/v1/channels/official/route");
  return POST(pedido("/api/v1/channels/official", "POST", corpo));
}

interface Estado {
  connected: boolean;
  channel_session_id: string;
  phoneNumberId: string;
  uso: string | null;
  appProprio: boolean;
  hasToken: boolean;
  numeroRegistradoEm: string | null;
  saude: { qualidade: string | null; limite: string | null; evento: string | null; em: string | null };
  embeddedSignup: { appId: string; configId: string } | null;
  webhook: { callbackUrl: string };
}

async function estadoBruto(): Promise<string> {
  const { GET } = await import("@/app/api/v1/channels/official/route");
  return (await GET(pedido("/api/v1/channels/official", "GET"))).text();
}

async function estado(): Promise<Estado> {
  return (JSON.parse(await estadoBruto()) as { data: Estado }).data;
}

function webhookDeSaude(field: string, value: Record<string, unknown>) {
  return { object: "whatsapp_business_account", entry: [{ id: WABA, changes: [{ field, value }] }] };
}

async function avisosAbertos(org: string) {
  const { rows } = await pool.query(
    `select kind, severity, title, ref_kind, ref_id from agent_inbox_items
      where organization_id = $1 and status = 'open' and kind = 'channel_number_alert' order by created_at`,
    [org],
  );
  return rows as Array<{ kind: string; severity: string; title: string; ref_kind: string; ref_id: string }>;
}

beforeAll(async () => {
  quem.db = pgComoSupabase(pool);
  for (const [org, user, slug] of [
    [ORG_A, USER_A, "guiada-a"],
    [ORG_B, USER_B, "guiada-b"],
  ] as const) {
    await pool.query(
      `insert into organizations (id, slug, legal_name, display_name) values ($1, $2, $3, $4)
       on conflict (id) do nothing`,
      [org, slug, `${slug} LTDA`, slug],
    );
    await pool.query(`insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing`, [
      user,
      `${slug}@teste.local`,
    ]);
    await pool.query(
      `insert into user_organizations (organization_id, user_id, role, accepted_at)
       values ($1, $2, 'admin', now()) on conflict do nothing`,
      [org, user],
    );
  }
  await pool.query(
    `insert into private.app_secrets (name, value)
     values ('integrations_oauth_key', 'chave-de-teste-da-conexao-guiada-nao-e-segredo')
     on conflict (name) do nothing`,
  );

  falso = await subirFalsoGraph({
    phoneNumberId: NUMERO,
    wabaId: WABA,
    appId: APP,
    appSecret: SEGREDO_DO_APP,
    numeroExibido: "+55 31 90000-1111",
    tokenDoEmbeddedSignup: TOKEN_DO_EMBEDDED_SIGNUP,
    segredoDaTroca: SEGREDO_DA_INSTALACAO,
  });
  vi.stubEnv("META_GRAPH_BASE_URL", falso.base);
  vi.stubEnv("META_GRAPH_VERSION", "");
  // O app da INSTALAÇÃO (o do Embedded Signup) — diferente do app do cliente.
  vi.stubEnv("META_APP_SECRET", SEGREDO_DA_INSTALACAO);
  vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verifica-da-instalacao");
  vi.stubEnv("META_PHONE_NUMBER_ID", "");
  vi.stubEnv("META_SYSTEM_USER_TOKEN", "");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://painel.teste.local");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await falso?.fechar();
  await pool.end();
});

describe("2 · cada problema da credencial com a sua mensagem", () => {
  it("token expirado", async () => {
    como(ORG_A, USER_A);
    falso.programar({ metodo: "GET", terminaCom: "/debug_token" }, erroDaGraph(190, { status: 401, subcode: 463 }));
    const d = (await json<Diagnostico>(await diagnosticar({ token: TOKEN_DA_META, app_secret: SEGREDO_DO_APP }))).data;
    expect(d.ok).toBe(false);
    expect(d.problemas.map((p) => p.codigo)).toEqual(["token_expirado"]);
    expect(d.problemas[0]!.mensagem).toMatch(/expirou/);
  });

  it("token sem permissão", async () => {
    falso.programar(
      { metodo: "GET", terminaCom: "/debug_token" },
      {
        status: 200,
        corpo: { data: { app_id: APP, is_valid: true, expires_at: 0, scopes: ["whatsapp_business_management"], granular_scopes: [] } },
      },
    );
    const d = (await json<Diagnostico>(await diagnosticar({ token: TOKEN_DA_META }))).data;
    expect(d.problemas.map((p) => p.codigo)).toEqual(["sem_permissao"]);
    expect(d.problemas[0]!.detalhe).toBe("whatsapp_business_messaging");
  });

  it("app em modo de desenvolvimento", async () => {
    falso.programar(
      { metodo: "GET", terminaCom: `/${WABA}` },
      {
        status: 200,
        corpo: {
          id: WABA,
          name: "Conta",
          primary_funding_id: "1",
          business_verification_status: "verified",
          health_status: { entities: [{ entity_type: "APP", id: APP, can_send_message: "BLOCKED" }] },
        },
      },
    );
    const d = (await json<Diagnostico>(await diagnosticar({ token: TOKEN_DA_META }))).data;
    expect(d.problemas.map((p) => p.codigo)).toEqual(["app_em_desenvolvimento"]);
    expect(d.problemas[0]!.mensagem).toMatch(/desenvolvimento/);
  });

  it("nada disso grava coisa alguma", async () => {
    const { rows } = await pool.query(`select count(*)::int as n from channel_sessions where organization_id = $1`, [ORG_A]);
    expect(rows[0].n).toBe(0);
  });
});

describe("1 e 3 · o assistente conecta do início ao fim, sem o usuário digitar id", () => {
  let diagnostico: Diagnostico;

  it("o diagnóstico lista a conta, o número e o checklist", async () => {
    como(ORG_A, USER_A);
    falso.limpar();
    const res = await diagnosticar({ token: TOKEN_DA_META, app_secret: SEGREDO_DO_APP });
    expect(res.status).toBe(200);
    diagnostico = (await json<Diagnostico>(res)).data;
    expect(diagnostico.ok).toBe(true);
    expect(diagnostico.contas[0]!.numeros[0]).toMatchObject({ id: NUMERO, numeroExibido: "+55 31 90000-1111" });
    expect(diagnostico.contas[0]!.checklist.every((i) => i.estado === "ok")).toBe(true);
  });

  it("conecta com os ids ESCOLHIDOS da lista, registra o número e assina o app", async () => {
    falso.limpar();
    const conta = diagnostico.contas[0]!;
    const res = await conectar({
      waba_id: conta.wabaId,
      phone_number_id: conta.numeros[0]!.id,
      token: TOKEN_DA_META,
      app_secret: SEGREDO_DO_APP,
      pin: "246810",
      uso: "campanha",
    });
    const corpo = await json<Record<string, unknown>>(res);
    expect(res.status, JSON.stringify(corpo)).toBe(200);
    expect(corpo.data).toMatchObject({
      connected: true,
      numeroRegistrado: true,
      webhookRegistro: { registrado: true },
      webhookDoApp: { assinado: true },
    });

    const vistas = falso.chamadas.map((c) => `${c.metodo} ${c.caminho}`);
    // A conexão inteira leva o token só no cabeçalho — nenhuma URL o carrega,
    // e o App Secret só viaja para a Meta dentro do token do app, no corpo.
    for (const c of falso.chamadas) {
      expect(c.busca).not.toContain(TOKEN_DA_META);
      expect(c.busca).not.toContain(SEGREDO_DO_APP);
    }
    expect(vistas).toContain(`POST /${NUMERO}/register`);
    expect(vistas).toContain(`POST /${WABA}/subscribed_apps`);
    expect(vistas).toContain(`POST /${APP}/subscriptions`);
    const registro = falso.chamadas.find((c) => c.caminho === `/${NUMERO}/register`)!;
    expect(registro.corpo).toMatchObject({ messaging_product: "whatsapp", pin: "246810" });
    // O override do número leva o verify token DO NÚMERO, e não o da instalação.
    const override = falso.chamadas.find((c) => c.metodo === "POST" && c.caminho === `/${NUMERO}`)!;
    const verify = (override.corpo?.webhook_configuration as { verify_token?: string }).verify_token;
    expect(verify).toBeTruthy();
    expect(verify).not.toBe("verifica-da-instalacao");
  });

  it("4 · token e App Secret ficam cifrados e nunca voltam para a tela", async () => {
    const bruto = await estadoBruto();
    expect(bruto).not.toContain(TOKEN_DA_META);
    expect(bruto).not.toContain(SEGREDO_DO_APP);
    const e = JSON.parse(bruto).data as Estado;
    expect(e).toMatchObject({ connected: true, hasToken: true, appProprio: true });
    expect(e.numeroRegistradoEm).toBeTruthy();
    sessaoId = e.channel_session_id;
    tokenDoWebhook = e.webhook.callbackUrl.split("/").pop()!;

    const { rows } = await pool.query(
      `select meta_token_encrypted::text as t, meta_app_secret_encrypted::text as s,
              meta_verify_token_encrypted::text as v from channel_sessions where id = $1`,
      [sessaoId],
    );
    for (const coluna of ["t", "s", "v"] as const) {
      expect(rows[0][coluna]).toBeTruthy();
      expect(rows[0][coluna]).not.toContain(TOKEN_DA_META);
      expect(rows[0][coluna]).not.toContain(SEGREDO_DO_APP);
    }
    const decifrado = await pool.query(`select public.fn_decrypt_oauth($1::bytea) as s`, [rows[0].s]);
    expect(decifrado.rows[0].s).toBe(SEGREDO_DO_APP);
  });

  it("o webhook do número confere com o segredo DO APP DO CLIENTE", async () => {
    const corpo = webhookDeSaude("messages", { messaging_product: "whatsapp", statuses: [] });
    expect((await postarWebhookMeta({ token: tokenDoWebhook, appSecret: SEGREDO_DO_APP, corpo })).status).toBe(200);
    expect((await postarWebhookMeta({ token: tokenDoWebhook, appSecret: SEGREDO_DA_INSTALACAO, corpo })).status).toBe(401);
  });
});

describe("5 · o uso declarado fica salvo e visível", () => {
  it("o que o assistente gravou aparece no estado", async () => {
    expect((await estado()).uso).toBe("campanha");
  });

  it("trocar o uso depois, sem credencial", async () => {
    const { PATCH } = await import("@/app/api/v1/channel-sessions/[id]/uso/route");
    const res = await PATCH(pedido(`/api/v1/channel-sessions/${sessaoId}/uso`, "PATCH", { uso: "ambos" }), {
      params: Promise.resolve({ id: sessaoId }),
    });
    expect(res.status).toBe(200);
    expect((await estado()).uso).toBe("ambos");
  });

  it("outra organização não troca o uso deste número", async () => {
    como(ORG_B, USER_B);
    const { PATCH } = await import("@/app/api/v1/channel-sessions/[id]/uso/route");
    const res = await PATCH(pedido(`/api/v1/channel-sessions/${sessaoId}/uso`, "PATCH", { uso: "atendimento" }), {
      params: Promise.resolve({ id: sessaoId }),
    });
    expect(res.status).toBe(404);
    como(ORG_A, USER_A);
    expect((await estado()).uso).toBe("ambos");
  });
});

describe("6 · webhook de qualidade e de limite atualiza o painel e alerta na queda", () => {
  it("a conexão já deixou a primeira leitura da saúde", async () => {
    expect((await estado()).saude).toMatchObject({ qualidade: "GREEN", limite: "TIER_2K" });
  });

  it("qualidade caindo para vermelha: painel atualizado e aviso crítico na Central", async () => {
    // O evento não traz a qualidade; o sistema pergunta à Meta.
    falso.programar(
      { metodo: "GET", terminaCom: `/${NUMERO}` },
      { status: 200, corpo: { id: NUMERO, quality_rating: "RED", whatsapp_business_manager_messaging_limit: "TIER_2K" } },
    );
    const corpo = webhookDeSaude("phone_number_quality_update", {
      display_phone_number: "5531900001111",
      event: "FLAGGED",
      max_daily_conversations_per_business: "TIER_2K",
    });
    const res = await postarWebhookMeta({ token: tokenDoWebhook, appSecret: SEGREDO_DO_APP, corpo });
    expect(res.status).toBe(200);
    expect((await res.json()).outcomes).toEqual(["saude:avisado"]);

    expect((await estado()).saude).toMatchObject({ qualidade: "RED", limite: "TIER_2K", evento: "FLAGGED" });
    const avisos = await avisosAbertos(ORG_A);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ severity: "critical", ref_kind: "channel_session", ref_id: sessaoId });
    expect(avisos[0]!.title).toMatch(/vermelha/);
  });

  it("a reentrega do mesmo evento não repete o aviso", async () => {
    falso.programar(
      { metodo: "GET", terminaCom: `/${NUMERO}` },
      { status: 200, corpo: { id: NUMERO, quality_rating: "RED", whatsapp_business_manager_messaging_limit: "TIER_2K" } },
    );
    const corpo = webhookDeSaude("phone_number_quality_update", {
      display_phone_number: "5531900001111",
      event: "FLAGGED",
      max_daily_conversations_per_business: "TIER_2K",
    });
    await postarWebhookMeta({ token: tokenDoWebhook, appSecret: SEGREDO_DO_APP, corpo });
    expect(await avisosAbertos(ORG_A)).toHaveLength(1);
  });

  it("limite do portfólio que cai atualiza o painel e avisa", async () => {
    const corpo = webhookDeSaude("business_capability_update", { max_daily_conversations_per_business: 250 });
    const res = await postarWebhookMeta({ token: tokenDoWebhook, appSecret: SEGREDO_DO_APP, corpo });
    expect((await res.json()).outcomes).toEqual(["saude:avisado"]);
    expect((await estado()).saude).toMatchObject({ limite: "TIER_250" });
    const avisos = await avisosAbertos(ORG_A);
    expect(avisos).toHaveLength(2);
    expect(avisos[1]!.title).toMatch(/limite/);
  });

  it("evento de OUTRO número da mesma conta não mexe neste", async () => {
    const corpo = webhookDeSaude("phone_number_quality_update", {
      display_phone_number: "5511988887777",
      event: "FLAGGED",
    });
    const res = await postarWebhookMeta({ token: tokenDoWebhook, appSecret: SEGREDO_DO_APP, corpo });
    expect((await res.json()).outcomes).toEqual(["saude:outro_numero"]);
  });

  it("a qualidade volta ao verde: o aviso de qualidade fecha, o de limite continua", async () => {
    falso.programar(
      { metodo: "GET", terminaCom: `/${NUMERO}` },
      { status: 200, corpo: { id: NUMERO, quality_rating: "GREEN", whatsapp_business_manager_messaging_limit: "TIER_250" } },
    );
    const corpo = webhookDeSaude("phone_number_quality_update", {
      display_phone_number: "5531900001111",
      event: "UNFLAGGED",
    });
    const res = await postarWebhookMeta({ token: tokenDoWebhook, appSecret: SEGREDO_DO_APP, corpo });
    expect((await res.json()).outcomes).toEqual(["saude:atualizado"]);
    expect((await estado()).saude).toMatchObject({ qualidade: "GREEN" });
    const abertos = await avisosAbertos(ORG_A);
    expect(abertos).toHaveLength(1);
    expect(abertos[0]!.title).toMatch(/limite/);
  });

  it("a outra organização não vê o aviso nem a saúde", async () => {
    expect(await avisosAbertos(ORG_B)).toEqual([]);
    como(ORG_B, USER_B);
    expect((await estado()).connected).toBe(false);
    como(ORG_A, USER_A);
  });
});

describe("7 · Embedded Signup atrás da chave da instalação", () => {
  async function embeddedSignup(corpo: Record<string, unknown>) {
    const { POST } = await import("@/app/api/v1/channels/official/embedded-signup/route");
    return POST(pedido("/api/v1/channels/official/embedded-signup", "POST", corpo));
  }
  const CORPO = { code: "codigo-de-uso-unico-do-teste", waba_id: WABA, phone_number_id: NUMERO, pin: "135790", uso: "atendimento" };

  it("desligada (o padrão de uma instalação nova): não aparece e a rota não existe", async () => {
    expect((await estado()).embeddedSignup).toBeNull();
    falso.limpar();
    expect((await embeddedSignup(CORPO)).status).toBe(404);
    expect(falso.chamadas).toEqual([]);
  });

  it("ligada: aparece com os ids públicos e conecta pelo falso Graph", async () => {
    await pool.query(
      `insert into platform_meta_app (id, app_id, embedded_signup_config_id, embedded_signup_ligado)
       values (1, $1, 'config-de-teste', true)
       on conflict (id) do update set app_id = excluded.app_id,
         embedded_signup_config_id = excluded.embedded_signup_config_id, embedded_signup_ligado = true`,
      [APP],
    );
    expect((await estado()).embeddedSignup).toEqual({ appId: APP, configId: "config-de-teste" });

    falso.limpar();
    const res = await embeddedSignup(CORPO);
    const corpo = await json<Record<string, unknown>>(res);
    expect(res.status, JSON.stringify(corpo)).toBe(200);
    expect(corpo.data).toMatchObject({ connected: true, numeroRegistrado: true });

    // O código foi trocado no servidor, e daí em diante quem fala é o token de negócio.
    const troca = falso.chamadas.find((c) => c.caminho === "/oauth/access_token")!;
    expect(new URLSearchParams(troca.busca).get("client_id")).toBe(APP);
    const depois = falso.chamadas.filter((c) => c.caminho !== "/oauth/access_token");
    expect(depois.length).toBeGreaterThan(0);
    for (const c of depois) expect(c.authorization).toBe(`Bearer ${TOKEN_DO_EMBEDDED_SIGNUP}`);

    const e = await estado();
    expect(e).toMatchObject({ connected: true, uso: "atendimento", appProprio: false });
  });
});

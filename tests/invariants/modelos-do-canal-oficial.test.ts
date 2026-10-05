/**
 * MODELOS DO CANAL OFICIAL, NA FRONTEIRA COM A META (issue #6).
 *
 * Mesma seam do `canal-oficial-ponta-a-ponta.test.ts`: o falso Graph
 * (`tests/support/falso-graph.ts`) do lado de saída, o webhook assinado postado
 * na ROTA REAL do lado de entrada, o banco de verdade (baseline aplicado) por
 * `pgComoSupabase`, e o sistema dirigido pelas rotas do app. Dublê, só a
 * identidade de quem chama.
 *
 * Os critérios de aceite, na ordem:
 *  1. sincronizar traz todos os modelos da conta (as duas páginas) com
 *     componentes, categoria, qualidade e motivo de recusa;
 *  2. o modelo criado no editor chega ao falso Graph no formato da Meta, com
 *     os exemplos das variáveis, e aparece na lista;
 *  3. (preview: `components/connections/EditorDeModelo.test.tsx`);
 *  4. webhook de aprovado, recusado, pausado e desativado atualiza o status sem
 *     sincronização manual — e os três últimos avisam na Central, uma vez só;
 *  5. webhook de mudança de categoria atualiza a categoria e avisa do custo;
 *  6. cada empresa vê só os próprios modelos e avisos.
 */
import pg from "pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { pgComoSupabase } from "../pg-como-supabase";
import { subirFalsoGraph, type FalsoGraph } from "../support/falso-graph";
import { eventoDeModelo, postarWebhookMeta } from "../support/webhook-meta-assinado";

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);

/** `bytea` como texto — ver o mesmo comentário em `canal-oficial-ponta-a-ponta.test.ts`. */
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

const ORG_A = "0d0e0006-0000-4000-8000-00000000000a";
const ORG_B = "0d0e0006-0000-4000-8000-00000000000b";
const USER_A = "0d0e0006-0000-4000-8000-0000000000a1";
const USER_B = "0d0e0006-0000-4000-8000-0000000000b1";

const NUMERO = "1103328999528866";
const WABA = "2434045433735166";
const TOKEN_DA_META = "EAAG-token-de-teste-com-tamanho-suficiente";
const APP_SECRET = "segredo-do-app-de-teste";

let falso: FalsoGraph;
let tokenDoWebhook = "";

function como(org: string, user: string) {
  quem.org = org;
  quem.user = user;
}

async function json<T = unknown>(res: Response): Promise<{ data: T } & Record<string, unknown>> {
  return (await res.json()) as { data: T } & Record<string, unknown>;
}

/** O que `GET /api/v1/channels/templates` devolve, nos campos que este arquivo lê. */
interface ModeloDaLista {
  name: string;
  language: string;
  status: string;
  category: string | null;
  rejectedReason: string | null;
  qualityScore: string | null;
  parameterFormat: string;
  components: unknown[];
}

async function listar(): Promise<ModeloDaLista[]> {
  const { GET } = await import("@/app/api/v1/channels/templates/route");
  const res = await GET();
  expect(res.status).toBe(200);
  return (await json<{ templates: ModeloDaLista[] }>(res)).data.templates;
}

async function sincronizar(): Promise<Response> {
  const { POST } = await import("@/app/api/v1/channels/templates/route");
  return POST(
    new NextRequest("http://localhost/api/v1/channels/templates", { method: "POST", body: "{}" }),
  );
}

async function criar(corpo: Record<string, unknown>): Promise<Response> {
  const { POST } = await import("@/app/api/v1/channels/templates/submit/route");
  return POST(
    new NextRequest("http://localhost/api/v1/channels/templates/submit", {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
  );
}

function webhook(field: Parameters<typeof eventoDeModelo>[1], value: Record<string, unknown>) {
  return postarWebhookMeta({
    token: tokenDoWebhook,
    appSecret: APP_SECRET,
    corpo: eventoDeModelo(WABA, field, value),
  });
}

const modeloDaLista = async (nome: string) => (await listar()).find((m) => m.name === nome);

async function avisosDe(
  org: string,
): Promise<Array<{ severity: string; title: string; body: string }>> {
  const { rows } = await pool.query(
    `select severity, title, body from agent_inbox_items
      where organization_id = $1 and kind = 'channel_template_review' order by created_at`,
    [org],
  );
  return rows;
}

/** Dois modelos da conta em duas páginas — o sync tem de seguir o cursor. */
const PAGINA_1 = {
  data: [
    {
      id: "111",
      name: "confirmacao_de_pedido",
      language: "pt_BR",
      status: "APPROVED",
      category: "UTILITY",
      parameter_format: "POSITIONAL",
      quality_score: { score: "GREEN", date: 1759600000 },
      rejected_reason: "NONE",
      components: [
        {
          type: "BODY",
          text: "Seu pedido {{1}} foi confirmado.",
          example: { body_text: [["ZAP-1"]] },
        },
        { type: "FOOTER", text: "Loja de Teste" },
      ],
    },
  ],
  paging: { cursors: { after: "CURSOR_2" }, next: "https://graph.facebook.com/v26.0/next" },
};
const PAGINA_2 = {
  data: [
    {
      id: "222",
      name: "promocao_recusada",
      language: "pt_BR",
      status: "REJECTED",
      category: "MARKETING",
      rejected_reason: "INVALID_FORMAT",
      components: [{ type: "BODY", text: "Promoção imperdível!" }],
    },
  ],
  paging: { cursors: { after: "FIM" } },
};

beforeAll(async () => {
  quem.db = pgComoSupabase(pool);

  for (const [org, user, slug] of [
    [ORG_A, USER_A, "modelos-a"],
    [ORG_B, USER_B, "modelos-b"],
  ] as const) {
    await pool.query(
      `insert into organizations (id, slug, legal_name, display_name) values ($1, $2, $3, $4)
       on conflict (id) do nothing`,
      [org, slug, `${slug} LTDA`, slug],
    );
    await pool.query(
      `insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing`,
      [user, `${slug}@teste.local`],
    );
    await pool.query(
      `insert into user_organizations (organization_id, user_id, role, accepted_at)
       values ($1, $2, 'admin', now()) on conflict do nothing`,
      [org, user],
    );
  }
  await pool.query(
    `insert into private.app_secrets (name, value)
     values ('integrations_oauth_key', 'chave-de-teste-do-canal-oficial-nao-e-segredo')
     on conflict (name) do nothing`,
  );

  falso = await subirFalsoGraph({ phoneNumberId: NUMERO, wabaId: WABA });
  vi.stubEnv("META_GRAPH_BASE_URL", falso.base);
  vi.stubEnv("META_GRAPH_VERSION", "");
  vi.stubEnv("META_APP_SECRET", APP_SECRET);
  vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verifica-de-teste");
  vi.stubEnv("META_PHONE_NUMBER_ID", "");
  vi.stubEnv("META_SYSTEM_USER_TOKEN", "");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://painel.teste.local");

  // A organização A conecta o número pela API, como a tela faz.
  como(ORG_A, USER_A);
  const { POST, GET } = await import("@/app/api/v1/channels/official/route");
  const res = await POST(
    new NextRequest("http://localhost/api/v1/channels/official", {
      method: "POST",
      body: JSON.stringify({ phone_number_id: NUMERO, waba_id: WABA, token: TOKEN_DA_META }),
      headers: { "content-type": "application/json" },
    }),
  );
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
  const estado = (
    await json<{ webhook: { callbackUrl: string } }>(
      await GET(new NextRequest("http://localhost/api/v1/channels/official")),
    )
  ).data;
  tokenDoWebhook = estado.webhook.callbackUrl.split("/").pop()!;

  // A organização B tem um modelo com a MESMA conta, nome e idioma de um que A
  // vai sincronizar — o pior caso para isolamento.
  await pool.query(
    `insert into meta_templates (organization_id, waba_id, name, language, status, category, components, contract_hash)
     values ($1, $2, 'confirmacao_de_pedido', 'pt_BR', 'APPROVED', 'UTILITY', '[]'::jsonb, 'hash-de-b')`,
    [ORG_B, WABA],
  );
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await falso?.fechar();
  await pool.end();
});

describe("1 · sincronizar traz todos os modelos da conta, completos", () => {
  it("segue as duas páginas e grava componentes, categoria, qualidade e motivo de recusa", async () => {
    como(ORG_A, USER_A);
    falso.limpar();
    falso.programar(
      { metodo: "GET", terminaCom: "/message_templates" },
      { status: 200, corpo: PAGINA_1 },
    );
    falso.programar(
      { metodo: "GET", terminaCom: "/message_templates" },
      { status: 200, corpo: PAGINA_2 },
    );

    const res = await sincronizar();
    const corpo = await json(res);
    expect(res.status, JSON.stringify(corpo)).toBe(200);
    expect(corpo.data).toMatchObject({ inserted: 2 });

    const buscas = falso.chamadas.filter(
      (c) => c.metodo === "GET" && c.caminho === `/${WABA}/message_templates`,
    );
    expect(buscas).toHaveLength(2);
    expect(buscas[1]!.busca).toContain("after=CURSOR_2");
    expect(buscas[0]!.busca).toMatch(/fields=.*components/);

    const lista = await listar();
    expect(lista.map((m) => m.name).sort()).toEqual(["confirmacao_de_pedido", "promocao_recusada"]);
    expect(lista.find((m) => m.name === "confirmacao_de_pedido")).toMatchObject({
      status: "APPROVED",
      category: "UTILITY",
      qualityScore: "GREEN",
      rejectedReason: null,
      components: PAGINA_1.data[0]!.components,
    });
    expect(lista.find((m) => m.name === "promocao_recusada")).toMatchObject({
      status: "REJECTED",
      category: "MARKETING",
      rejectedReason: "INVALID_FORMAT",
    });
  });
});

describe("2 · o modelo criado no editor chega ao falso Graph no formato da Meta", () => {
  it("leva os exemplos das variáveis e aparece na lista como pendente", async () => {
    como(ORG_A, USER_A);
    falso.limpar();
    const res = await criar({
      name: "cupom_de_outubro",
      language: "pt_BR",
      category: "MARKETING",
      parameter_format: "POSITIONAL",
      body: "Olá {{1}}, seu cupom de {{2}} chegou.",
      examples: { "1": "Ana", "2": "outubro" },
      footer: "Loja de Teste",
      buttons: [
        { type: "QUICK_REPLY", text: "Quero" },
        { type: "URL", text: "Ver loja", url: "https://loja.exemplo/c/{{1}}", example: "OUT10" },
        { type: "COPY_CODE", example: "OUT10" },
      ],
    });
    const corpo = await json(res);
    expect(res.status, JSON.stringify(corpo)).toBe(201);
    expect(corpo.data).toMatchObject({
      name: "cupom_de_outubro",
      status: "PENDING",
      category: "MARKETING",
    });

    const [chamada] = falso.modelosCriados();
    expect(chamada?.versao).toBe("v26.0");
    expect(chamada?.authorization).toBe(`Bearer ${TOKEN_DA_META}`);
    expect(chamada?.corpo).toEqual({
      name: "cupom_de_outubro",
      language: "pt_BR",
      category: "MARKETING",
      parameter_format: "POSITIONAL",
      components: [
        {
          type: "BODY",
          text: "Olá {{1}}, seu cupom de {{2}} chegou.",
          example: { body_text: [["Ana", "outubro"]] },
        },
        { type: "FOOTER", text: "Loja de Teste" },
        {
          type: "BUTTONS",
          buttons: [
            { type: "QUICK_REPLY", text: "Quero" },
            {
              type: "URL",
              text: "Ver loja",
              url: "https://loja.exemplo/c/{{1}}",
              example: ["https://loja.exemplo/c/OUT10"],
            },
            { type: "COPY_CODE", example: "OUT10" },
          ],
        },
      ],
    });

    expect(await modeloDaLista("cupom_de_outubro")).toMatchObject({
      status: "PENDING",
      category: "MARKETING",
      components: (chamada!.corpo as { components: unknown[] }).components,
    });

    const { rows } = await pool.query(
      `select count(*)::int as n from api_audit_log where organization_id = $1 and action = 'meta_template.submitted'`,
      [ORG_A],
    );
    expect(rows[0].n).toBe(1);
  });

  it("o que a Meta recusaria volta 422 no campo, sem ida ao falso Graph", async () => {
    como(ORG_A, USER_A);
    falso.limpar();
    const res = await criar({
      name: "sem_exemplo",
      language: "pt_BR",
      category: "MARKETING",
      body: "Olá {{1}}, tudo bem?",
    });
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).toContain("examples.1");
    expect(falso.modelosCriados()).toEqual([]);
  });

  it("nome e idioma repetidos voltam 409 sem ir à Meta", async () => {
    como(ORG_A, USER_A);
    falso.limpar();
    const res = await criar({
      name: "cupom_de_outubro",
      language: "pt_BR",
      category: "MARKETING",
      body: "Oi.",
    });
    expect(res.status).toBe(409);
    expect(falso.modelosCriados()).toEqual([]);
  });
});

describe("4 · webhook de status atualiza sem sincronização manual", () => {
  const chave = {
    message_template_id: 333,
    message_template_name: "cupom_de_outubro",
    message_template_language: "pt_BR",
  };

  it("APPROVED vira aprovado e não abre aviso", async () => {
    const res = await webhook("message_template_status_update", {
      ...chave,
      event: "APPROVED",
      reason: "NONE",
    });
    expect(res.status).toBe(200);
    expect((await modeloDaLista("cupom_de_outubro"))?.status).toBe("APPROVED");
    expect(await avisosDe(ORG_A)).toEqual([]);
  });

  it.each([
    ["REJECTED", "warn", "INVALID_FORMAT"],
    ["PAUSED", "critical", null],
    ["DISABLED", "critical", null],
  ])("%s atualiza o status e abre um aviso %s", async (evento, gravidade, motivo) => {
    const antes = (await avisosDe(ORG_A)).length;
    const res = await webhook("message_template_status_update", {
      ...chave,
      event: evento,
      reason: motivo,
    });
    expect(res.status).toBe(200);
    const modelo = await modeloDaLista("cupom_de_outubro");
    expect(modelo?.status).toBe(evento);
    if (motivo) expect(modelo?.rejectedReason).toBe(motivo);

    const avisos = await avisosDe(ORG_A);
    expect(avisos).toHaveLength(antes + 1);
    expect(avisos.at(-1)).toMatchObject({ severity: gravidade });
    expect(avisos.at(-1)!.body).toContain("cupom_de_outubro");
  });

  it("a reentrega do mesmo evento não abre outro aviso", async () => {
    const antes = (await avisosDe(ORG_A)).length;
    await webhook("message_template_status_update", { ...chave, event: "DISABLED", reason: null });
    expect(await avisosDe(ORG_A)).toHaveLength(antes);
  });
});

describe("5 · webhook de categoria atualiza a categoria e avisa do custo", () => {
  it("utilidade que vira marketing", async () => {
    const antes = (await avisosDe(ORG_A)).length;
    const res = await webhook("template_category_update", {
      message_template_id: 111,
      message_template_name: "confirmacao_de_pedido",
      message_template_language: "pt_BR",
      previous_category: "UTILITY",
      new_category: "MARKETING",
    });
    expect(res.status).toBe(200);
    expect((await modeloDaLista("confirmacao_de_pedido"))?.category).toBe("MARKETING");

    const avisos = await avisosDe(ORG_A);
    expect(avisos).toHaveLength(antes + 1);
    expect(avisos.at(-1)!.title).toMatch(/custo/i);
    expect(avisos.at(-1)!.body).toMatch(/utilidade.*marketing/i);
  });

  it("qualidade vermelha atualiza a qualidade e avisa", async () => {
    const antes = (await avisosDe(ORG_A)).length;
    await webhook("message_template_quality_update", {
      message_template_id: 111,
      message_template_name: "confirmacao_de_pedido",
      message_template_language: "pt_BR",
      previous_quality_score: "GREEN",
      new_quality_score: "RED",
    });
    expect((await modeloDaLista("confirmacao_de_pedido"))?.qualityScore).toBe("RED");
    expect(await avisosDe(ORG_A)).toHaveLength(antes + 1);
  });
});

describe("6 · cada empresa vê só os próprios modelos", () => {
  it("a lista de B não traz os modelos de A, e os webhooks de A não tocaram o modelo de B", async () => {
    como(ORG_B, USER_B);
    const lista = await listar();
    expect(lista.map((m) => m.name)).toEqual(["confirmacao_de_pedido"]);
    // A mesma conta, nome e idioma que A recategorizou e marcou vermelho.
    expect(lista[0]).toMatchObject({ status: "APPROVED", category: "UTILITY", qualityScore: null });
    expect(await avisosDe(ORG_B)).toEqual([]);
  });

  it("a lista de A não traz o modelo de B (que tem o mesmo nome)", async () => {
    como(ORG_A, USER_A);
    const doMesmoNome = (await listar()).filter((m) => m.name === "confirmacao_de_pedido");
    expect(doMesmoNome).toHaveLength(1);
    expect(doMesmoNome[0]!.category).toBe("MARKETING");
  });
});

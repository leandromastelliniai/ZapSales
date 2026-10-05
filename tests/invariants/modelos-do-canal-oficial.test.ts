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
 *  7. (issue #7) cabeçalho de imagem, vídeo e documento: a mídia vai ao falso
 *     Graph pela API de upload retomável e fica guardada no storage (o dublê em
 *     memória, `tests/support/storage-em-memoria.ts` — o Postgres efêmero não
 *     tem a API de Storage); carrossel com 2 cards, oferta por tempo limitado e
 *     botão de flow chegam ao falso Graph no formato da Meta; o espelho guarda
 *     onde está cada cópia (`header_media`); e caminho de outra organização é
 *     recusado.
 */
import pg from "pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { pgComoSupabase } from "../pg-como-supabase";
import { ASSINATURAS, arquivoDeTeste } from "../support/arquivos-de-midia";
import { subirFalsoGraph, type FalsoGraph } from "../support/falso-graph";
import { storageEmMemoria } from "../support/storage-em-memoria";
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
/** O bucket — o Postgres efêmero não tem a API de Storage do Supabase. */
const storage = storageEmMemoria();

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
  storedMedia: Record<string, { fileName: string; mimeType: string; url: string | null }>;
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
  quem.db = Object.assign(pgComoSupabase(pool), { storage });

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

// ─── issue #7 ──────────────────────────────────────────────────────────────

interface MidiaEnviada {
  handle: string;
  path: string;
  mime_type: string;
  file_name: string;
  format: string;
}

/** Sobe a mídia pela rota real, como o editor faz ao escolher o arquivo. */
async function subirMidia(bytes: Uint8Array, nome: string, format: string): Promise<MidiaEnviada> {
  const { POST } = await import("@/app/api/v1/channels/templates/media/route");
  const form = new FormData();
  form.append("file", new File([Buffer.from(bytes)], nome));
  form.append("format", format);
  const res = await POST(
    new NextRequest("http://localhost/api/v1/channels/templates/media", {
      method: "POST",
      body: form,
    }),
  );
  const corpo = await json<MidiaEnviada>(res);
  expect(res.status, JSON.stringify(corpo)).toBe(201);
  return corpo.data;
}

const semPreview = ({ handle, path, mime_type, file_name }: MidiaEnviada) => ({
  handle,
  path,
  mime_type,
  file_name,
});

async function midiasGuardadasNoEspelho(nome: string): Promise<Record<string, unknown> | undefined> {
  const { rows } = await pool.query(
    `select header_media from meta_templates where organization_id = $1 and name = $2`,
    [ORG_A, nome],
  );
  return rows[0]?.header_media as Record<string, unknown> | undefined;
}

describe("7 · templates avançados: mídia, carrossel, oferta e flow (issue #7)", () => {
  it.each([
    ["IMAGE", "image/png", ASSINATURAS.png, "vitrine.png"],
    ["VIDEO", "video/mp4", ASSINATURAS.mp4, "apresentacao.mp4"],
    ["DOCUMENT", "application/pdf", ASSINATURAS.pdf, "catalogo.pdf"],
  ] as const)(
    "cabeçalho %s: a mídia vai ao falso Graph pela API de upload, fica no storage e o modelo é criado com o handle",
    async (format, mime, cabeca, nome) => {
      como(ORG_A, USER_A);
      falso.limpar();
      const bytes = arquivoDeTeste(cabeca, 700);
      const midia = await subirMidia(bytes, nome, format);

      // Pelo fio: a sessão aberta no app do token, com o tamanho e o tipo, e o
      // arquivo inteiro no segundo passo.
      const sessao = falso.chamadas.find((c) => c.caminho.endsWith("/uploads"))!;
      expect(new URLSearchParams(sessao.busca).get("file_length")).toBe("700");
      expect(new URLSearchParams(sessao.busca).get("file_type")).toBe(mime);
      const [envio] = falso.arquivosEnviados();
      expect(envio!.authorization).toBe(`OAuth ${TOKEN_DA_META}`);
      expect(Buffer.compare(envio!.bytes, Buffer.from(bytes))).toBe(0);

      // No storage: a cópia, na pasta de modelos desta organização.
      expect(midia.path.startsWith(`${ORG_A}/templates/`)).toBe(true);
      const guardado = storage.objetos.get(`whatsapp-media/${midia.path}`);
      expect(guardado?.contentType).toBe(mime);
      expect(Buffer.compare(Buffer.from(guardado!.bytes), Buffer.from(bytes))).toBe(0);

      const nomeDoModelo = `cabecalho_${format.toLowerCase()}`;
      const res = await criar({
        name: nomeDoModelo,
        language: "pt_BR",
        category: "MARKETING",
        header: { format, media: semPreview(midia) },
        body: "Chegou a novidade da semana.",
      });
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
      expect(falso.modelosCriados()[0]!.corpo).toEqual({
        name: nomeDoModelo,
        language: "pt_BR",
        category: "MARKETING",
        parameter_format: "POSITIONAL",
        components: [
          { type: "HEADER", format, example: { header_handle: [midia.handle] } },
          { type: "BODY", text: "Chegou a novidade da semana." },
        ],
      });
      expect(await midiasGuardadasNoEspelho(nomeDoModelo)).toEqual({
        "header:1": { path: midia.path, mime_type: mime, file_name: nome },
      });
      // A lista mostra o arquivo guardado no slot de mídia, com link assinado.
      expect((await modeloDaLista(nomeDoModelo))?.storedMedia).toEqual({
        "header:1": { fileName: nome, mimeType: mime, url: expect.stringContaining(midia.path) },
      });
    },
  );

  it("a subida audita `meta_template.media_uploaded` uma vez por arquivo", async () => {
    const { rows } = await pool.query(
      `select count(*)::int as n from api_audit_log where organization_id = $1 and action = 'meta_template.media_uploaded'`,
      [ORG_A],
    );
    expect(rows[0].n).toBe(3);
  });

  it("carrossel com 2 cards chega no formato da Meta, com o handle de cada card", async () => {
    como(ORG_A, USER_A);
    falso.limpar();
    const fotos = [
      await subirMidia(arquivoDeTeste(ASSINATURAS.jpeg, 300), "produto_1.jpg", "IMAGE"),
      await subirMidia(arquivoDeTeste(ASSINATURAS.jpeg, 400), "produto_2.jpg", "IMAGE"),
    ];
    const res = await criar({
      kind: "CAROUSEL",
      name: "vitrine_carrossel",
      language: "pt_BR",
      category: "MARKETING",
      body: "Separei {{1}} ofertas para você.",
      examples: { "1": "duas" },
      cards: fotos.map((f, i) => ({
        header: { format: "IMAGE", media: semPreview(f) },
        body: `Produto ${i + 1} por {{1}}.`,
        examples: { "1": `R$ ${i + 1}0` },
        buttons: [
          { type: "QUICK_REPLY", text: "Quero" },
          { type: "URL", text: "Ver", url: "https://loja.exemplo/p/{{1}}", example: `p${i + 1}` },
        ],
      })),
    });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);

    const corpo = falso.modelosCriados()[0]!.corpo as { components: unknown[] };
    expect(corpo.components).toEqual([
      {
        type: "BODY",
        text: "Separei {{1}} ofertas para você.",
        example: { body_text: [["duas"]] },
      },
      {
        type: "CAROUSEL",
        cards: fotos.map((f, i) => ({
          components: [
            { type: "HEADER", format: "IMAGE", example: { header_handle: [f.handle] } },
            {
              type: "BODY",
              text: `Produto ${i + 1} por {{1}}.`,
              example: { body_text: [[`R$ ${i + 1}0`]] },
            },
            {
              type: "BUTTONS",
              buttons: [
                { type: "QUICK_REPLY", text: "Quero" },
                {
                  type: "URL",
                  text: "Ver",
                  url: "https://loja.exemplo/p/{{1}}",
                  example: [`https://loja.exemplo/p/p${i + 1}`],
                },
              ],
            },
          ],
        })),
      },
    ]);
    expect(Object.keys((await midiasGuardadasNoEspelho("vitrine_carrossel")) ?? {})).toEqual([
      "card0:header:1",
      "card1:header:1",
    ]);
    expect((await modeloDaLista("vitrine_carrossel"))?.status).toBe("PENDING");
  });

  it("oferta por tempo limitado chega com LIMITED_TIME_OFFER entre o cabeçalho e o corpo, e o cupom antes do link", async () => {
    como(ORG_A, USER_A);
    falso.limpar();
    const foto = await subirMidia(arquivoDeTeste(ASSINATURAS.png, 200), "oferta.png", "IMAGE");
    const res = await criar({
      kind: "LIMITED_TIME_OFFER",
      name: "oferta_relampago",
      language: "pt_BR",
      category: "MARKETING",
      header: { format: "IMAGE", media: semPreview(foto) },
      offer: { text: "Só hoje!", has_expiration: true },
      body: "Use o código {{1}} e ganhe 20% de desconto.",
      examples: { "1": "OUTUBRO20" },
      buttons: [
        { type: "URL", text: "Comprar", url: "https://loja.exemplo/oferta" },
        { type: "COPY_CODE", example: "OUTUBRO20" },
      ],
    });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
    expect((falso.modelosCriados()[0]!.corpo as { components: unknown[] }).components).toEqual([
      { type: "HEADER", format: "IMAGE", example: { header_handle: [foto.handle] } },
      {
        type: "LIMITED_TIME_OFFER",
        limited_time_offer: { text: "Só hoje!", has_expiration: true },
      },
      {
        type: "BODY",
        text: "Use o código {{1}} e ganhe 20% de desconto.",
        example: { body_text: [["OUTUBRO20"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "COPY_CODE", example: "OUTUBRO20" },
          { type: "URL", text: "Comprar", url: "https://loja.exemplo/oferta" },
        ],
      },
    ]);
  });

  it("oferta em utilidade volta 422 no campo, sem ida ao falso Graph", async () => {
    como(ORG_A, USER_A);
    falso.limpar();
    const res = await criar({
      kind: "LIMITED_TIME_OFFER",
      name: "oferta_errada",
      language: "pt_BR",
      category: "UTILITY",
      offer: { text: "Só hoje!", has_expiration: false },
      body: "Aproveite a oferta da semana.",
      buttons: [{ type: "URL", text: "Comprar", url: "https://loja.exemplo/oferta" }],
    });
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).toContain("oferta_so_marketing");
    expect(falso.modelosCriados()).toEqual([]);
  });

  it("botão de flow chega como FLOW com o id, a ação e a tela", async () => {
    como(ORG_A, USER_A);
    falso.limpar();
    const flow = {
      type: "FLOW",
      text: "Agendar",
      flow_id: "1234567890",
      flow_action: "navigate",
      navigate_screen: "AGENDA",
    };
    const res = await criar({
      name: "agendamento_por_flow",
      language: "pt_BR",
      category: "UTILITY",
      body: "Escolha o melhor horário para a sua visita.",
      buttons: [flow],
    });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
    expect((falso.modelosCriados()[0]!.corpo as { components: unknown[] }).components[1]).toEqual({
      type: "BUTTONS",
      buttons: [flow],
    });
  });

  it("caminho de mídia de outra organização volta 422 e não vai à Meta nem ao espelho", async () => {
    como(ORG_A, USER_A);
    falso.limpar();
    const res = await criar({
      name: "midia_alheia",
      language: "pt_BR",
      category: "MARKETING",
      header: {
        format: "IMAGE",
        media: {
          handle: "4::QUALQUER",
          path: `${ORG_B}/templates/0d0e0007-0000-4000-8000-0000000000bb.jpg`,
          mime_type: "image/jpeg",
          file_name: "de_b.jpg",
        },
      },
      body: "Chegou a novidade da semana.",
    });
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).toContain("midia_de_outra_organizacao");
    expect(falso.modelosCriados()).toEqual([]);
    expect(await midiasGuardadasNoEspelho("midia_alheia")).toBeUndefined();
  });

  it("arquivo que não serve de cabeçalho (GIF) volta 415 e não vai à Meta nem ao storage", async () => {
    como(ORG_A, USER_A);
    falso.limpar();
    const antes = storage.objetos.size;
    const { POST } = await import("@/app/api/v1/channels/templates/media/route");
    const form = new FormData();
    form.append(
      "file",
      new File([Buffer.from(arquivoDeTeste([0x47, 0x49, 0x46, 0x38]))], "animado.gif"),
    );
    const res = await POST(
      new NextRequest("http://localhost/api/v1/channels/templates/media", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(415);
    expect(falso.chamadas).toEqual([]);
    expect(storage.objetos.size).toBe(antes);
  });
});

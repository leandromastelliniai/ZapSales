/**
 * O CANAL OFICIAL PONTA A PONTA, NA FRONTEIRA COM A META (issue #4).
 *
 * A seam aprovada na spec (issue #1, "Testing Decisions") é a fronteira com a
 * Meta, nos dois sentidos:
 *
 * - **saída**: o falso Graph (`tests/support/falso-graph.ts`) — servidor HTTP de
 *   verdade, apontado pelo knob `META_GRAPH_BASE_URL`, que grava cada chamada e
 *   devolve sucesso realista ou o erro programado;
 * - **entrada**: webhook assinado com o App Secret, postado na ROTA REAL
 *   (`tests/support/webhook-meta-assinado.ts`).
 *
 * O sistema é dirigido pela API do app (as rotas de verdade: conectar, enviar,
 * listar mensagens) sobre o banco de verdade (baseline aplicado, via
 * `pgComoSupabase`). O que é dublê: só a IDENTIDADE de quem chama (a sessão de
 * navegador), porque este Postgres não tem GoTrue — e a organização ativa vem
 * dela, como em produção.
 *
 * O que fica medido, na ordem dos critérios de aceite:
 *  1. conecta um número, envia um modelo pelo falso Graph e recebe status
 *     assinado na rota real, conferindo o estado pela API do app;
 *  2. webhook com assinatura inválida é recusado e não escreve;
 *  3. toda chamada do canal usa a v26.0 e a API de mensagens leva a conta de
 *     mensagens;
 *  4. cada erro programado vira o código, a categoria certa e o motivo legível;
 *  5. mensagem só com BSUID cria/acha o contato, BSUID + telefone ficam na mesma
 *     ficha, e dá para responder a quem só tem BSUID;
 *  6. a outra organização não enxerga nada disso.
 */
import pg from "pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { classificarErroMeta, type CategoriaDeErroMeta } from "@/lib/channels/meta/erros";

import { pgComoSupabase } from "../pg-como-supabase";
import { erroDaGraph, subirFalsoGraph, type FalsoGraph } from "../support/falso-graph";
import { mensagemRecebida, postarWebhookMeta, statusDeEntrega } from "../support/webhook-meta-assinado";

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);

/**
 * `bytea` volta como TEXTO (`\x…`), que é como o PostgREST serializa — e é o
 * que `encryptWebhookSecret` devolve e `decryptWebhookSecret` espera. O `pg`
 * cru devolveria `Buffer`, e o token cifrado viraria `{"type":"Buffer",…}` ao
 * ser gravado de volta.
 */
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 1,
  types: {
    getTypeParser: ((oid: number, formato?: unknown) =>
      oid === 17 ? (v: string) => v : pg.types.getTypeParser(oid, formato as never)) as never,
  },
});

/** Quem está "logado" agora. As rotas leem daqui pelos dublês de identidade. */
const quem = vi.hoisted(() => ({
  db: null as unknown,
  org: "",
  user: "",
}));

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
vi.mock("@/lib/api/auth-dual", async (original) => ({
  ...(await original<object>()),
  resolveAuthDual: async () => ({
    ok: true,
    organizationId: quem.org,
    actor: { type: "user", id: quem.user, role: "admin" },
    supabase: quem.db,
    idioma: "pt-BR",
    via: "session",
  }),
}));

const ORG_A = "0d0e0004-0000-4000-8000-00000000000a";
const ORG_B = "0d0e0004-0000-4000-8000-00000000000b";
const USER_A = "0d0e0004-0000-4000-8000-0000000000a1";
const USER_B = "0d0e0004-0000-4000-8000-0000000000b1";

const NUMERO = "1103328999528818";
const WABA = "2434045433735175";
const CONTA_DE_MENSAGENS = "778899001122";
const TOKEN_DA_META = "EAAG-token-de-teste-com-tamanho-suficiente";
const APP_SECRET = "segredo-do-app-de-teste";
const ORIGEM = { wabaId: WABA, phoneNumberId: NUMERO };

const TELEFONE_DO_CLIENTE = "5531988887777";
const MODELO = "oferta_de_teste";

let falso: FalsoGraph;
let tokenDoWebhook = "";
let sessaoId = "";
let conversaDoTelefone = "";
let wamidDoModelo = "";

function como(org: string, user: string) {
  quem.org = org;
  quem.user = user;
}

/** O envelope `{ data }` das rotas, com o `data` que cada teste lê. */
async function json<T = unknown>(res: Response): Promise<{ data: T } & Record<string, unknown>> {
  return (await res.json()) as { data: T } & Record<string, unknown>;
}

/** O que `GET /api/v1/channels/official` devolve e este arquivo lê. */
interface EstadoDoCanal {
  connected: boolean;
  hasToken: boolean;
  channel_session_id: string;
  messagingAccountId: string | null;
  webhook: { callbackUrl: string };
}

/** Uma linha da listagem de mensagens da conversa (colunas que o teste confere). */
interface MensagemDaApi {
  direction: string;
  status: string;
  external_id: string;
  error_code: string | null;
  error_message: string | null;
  delivered_at: string | null;
  read_at: string | null;
  metadata: Record<string, unknown> | null;
}

async function conectar(corpo: Record<string, unknown>): Promise<Response> {
  const { POST } = await import("@/app/api/v1/channels/official/route");
  return POST(
    new NextRequest("http://localhost/api/v1/channels/official", {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
  );
}

async function estadoDoCanal(): Promise<EstadoDoCanal> {
  const { GET } = await import("@/app/api/v1/channels/official/route");
  return (await json<EstadoDoCanal>(await GET(new NextRequest("http://localhost/api/v1/channels/official")))).data;
}

async function enviar(corpo: Record<string, unknown>): Promise<Response> {
  const { POST } = await import("@/app/api/v1/messages/route");
  return POST(
    new NextRequest("http://localhost/api/v1/messages", {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
  );
}

async function mensagensDaConversa(conversationId: string): Promise<MensagemDaApi[]> {
  const { GET } = await import("@/app/api/v1/conversations/[id]/messages/route");
  const res = await GET(new NextRequest(`http://localhost/api/v1/conversations/${conversationId}/messages`), {
    params: Promise.resolve({ id: conversationId }),
  });
  if (res.status !== 200) return [];
  return (await json<MensagemDaApi[] | null>(res)).data ?? [];
}

async function enviarModelo(conversationId: string): Promise<Response> {
  return enviar({
    conversation_id: conversationId,
    type: "template",
    body: "Olá Ana, sua oferta chegou",
    template_name: MODELO,
    template_language: "pt_BR",
    template_values: { "1": "Ana" },
  });
}

beforeAll(async () => {
  quem.db = pgComoSupabase(pool);

  for (const [org, user, slug] of [
    [ORG_A, USER_A, "oficial-a"],
    [ORG_B, USER_B, "oficial-b"],
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
  // A chave de cifra da instalação: sem ela o token da Meta não é gravado (422).
  await pool.query(
    `insert into private.app_secrets (name, value)
     values ('integrations_oauth_key', 'chave-de-teste-do-canal-oficial-nao-e-segredo')
     on conflict (name) do nothing`,
  );

  falso = await subirFalsoGraph({ phoneNumberId: NUMERO, wabaId: WABA, numeroExibido: "+55 31 90000-0000" });
  vi.stubEnv("META_GRAPH_BASE_URL", falso.base);
  // Sem versão no ambiente: quem fala é o default do código, que é o que se mede.
  vi.stubEnv("META_GRAPH_VERSION", "");
  vi.stubEnv("META_APP_SECRET", APP_SECRET);
  vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verifica-de-teste");
  vi.stubEnv("META_PHONE_NUMBER_ID", "");
  vi.stubEnv("META_SYSTEM_USER_TOKEN", "");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://painel.teste.local");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await falso?.fechar();
  await pool.end();
});

describe("1 · conectar, enviar modelo pelo falso Graph e receber status assinado", () => {
  it("conecta o número pela API — a credencial é validada no falso Graph e o webhook é registrado", async () => {
    como(ORG_A, USER_A);
    const res = await conectar({
      phone_number_id: NUMERO,
      waba_id: WABA,
      token: TOKEN_DA_META,
      messaging_account_id: CONTA_DE_MENSAGENS,
    });
    const corpo = await json(res);
    expect(res.status, JSON.stringify(corpo)).toBe(200);
    expect(corpo.data).toMatchObject({ connected: true, webhookRegistro: { registrado: true } });

    const estado = await estadoDoCanal();
    expect(estado).toMatchObject({
      connected: true,
      hasToken: true,
      phoneNumberId: NUMERO,
      wabaId: WABA,
      messagingAccountId: CONTA_DE_MENSAGENS,
    });
    tokenDoWebhook = String(estado.webhook.callbackUrl).split("/").pop()!;
    sessaoId = estado.channel_session_id;
    expect(tokenDoWebhook.length).toBeGreaterThan(8);

    const vistas = falso.chamadas.map((c) => `${c.metodo} ${c.caminho}`);
    expect(vistas).toContain(`GET /${NUMERO}`);
    expect(vistas).toContain(`GET /${WABA}/phone_numbers`);
    expect(vistas).toContain(`POST /${WABA}/subscribed_apps`);
    // O token da Meta vai no cabeçalho, nunca na URL.
    for (const c of falso.chamadas) {
      expect(c.authorization).toBe(`Bearer ${TOKEN_DA_META}`);
      expect(c.busca).not.toContain(TOKEN_DA_META);
    }
  });

  it("o cliente escreve (webhook assinado) e a conversa nasce", async () => {
    const res = await postarWebhookMeta({
      token: tokenDoWebhook,
      appSecret: APP_SECRET,
      corpo: mensagemRecebida(ORIGEM, { wamid: "wamid.IN.1", texto: "Quero a oferta", nome: "Ana", telefone: TELEFONE_DO_CLIENTE }),
    });
    expect(res.status).toBe(200);

    const { rows } = await pool.query(
      `select c.id from conversations c join contacts k on k.id = c.contact_id
        where c.organization_id = $1 and k.phone_number = $2`,
      [ORG_A, `+${TELEFONE_DO_CLIENTE}`],
    );
    expect(rows).toHaveLength(1);
    conversaDoTelefone = rows[0].id;
  });

  it("envia o modelo aprovado pela API e ele chega ao falso Graph", async () => {
    await pool.query(
      `insert into meta_templates (organization_id, waba_id, name, language, status, category, components, contract_hash, channel_session_id)
       values ($1, $2, $3, 'pt_BR', 'APPROVED', 'MARKETING', $4::jsonb, 'hash-de-teste', $5)`,
      [
        ORG_A,
        WABA,
        MODELO,
        JSON.stringify([{ type: "BODY", text: "Olá {{1}}, sua oferta chegou", example: { body_text: [["Ana"]] } }]),
        sessaoId,
      ],
    );
    falso.limpar();

    const res = await enviarModelo(conversaDoTelefone);
    const corpo = await json(res);
    expect(res.status, JSON.stringify(corpo)).toBeLessThan(300);

    const [envio] = falso.envios();
    expect(envio).toBeDefined();
    expect(envio!.versao).toBe("v26.0");
    expect(envio!.corpo).toMatchObject({
      messaging_product: "whatsapp",
      messaging_account_id: CONTA_DE_MENSAGENS,
      to: TELEFONE_DO_CLIENTE,
      type: "template",
      template: {
        name: MODELO,
        language: { code: "pt_BR" },
        components: [{ type: "body", parameters: [{ type: "text", text: "Ana" }] }],
      },
    });

    const enviada = (await mensagensDaConversa(conversaDoTelefone)).find((m) => m.direction === "outbound");
    expect(enviada).toMatchObject({ status: "sent", external_id: expect.stringMatching(/^wamid\.FALSO\./) });
    wamidDoModelo = enviada!.external_id;
  });

  it("o status assinado na rota real marca entregue e lido — conferido pela API", async () => {
    for (const status of ["delivered", "read"] as const) {
      const res = await postarWebhookMeta({
        token: tokenDoWebhook,
        appSecret: APP_SECRET,
        corpo: statusDeEntrega(ORIGEM, { wamid: wamidDoModelo, status, telefone: TELEFONE_DO_CLIENTE }),
      });
      expect(res.status).toBe(200);
    }
    const mensagem = (await mensagensDaConversa(conversaDoTelefone)).find((m) => m.external_id === wamidDoModelo);
    expect(mensagem).toMatchObject({ status: "sent", error_code: null });
    expect(mensagem!.delivered_at).not.toBeNull();
    expect(mensagem!.read_at).not.toBeNull();
  });
});

describe("2 · assinatura inválida é recusada", () => {
  it("segredo errado, assinatura ausente ou adulterada: 401 e nada muda", async () => {
    const { rows: antes } = await pool.query(`select count(*)::int n from messages where organization_id = $1`, [ORG_A]);
    const corpo = mensagemRecebida(ORIGEM, { wamid: "wamid.FORJADA", texto: "forjada", telefone: "5531911112222" });

    for (const assinatura of [
      undefined, // assinada com o segredo errado, logo abaixo
      "",
      "sha256=" + "0".repeat(64),
    ]) {
      const res = await postarWebhookMeta({
        token: tokenDoWebhook,
        appSecret: assinatura === undefined ? "outro-segredo" : APP_SECRET,
        corpo,
        ...(assinatura !== undefined ? { assinatura } : {}),
      });
      expect(res.status).toBe(401);
    }

    const { rows: depois } = await pool.query(`select count(*)::int n from messages where organization_id = $1`, [ORG_A]);
    expect(depois[0].n).toBe(antes[0].n);
    const { rows: contato } = await pool.query(`select 1 from contacts where phone_number = '+5531911112222'`);
    expect(contato).toHaveLength(0);
  });
});

describe("3 · toda chamada do canal usa a v26.0 e a API de mensagens leva a conta de mensagens", () => {
  it("nenhuma chamada fora da v26.0; nenhum envio sem messaging_account_id", async () => {
    // As chamadas acumuladas depois do `limpar` mais um envio de texto novo.
    const res = await enviar({ conversation_id: conversaDoTelefone, type: "text", body: "Posso ajudar?" });
    expect(res.status).toBeLessThan(300);

    expect(falso.chamadas.length).toBeGreaterThan(0);
    for (const c of falso.chamadas) expect(c.versao, `${c.metodo} ${c.caminho}`).toBe("v26.0");
    const envios = falso.envios();
    expect(envios.length).toBeGreaterThanOrEqual(2);
    for (const e of envios) expect(e.corpo?.messaging_account_id).toBe(CONTA_DE_MENSAGENS);
  });
});

describe("4 · cada erro programado no falso Graph vira categoria certa e motivo legível", () => {
  it.each<[number, number, CategoriaDeErroMeta]>([
    [130429, 429, "limite_de_taxa"],
    [131049, 400, "limite_de_marketing_por_usuario"],
    [131050, 400, "opt_out_de_marketing"],
    [131026, 400, "destinatario_invalido"],
    [132001, 404, "template_invalido"],
    [131042, 400, "pagamento"],
  ])("%i (HTTP %i) → %s", async (codigo, status, categoria) => {
    falso.programar({ metodo: "POST", terminaCom: "/messages" }, erroDaGraph(codigo, { status }));

    const res = await enviarModelo(conversaDoTelefone);
    expect(res.status).toBeLessThan(500);

    const falhada = (await mensagensDaConversa(conversaDoTelefone)).find(
      (m) => m.direction === "outbound" && m.status === "failed" && m.error_code === String(codigo),
    );
    expect(falhada, `mensagem com ${codigo}`).toBeDefined();
    const esperado = classificarErroMeta({ code: codigo });
    // A categoria e a natureza chegam pela API, gravadas pelo próprio envio.
    expect(falhada!.metadata?.falha_do_canal).toEqual({
      categoria,
      temporario: esperado.temporario,
    });
    // O motivo gravado é a frase do mapa — não o texto cru que o falso Graph mandou.
    expect(falhada!.error_message).toBe(esperado.motivo);
    expect(falhada!.error_message).not.toContain("erro programado pelo teste");
  });
});

describe("5 · contatos identificados por BSUID", () => {
  const BSUID = "BR.13491208655302741918";
  const TELEFONE_DO_BSUID = "5531977776666";

  async function contatosDoBsuid() {
    const { rows } = await pool.query(
      `select id, phone_number, wa_bsuid from contacts
        where organization_id = $1 and wa_bsuid = $2 and is_merged_into is null`,
      [ORG_A, BSUID],
    );
    return rows as Array<{ id: string; phone_number: string | null; wa_bsuid: string }>;
  }

  it("mensagem só com BSUID cria o contato (sem telefone) e a conversa", async () => {
    const res = await postarWebhookMeta({
      token: tokenDoWebhook,
      appSecret: APP_SECRET,
      corpo: mensagemRecebida(ORIGEM, { wamid: "wamid.BSUID.1", texto: "oi, vim pelo nome de usuário", nome: "Bia", bsuid: BSUID }),
    });
    expect(res.status).toBe(200);
    const contatos = await contatosDoBsuid();
    expect(contatos).toHaveLength(1);
    expect(contatos[0]!.phone_number).toBeNull();
  });

  it("de novo só com BSUID: ENCONTRA o mesmo contato", async () => {
    const [antes] = await contatosDoBsuid();
    await postarWebhookMeta({
      token: tokenDoWebhook,
      appSecret: APP_SECRET,
      corpo: mensagemRecebida(ORIGEM, { wamid: "wamid.BSUID.2", texto: "tem desconto?", nome: "Bia", bsuid: BSUID }),
    });
    const contatos = await contatosDoBsuid();
    expect(contatos.map((c) => c.id)).toEqual([antes!.id]);
  });

  it("dá para RESPONDER a quem só tem BSUID — sai em `recipient`, sem `to`", async () => {
    const [contato] = await contatosDoBsuid();
    const { rows } = await pool.query(`select id from conversations where contact_id = $1`, [contato!.id]);
    expect(rows).toHaveLength(1);
    falso.limpar();

    const res = await enviar({ conversation_id: rows[0].id, type: "text", body: "Tem sim, 10% hoje." });
    expect(res.status).toBeLessThan(300);

    const [envio] = falso.envios();
    expect(envio!.corpo).toMatchObject({ recipient: BSUID, messaging_account_id: CONTA_DE_MENSAGENS });
    expect(envio!.corpo).not.toHaveProperty("to");
    const enviada = (await mensagensDaConversa(rows[0].id)).find((m) => m.direction === "outbound");
    expect(enviada).toMatchObject({ status: "sent" });
  });

  it("BSUID e telefone juntos ficam no MESMO contato", async () => {
    const [antes] = await contatosDoBsuid();
    await postarWebhookMeta({
      token: tokenDoWebhook,
      appSecret: APP_SECRET,
      corpo: mensagemRecebida(ORIGEM, {
        wamid: "wamid.BSUID.3",
        texto: "meu número é este",
        nome: "Bia",
        bsuid: BSUID,
        telefone: TELEFONE_DO_BSUID,
      }),
    });
    const contatos = await contatosDoBsuid();
    expect(contatos).toHaveLength(1);
    expect(contatos[0]).toMatchObject({ id: antes!.id, phone_number: `+${TELEFONE_DO_BSUID}` });
    const { rows } = await pool.query(
      `select count(*)::int n from contacts where organization_id = $1 and phone_number = $2`,
      [ORG_A, `+${TELEFONE_DO_BSUID}`],
    );
    expect(rows[0].n).toBe(1);
  });

  it("telefone já conhecido + BSUID novo: o BSUID entra na ficha do telefone", async () => {
    await postarWebhookMeta({
      token: tokenDoWebhook,
      appSecret: APP_SECRET,
      corpo: mensagemRecebida(ORIGEM, {
        wamid: "wamid.BSUID.4",
        texto: "oi de novo",
        nome: "Ana",
        telefone: TELEFONE_DO_CLIENTE,
        bsuid: "BR.555",
      }),
    });
    const { rows } = await pool.query(
      `select wa_bsuid from contacts where organization_id = $1 and phone_number = $2 and is_merged_into is null`,
      [ORG_A, `+${TELEFONE_DO_CLIENTE}`],
    );
    expect(rows).toEqual([{ wa_bsuid: "BR.555" }]);
  });
});

describe("6 · isolamento entre empresas", () => {
  it("a outra organização não vê o canal, a conversa nem as mensagens", async () => {
    como(ORG_B, USER_B);
    const estado = await estadoDoCanal();
    expect(estado.connected).toBe(false);
    expect(await mensagensDaConversa(conversaDoTelefone)).toEqual([]);
    como(ORG_A, USER_A);
  });

  it("o token do webhook de A não escreve em B, mesmo com o corpo citando outra WABA", async () => {
    await postarWebhookMeta({
      token: tokenDoWebhook,
      appSecret: APP_SECRET,
      corpo: mensagemRecebida({ wabaId: "WABA-DE-OUTRO", phoneNumberId: NUMERO }, {
        wamid: "wamid.INVASAO",
        texto: "x",
        telefone: "5531900001111",
      }),
    });
    const { rows } = await pool.query(`select organization_id from messages where external_id = 'wamid.INVASAO'`);
    expect(rows).toEqual([]);
    const { rows: deB } = await pool.query(`select count(*)::int n from contacts where organization_id = $1`, [ORG_B]);
    expect(deB[0].n).toBe(0);
  });
});

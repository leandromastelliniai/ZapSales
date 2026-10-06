/**
 * A CAMPANHA OFICIAL PONTA A PONTA, NA FRONTEIRA COM A META (issue #8).
 *
 * Mesma seam do canal oficial (issue #1, "Testing Decisions"):
 *
 * - **saída**: o falso Graph (`tests/support/falso-graph.ts`) grava cada envio de
 *   modelo e devolve sucesso ou o erro programado;
 * - **entrada**: webhook de status assinado, postado na ROTA REAL;
 * - o sistema é dirigido pela API do app (criar, preparar, iniciar, pausar,
 *   retomar, cancelar, duplicar, métricas, destinatários) e pelos PASSOS DO
 *   WORKER com relógio controlado (`rodarUmaRodadaOficial(db, agora)`).
 *
 * O banco é o de verdade (baseline aplicado). Dublê só da identidade de quem
 * chama, como em `canal-oficial-ponta-a-ponta.test.ts`.
 *
 * Critérios de aceite, na ordem da issue:
 *  1. modelo de texto com variáveis por contato sai para todos os elegíveis;
 *  2. descadastrados, bloqueados e suprimidos ficam de fora;
 *  3. a campanha exige base legal;
 *  4. pausar, retomar, cancelar e clonar no modo oficial;
 *  5. status do webhook atualizam destinatário e métricas;
 *  6. temporário volta à fila; 131049 não reenvia antes de 24 h; 131050 grava
 *     a recusa no contato; definitivo fica com motivo legível;
 *  7. agendamento e a regra das 24 h com relógio controlado;
 *  8. o modo WAHA não é tocado pela rodada oficial.
 */
import pg from "pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { classificarErroMeta } from "@/lib/channels/meta/erros";

import { pgComoSupabase } from "../pg-como-supabase";
import { erroDaGraph, subirFalsoGraph, type FalsoGraph } from "../support/falso-graph";
import { postarWebhookMeta, statusDeEntrega } from "../support/webhook-meta-assinado";

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);

/** `bytea` como texto, igual ao PostgREST (ver `canal-oficial-ponta-a-ponta.test.ts`). */
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
    full_name: "Gestora de Teste",
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

const ORG_A = "0d0e0008-0000-4000-8000-00000000000a";
const ORG_B = "0d0e0008-0000-4000-8000-00000000000b";
const USER_A = "0d0e0008-0000-4000-8000-0000000000a1";
const USER_B = "0d0e0008-0000-4000-8000-0000000000b1";

const NUMERO = "1108800000000001";
const WABA = "2408800000000001";
const TOKEN_DA_META = "EAAG-token-de-teste-da-campanha-oficial";
const APP_SECRET = "segredo-do-app-da-campanha";
const ORIGEM = { wabaId: WABA, phoneNumberId: NUMERO };

const MODELO = "oferta_de_outubro";
const TEXTO_DO_MODELO = "Oi {{1}}, sua oferta de {{2}} chegou. Responda para garantir.";
const TAG = "outubro";

/** Os contatos da organização A, pela função que cumprem no teste. */
const CONTATOS = {
  ana: { id: "0d0e0008-0000-4000-8000-0000000c0001", nome: "Ana Paula", tel: "+5531988880001" },
  bruno: { id: "0d0e0008-0000-4000-8000-0000000c0002", nome: "Bruno Lima", tel: "+5531988880002" },
  /** Pediu para parar (opt-out canônico). */
  carla: { id: "0d0e0008-0000-4000-8000-0000000c0003", nome: "Carla Dias", tel: "+5531988880003" },
  /** Recusou marketing (registro de consentimento). */
  davi: { id: "0d0e0008-0000-4000-8000-0000000c0004", nome: "Davi Rocha", tel: "+5531988880004" },
  /** Na lista de exclusão da operação. */
  eva: { id: "0d0e0008-0000-4000-8000-0000000c0005", nome: "Eva Melo", tel: "+5531988880005" },
  /** Sem nome: a variável {{1}} não tem valor. */
  semNome: { id: "0d0e0008-0000-4000-8000-0000000c0006", nome: null, tel: "+5531988880006" },
} as const;

let falso: FalsoGraph;
let tokenDoWebhook = "";
let sessaoId = "";
let modeloId = "";

/**
 * O relógio do worker: amanhã, 12:00 em São Paulo — dentro da janela padrão do
 * número (7h–22h), que a campanha sem janela própria herda. Fixo para o teste
 * não depender da hora em que roda. As rotas usam o relógio real (agendar
 * exige data no futuro, e T0 está no futuro).
 */
const AMANHA = new Date(Date.now() + 24 * 60 * 60_000);
const T0 = new Date(Date.UTC(AMANHA.getUTCFullYear(), AMANHA.getUTCMonth(), AMANHA.getUTCDate(), 15));
function emMinutos(min: number): Date {
  return new Date(T0.getTime() + min * 60_000);
}

function como(org: string, user: string) {
  quem.org = org;
  quem.user = user;
}

async function json<T = unknown>(res: Response): Promise<{ data: T } & Record<string, unknown>> {
  return (await res.json()) as { data: T } & Record<string, unknown>;
}

function pedido(url: string, metodo: string, corpo?: unknown): NextRequest {
  return new NextRequest(url, {
    method: metodo,
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo), headers: { "content-type": "application/json" } }),
  });
}

async function criarCampanha(corpo: Record<string, unknown>): Promise<Response> {
  const { POST } = await import("@/app/api/v1/campaigns/route");
  return POST(pedido("http://localhost/api/v1/campaigns", "POST", corpo));
}

async function acao(id: string, nome: string, corpo?: unknown): Promise<Response> {
  const { POST } = await import("@/app/api/v1/campaigns/[id]/[acao]/route");
  return POST(pedido(`http://localhost/api/v1/campaigns/${id}/${nome}`, "POST", corpo), {
    params: Promise.resolve({ id, acao: nome }),
  });
}

interface Contagem {
  total: number;
  elegiveis: number;
  excluidos: number;
  pendentes: number;
  enviados: number;
  entregues: number;
  lidos: number;
  falharam: number;
  cancelados: number;
  optOut: number;
}

async function metricas(id: string): Promise<Contagem> {
  const { GET } = await import("@/app/api/v1/campaigns/[id]/metrics/route");
  const res = await GET(pedido(`http://localhost/api/v1/campaigns/${id}/metrics`, "GET"), {
    params: Promise.resolve({ id }),
  });
  return (await json<{ contagem: Contagem }>(res)).data.contagem;
}

interface DestinatarioDaApi {
  id: string;
  contact_id: string;
  status: string;
  exclusion_reason: string | null;
  last_error_code: string | null;
  last_error_detail: string | null;
  next_attempt_at: string | null;
}

async function destinatarios(id: string): Promise<DestinatarioDaApi[]> {
  const { GET } = await import("@/app/api/v1/campaigns/[id]/recipients/route");
  const res = await GET(pedido(`http://localhost/api/v1/campaigns/${id}/recipients?limit=100`, "GET"), {
    params: Promise.resolve({ id }),
  });
  return (await json<DestinatarioDaApi[]>(res)).data ?? [];
}

async function destinatarioDe(campanhaId: string, contactId: string): Promise<DestinatarioDaApi> {
  const d = (await destinatarios(campanhaId)).find((r) => r.contact_id === contactId);
  if (!d) throw new Error(`destinatário ${contactId} não está na campanha ${campanhaId}`);
  return d;
}

async function rodada(agora: Date) {
  const { rodarUmaRodadaOficial } = await import("@/lib/campanhas/rodada-oficial");
  return rodarUmaRodadaOficial(quem.db as never, agora);
}

/** O corpo de uma campanha oficial válida, para cada teste mudar só o que mede. */
function campanhaOficial(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Oferta de outubro",
    channel_session_id: sessaoId,
    meta_template_id: modeloId,
    template_variables: {
      "1": { tipo: "contato", campo: "primeiro_nome" },
      "2": { tipo: "fixo", valor: "outubro" },
    },
    base_legal: "consent",
    audience_filter: { com_alguma_tag: [TAG], limite: 100 },
    ...extra,
  };
}

/** Cria, prepara e inicia: devolve o id. */
async function campanhaRodando(extra: Record<string, unknown> = {}): Promise<string> {
  const criada = await criarCampanha(campanhaOficial(extra));
  const corpo = await json<{ id: string }>(criada);
  expect(criada.status, JSON.stringify(corpo)).toBe(201);
  const id = corpo.data.id;
  const preparada = await acao(id, "preparar");
  expect(preparada.status, JSON.stringify(await preparada.clone().json())).toBe(200);
  const iniciada = await acao(id, "iniciar");
  expect(iniciada.status, JSON.stringify(await iniciada.clone().json())).toBe(200);
  return id;
}

/** O valor do parâmetro `{{n}}` do corpo num envio gravado pelo falso Graph. */
function parametrosDoCorpo(corpo: Record<string, unknown> | null): string[] {
  const template = (corpo?.template ?? {}) as { components?: Array<{ type: string; parameters?: Array<{ text?: string }> }> };
  const body = (template.components ?? []).find((c) => c.type === "body");
  return (body?.parameters ?? []).map((p) => p.text ?? "");
}

beforeAll(async () => {
  quem.db = pgComoSupabase(pool);

  for (const [org, user, slug] of [
    [ORG_A, USER_A, "campanha-oficial-a"],
    [ORG_B, USER_B, "campanha-oficial-b"],
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
     values ('integrations_oauth_key', 'chave-de-teste-da-campanha-oficial-nao-e-segredo')
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

  // O número oficial, conectado pela API como o operador conecta.
  como(ORG_A, USER_A);
  const { POST, GET } = await import("@/app/api/v1/channels/official/route");
  const conectou = await POST(
    pedido("http://localhost/api/v1/channels/official", "POST", {
      phone_number_id: NUMERO,
      waba_id: WABA,
      token: TOKEN_DA_META,
    }),
  );
  expect(conectou.status, JSON.stringify(await conectou.clone().json())).toBe(200);
  const estado = (await json<{ channel_session_id: string; webhook: { callbackUrl: string } }>(
    await GET(pedido("http://localhost/api/v1/channels/official", "GET")),
  )).data;
  sessaoId = estado.channel_session_id;
  tokenDoWebhook = String(estado.webhook.callbackUrl).split("/").pop()!;
  await pool.query(`update channel_sessions set status = 'WORKING' where id = $1`, [sessaoId]);
  // Todo canal nasce FECHADO ao público (pré-go-live) e nenhum envio automático
  // passa até o operador abri-lo — campanha inclusive. Abre pela rota da tela.
  const { PATCH: abrir } = await import("@/app/api/v1/channel-sessions/[id]/ai-access/route");
  const aberto = await abrir(
    pedido(`http://localhost/api/v1/channel-sessions/${sessaoId}/ai-access`, "PATCH", {
      mode: "open",
      test_phone_numbers: [],
    }),
    { params: Promise.resolve({ id: sessaoId }) },
  );
  expect(aberto.status, JSON.stringify(await aberto.clone().json())).toBe(200);

  // O modelo aprovado, como o sync da Meta o grava (linha da conta, sem conexão).
  const { rows } = await pool.query<{ id: string }>(
    `insert into meta_templates (organization_id, waba_id, name, language, status, category, components, contract_hash)
     values ($1, $2, $3, 'pt_BR', 'APPROVED', 'MARKETING', $4::jsonb, 'hash-da-campanha') returning id`,
    [ORG_A, WABA, MODELO, JSON.stringify([{ type: "BODY", text: TEXTO_DO_MODELO }])],
  );
  modeloId = rows[0]!.id;

  for (const c of Object.values(CONTATOS)) {
    await pool.query(
      `insert into contacts (id, organization_id, name, phone_number, tags, source)
       values ($1, $2, $3, $4, array[$5], 'manual')`,
      [c.id, ORG_A, c.nome, c.tel, TAG],
    );
  }
  await pool.query(`update contacts set is_blocked = true, blocked_at = now() where id = $1`, [CONTATOS.carla.id]);
  await pool.query(
    `update contacts set consent = jsonb_set(consent, '{marketing,declined_at}', to_jsonb(now()::text)) where id = $1`,
    [CONTATOS.davi.id],
  );
  const { POST: suprimir } = await import("@/app/api/v1/campaign-suppressions/route");
  const suprimido = await suprimir(
    pedido("http://localhost/api/v1/campaign-suppressions", "POST", { address: CONTATOS.eva.tel }),
  );
  expect(suprimido.status, JSON.stringify(await suprimido.clone().json())).toBe(201);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await falso?.fechar();
  await pool.end();
});

describe("1 · modelo de texto com variáveis por contato sai para todos os elegíveis", () => {
  let campanhaId = "";

  it("cria, prepara e inicia pela API; a rodada envia o modelo pelo falso Graph", async () => {
    como(ORG_A, USER_A);
    falso.limpar();
    campanhaId = await campanhaRodando();

    const r = await rodada(emMinutos(0));
    expect(r.enviadas, JSON.stringify({ r, d: await destinatarios(campanhaId) })).toBe(2);

    const envios = falso.envios();
    expect(envios).toHaveLength(2);
    for (const e of envios) {
      expect(e.corpo).toMatchObject({
        messaging_product: "whatsapp",
        type: "template",
        template: { name: MODELO, language: { code: "pt_BR" } },
      });
    }
    const porDestino = new Map(envios.map((e) => [String(e.corpo?.to), parametrosDoCorpo(e.corpo)]));
    expect(porDestino.get(CONTATOS.ana.tel.slice(1))).toEqual(["Ana", "outubro"]);
    expect(porDestino.get(CONTATOS.bruno.tel.slice(1))).toEqual(["Bruno", "outubro"]);
  });

  it("os enviados contam no painel, e a campanha conclui quando não sobra ninguém", async () => {
    const c = await metricas(campanhaId);
    expect(c.enviados).toBe(2);
    expect(c.pendentes).toBe(0);

    await rodada(emMinutos(1));
    expect(await statusDaCampanha(campanhaId)).toBe("completed");
  });
});

// ─── Auxiliares dos cenários seguintes ───────────────────────────────────────

let sequenciaDeTelefone = 100;

/** Contatos novos com uma etiqueta só deles: cada cenário recorta o próprio público. */
async function semearContatos(tag: string, nomes: string[]): Promise<Array<{ id: string; tel: string; nome: string }>> {
  const criados: Array<{ id: string; tel: string; nome: string }> = [];
  for (const nome of nomes) {
    sequenciaDeTelefone += 1;
    const tel = `+553198887${String(sequenciaDeTelefone).padStart(4, "0")}`;
    const { rows } = await pool.query<{ id: string }>(
      `insert into contacts (organization_id, name, phone_number, tags, source)
       values ($1, $2, $3, array[$4], 'manual') returning id`,
      [ORG_A, nome, tel, tag],
    );
    criados.push({ id: rows[0]!.id, tel, nome });
  }
  return criados;
}

/** Os envios de modelo para um telefone, na ordem em que chegaram ao falso Graph. */
function enviosPara(tel: string) {
  return falso.envios().filter((e) => e.corpo?.to === tel.slice(1));
}

/** O `wamid` que o falso Graph devolveu ao último envio para este telefone. */
function wamidPara(tel: string): string {
  const ultimo = enviosPara(tel).at(-1);
  const corpo = ultimo?.resposta?.corpo as { messages?: Array<{ id: string }> } | undefined;
  const id = corpo?.messages?.[0]?.id;
  if (!id) throw new Error(`nenhum envio com sucesso para ${tel}`);
  return id;
}

async function postarStatus(
  tel: string,
  status: "sent" | "delivered" | "read" | "failed",
  erro?: { code: number; title: string },
): Promise<void> {
  const res = await postarWebhookMeta({
    token: tokenDoWebhook,
    appSecret: APP_SECRET,
    corpo: statusDeEntrega(ORIGEM, { wamid: wamidPara(tel), status, telefone: tel.slice(1), ...(erro ? { erro } : {}) }),
  });
  expect(res.status).toBe(200);
}

async function statusDaCampanha(id: string): Promise<string> {
  const { GET } = await import("@/app/api/v1/campaigns/[id]/route");
  const res = await GET(pedido(`http://localhost/api/v1/campaigns/${id}`, "GET"), { params: Promise.resolve({ id }) });
  return (await json<{ status: string }>(res)).data.status;
}

describe("2 · descadastrados, bloqueados e suprimidos ficam de fora", () => {
  it("a preparação exclui cada um com o motivo, e só os elegíveis entram na fila", async () => {
    como(ORG_A, USER_A);
    // A mesma etiqueta do cenário 1 (concluído): o que se mede é o MOTIVO de cada exclusão.
    const id = await campanhaRodando();
    const motivo = async (contactId: string) => (await destinatarioDe(id, contactId)).exclusion_reason;
    expect(await motivo(CONTATOS.carla.id)).toBe("opt_out");
    expect(await motivo(CONTATOS.davi.id)).toBe("recusou_marketing");
    expect(await motivo(CONTATOS.eva.id)).toBe("suprimido");
    expect(await motivo(CONTATOS.semNome.id)).toBe("variavel_ausente");
    const c = await metricas(id);
    expect(c.excluidos).toBe(4);
    expect(c.elegiveis).toBe(2);
    expect((await acao(id, "cancelar")).status).toBe(200);
  });

  it("quem pede para parar DEPOIS da preparação é pulado na hora do envio", async () => {
    const [fica, sai] = await semearContatos("revalida", ["Fernanda Reis", "Gustavo Prado"]);
    const id = await campanhaRodando({ audience_filter: { com_alguma_tag: ["revalida"], limite: 100 } });
    await pool.query(`update contacts set is_blocked = true, blocked_at = now() where id = $1`, [sai!.id]);

    await rodada(emMinutos(5));

    expect(enviosPara(fica!.tel)).toHaveLength(1);
    expect(enviosPara(sai!.tel)).toHaveLength(0);
    expect(await destinatarioDe(id, sai!.id)).toMatchObject({ status: "opted_out", exclusion_reason: "opt_out" });
  });
});

describe("3 · a campanha oficial exige base legal", () => {
  it("interesse legítimo sem a referência da avaliação (LIA) é recusado", async () => {
    const res = await criarCampanha(campanhaOficial({ base_legal: "legitimate_interest", lia_ref: null }));
    expect(res.status).toBe(422);
  });

  it("sem base legal nenhuma, também", async () => {
    const corpo = campanhaOficial();
    delete corpo.base_legal;
    expect((await criarCampanha(corpo)).status).toBe(422);
  });

  it("com interesse legítimo e LIA, passa", async () => {
    const res = await criarCampanha(
      campanhaOficial({
        base_legal: "legitimate_interest",
        lia_ref: "LIA-2026-10",
        audience_filter: { com_alguma_tag: ["ninguem"], limite: 1 },
      }),
    );
    expect(res.status).toBe(201);
  });
});

describe("4 · pausar, retomar, cancelar e clonar no modo oficial", () => {
  it("pausada não envia; retomada envia", async () => {
    const [a, b] = await semearContatos("controle", ["Helena Costa", "Igor Nunes"]);
    const id = await campanhaRodando({ audience_filter: { com_alguma_tag: ["controle"], limite: 100 } });

    expect((await acao(id, "pausar")).status).toBe(200);
    await rodada(emMinutos(10));
    expect(enviosPara(a!.tel)).toHaveLength(0);
    expect(await statusDaCampanha(id)).toBe("paused");

    expect((await acao(id, "retomar")).status).toBe(200);
    await rodada(emMinutos(11));
    expect(enviosPara(a!.tel)).toHaveLength(1);
    expect(enviosPara(b!.tel)).toHaveLength(1);
  });

  let canceladaId = "";

  it("cancelada não envia, e os pendentes ficam cancelados", async () => {
    const [a] = await semearContatos("cancela", ["Júlia Matos", "Kauã Ribeiro"]);
    canceladaId = await campanhaRodando({ audience_filter: { com_alguma_tag: ["cancela"], limite: 100 } });

    expect((await acao(canceladaId, "cancelar")).status).toBe(200);
    await rodada(emMinutos(12));
    expect(enviosPara(a!.tel)).toHaveLength(0);
    expect((await metricas(canceladaId)).cancelados).toBe(2);
    expect(await statusDaCampanha(canceladaId)).toBe("cancelled");
  });

  it("o clone é oficial — mesmo modelo e mesmo mapa — e envia ao ser iniciado", async () => {
    const res = await acao(canceladaId, "duplicar");
    expect(res.status).toBe(200);
    const cloneId = (await json<{ id: string }>(res)).data.id;

    const { GET } = await import("@/app/api/v1/campaigns/[id]/route");
    const clone = (await json<{ meta_template_id: string; template_variables: unknown; status: string }>(
      await GET(pedido(`http://localhost/api/v1/campaigns/${cloneId}`, "GET"), { params: Promise.resolve({ id: cloneId }) }),
    )).data;
    expect(clone).toMatchObject({ meta_template_id: modeloId, status: "draft" });
    expect(clone.template_variables).toEqual(campanhaOficial().template_variables);

    expect((await acao(cloneId, "preparar")).status).toBe(200);
    expect((await acao(cloneId, "iniciar")).status).toBe(200);
    await rodada(emMinutos(13));
    expect((await destinatarios(cloneId)).filter((d) => d.status === "sent")).toHaveLength(2);
  });
});

describe("5 · status do webhook atualizam destinatário e painel", () => {
  it("entregue e lido chegam ao destinatário e às métricas; ack atrasado não rebaixa", async () => {
    const [p, q] = await semearContatos("status", ["Larissa Alves", "Marcos Souza"]);
    const id = await campanhaRodando({ audience_filter: { com_alguma_tag: ["status"], limite: 100 } });
    await rodada(emMinutos(14));

    await postarStatus(p!.tel, "delivered");
    await postarStatus(q!.tel, "delivered");
    await postarStatus(q!.tel, "read");

    expect((await destinatarioDe(id, p!.id)).status).toBe("delivered");
    expect((await destinatarioDe(id, q!.id)).status).toBe("read");
    expect(await metricas(id)).toMatchObject({ enviados: 2, entregues: 2, lidos: 1 });

    // A Meta não garante ordem: um `delivered` depois do `read` não volta atrás.
    await postarStatus(q!.tel, "delivered");
    expect((await destinatarioDe(id, q!.id)).status).toBe("read");
  });

  it("falha que chega pelo webhook aparece no destinatário com o motivo legível", async () => {
    const [r] = await semearContatos("status-falha", ["Nina Torres"]);
    const id = await campanhaRodando({ audience_filter: { com_alguma_tag: ["status-falha"], limite: 100 } });
    await rodada(emMinutos(15));
    await postarStatus(r!.tel, "failed", { code: 131026, title: "Message undeliverable" });

    expect(await destinatarioDe(id, r!.id)).toMatchObject({
      status: "failed",
      last_error_code: "131026",
      last_error_detail: classificarErroMeta({ code: 131026 }).motivo,
    });
    expect((await metricas(id)).falharam).toBe(1);
  });
});

describe("6 · erros da Meta: temporário, 131049, 131050 e definitivo", () => {
  it("limite de taxa volta para a fila com espera e sai na tentativa seguinte", async () => {
    const [t] = await semearContatos("taxa", ["Otávio Lima"]);
    const id = await campanhaRodando({ audience_filter: { com_alguma_tag: ["taxa"], limite: 100 } });
    falso.programar({ metodo: "POST", terminaCom: "/messages" }, erroDaGraph(130429, { status: 429 }));

    const quando = emMinutos(20);
    await rodada(quando);
    const depois = await destinatarioDe(id, t!.id);
    expect(depois.status).toBe("pending");
    expect(depois.last_error_code).toBe("130429");
    expect(depois.last_error_detail).toBe(classificarErroMeta({ code: 130429 }).motivo);
    expect(new Date(depois.next_attempt_at!).getTime()).toBe(quando.getTime() + 60_000);

    await rodada(new Date(quando.getTime() + 30_000));
    expect(enviosPara(t!.tel)).toHaveLength(1); // só a tentativa recusada

    await rodada(new Date(quando.getTime() + 61_000));
    expect(enviosPara(t!.tel)).toHaveLength(2);
    expect((await destinatarioDe(id, t!.id)).status).toBe("sent");
  });

  it("131049 pelo webhook: o contato não recebe de novo antes de 24 h, nem por outra campanha", async () => {
    const [m] = await semearContatos("marketing", ["Paula Freitas"]);
    const primeira = await campanhaRodando({ audience_filter: { com_alguma_tag: ["marketing"], limite: 100 } });
    const envio = emMinutos(30);
    await rodada(envio);
    expect(enviosPara(m!.tel)).toHaveLength(1);

    await postarStatus(m!.tel, "failed", { code: 131049, title: "Healthy ecosystem engagement" });
    const voltou = await destinatarioDe(primeira, m!.id);
    expect(voltou).toMatchObject({ status: "pending", last_error_code: "131049" });
    // 24 h contadas do ENVIO — o mesmo relógio da regra entre campanhas.
    expect(new Date(voltou.next_attempt_at!).getTime()).toBe(envio.getTime() + 24 * 60 * 60_000);

    // Encerrada a primeira, uma SEGUNDA campanha para o mesmo contato também espera.
    expect((await acao(primeira, "cancelar")).status).toBe(200);
    const segunda = await campanhaRodando({ audience_filter: { com_alguma_tag: ["marketing"], limite: 100 } });

    await rodada(new Date(envio.getTime() + 23 * 60 * 60_000));
    expect(enviosPara(m!.tel)).toHaveLength(1);
    const esperando = await destinatarioDe(segunda, m!.id);
    expect(esperando.status).toBe("pending");
    expect(new Date(esperando.next_attempt_at!).getTime()).toBe(envio.getTime() + 24 * 60 * 60_000);

    await rodada(new Date(envio.getTime() + 24 * 60 * 60_000 + 60_000));
    expect(enviosPara(m!.tel)).toHaveLength(2);
    expect((await destinatarioDe(segunda, m!.id)).status).toBe("sent");
  });

  it("131050 grava a recusa de marketing no contato, e a próxima campanha o deixa de fora", async () => {
    const [o] = await semearContatos("recusa", ["Rafael Gomes"]);
    const id = await campanhaRodando({ audience_filter: { com_alguma_tag: ["recusa"], limite: 100 } });
    falso.programar({ metodo: "POST", terminaCom: "/messages" }, erroDaGraph(131050));

    await rodada(emMinutos(40));
    const d = await destinatarioDe(id, o!.id);
    expect(d.status).toBe("opted_out");
    expect(d.last_error_code).toBe("131050");
    expect((await metricas(id)).optOut).toBe(1);

    const outra = await criarCampanha(campanhaOficial({ audience_filter: { com_alguma_tag: ["recusa"], limite: 100 } }));
    const outraId = (await json<{ id: string }>(outra)).data.id;
    // Ninguém elegível: a preparação recusa e a prévia mostra o motivo.
    expect((await acao(outraId, "preparar")).status).toBe(422);
    const { POST: prever } = await import("@/app/api/v1/campaigns/preview/route");
    const previa = await json<{ motivos: Record<string, number> }>(
      await prever(
        pedido("http://localhost/api/v1/campaigns/preview", "POST", {
          audience_filter: { com_alguma_tag: ["recusa"], limite: 100 },
          campaign_id: outraId,
        }),
      ),
    );
    expect(previa.data.motivos).toEqual({ recusou_marketing: 1 });
  });

  it("erro definitivo vira falha com o motivo legível, sem nova tentativa", async () => {
    const [x] = await semearContatos("definitivo", ["Sara Pinto"]);
    const id = await campanhaRodando({ audience_filter: { com_alguma_tag: ["definitivo"], limite: 100 } });
    falso.programar({ metodo: "POST", terminaCom: "/messages" }, erroDaGraph(131026));

    await rodada(emMinutos(50));
    expect(await destinatarioDe(id, x!.id)).toMatchObject({
      status: "failed",
      last_error_code: "131026",
      last_error_detail: classificarErroMeta({ code: 131026 }).motivo,
      next_attempt_at: null,
    });
    await rodada(emMinutos(55));
    expect(enviosPara(x!.tel)).toHaveLength(1);
    expect(await statusDaCampanha(id)).toBe("completed");
  });
});

describe("7 · agendamento e janela de horário, com relógio controlado", () => {
  it("agendada só sai quando a hora chega", async () => {
    const [s] = await semearContatos("agenda", ["Tiago Moura"]);
    const criada = await criarCampanha(campanhaOficial({ audience_filter: { com_alguma_tag: ["agenda"], limite: 100 } }));
    const id = (await json<{ id: string }>(criada)).data.id;
    expect((await acao(id, "preparar")).status).toBe(200);
    const quando = new Date(T0.getTime() + 2 * 60 * 60_000);
    expect((await acao(id, "agendar", { scheduled_at: quando.toISOString() })).status).toBe(200);

    await rodada(new Date(quando.getTime() - 60_000));
    expect(await statusDaCampanha(id)).toBe("scheduled");
    expect(enviosPara(s!.tel)).toHaveLength(0);

    await rodada(new Date(quando.getTime() + 60_000));
    expect(enviosPara(s!.tel)).toHaveLength(1);
  });

  it("fora da janela da campanha não envia; dentro, envia (fuso da organização)", async () => {
    const [j] = await semearContatos("janela", ["Úrsula Dias"]);
    await campanhaRodando({
      audience_filter: { com_alguma_tag: ["janela"], limite: 100 },
      janela_inicio_hora: 9,
      janela_fim_hora: 18,
    });
    // Depois de amanhã, 06:00 UTC = 03:00 em São Paulo (fora) e 15:00 UTC = 12:00 (dentro).
    const dia = new Date(T0.getTime() + 2 * 24 * 60 * 60_000);
    const madrugada = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), 6));
    const meioDia = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), 15));

    await rodada(madrugada);
    expect(enviosPara(j!.tel)).toHaveLength(0);
    await rodada(meioDia);
    expect(enviosPara(j!.tel)).toHaveLength(1);
  });
});

describe("8 · o modo WAHA não muda", () => {
  let canalWaha = "";

  beforeAll(async () => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into channel_sessions (organization_id, waha_session_name, status, webhook_secret_encrypted)
       values ($1, 'waha-da-campanha', 'WORKING', decode('00','hex')) returning id`,
      [ORG_A],
    );
    canalWaha = rows[0]!.id;
  });

  it("modelo da Meta não sai por número WAHA", async () => {
    como(ORG_A, USER_A);
    expect((await criarCampanha(campanhaOficial({ channel_session_id: canalWaha }))).status).toBe(422);
  });

  it("a rodada oficial não toca na campanha de texto do modo WAHA", async () => {
    const [w] = await semearContatos("waha", ["Vera Lúcia"]);
    const criada = await criarCampanha({
      name: "Texto pelo WAHA",
      channel_session_id: canalWaha,
      message_body: "Oi {{primeiro_nome}}, tudo bem?",
      base_legal: "consent",
      audience_filter: { com_alguma_tag: ["waha"], limite: 100 },
    });
    expect(criada.status).toBe(201);
    const id = (await json<{ id: string }>(criada)).data.id;
    expect((await acao(id, "preparar")).status).toBe(200);
    expect((await acao(id, "iniciar")).status).toBe(200);

    await rodada(emMinutos(60));
    expect(enviosPara(w!.tel)).toHaveLength(0);
    expect((await destinatarioDe(id, w!.id)).status).toBe("pending");
    expect(await statusDaCampanha(id)).toBe("running");
  });
});

describe("9 · a outra organização não enxerga nem usa nada disto", () => {
  it("não lê o painel de uma campanha da organização A", async () => {
    como(ORG_A, USER_A);
    const criada = await criarCampanha(campanhaOficial({ audience_filter: { com_alguma_tag: ["ninguem"], limite: 1 } }));
    const idDeA = (await json<{ id: string }>(criada)).data.id;

    como(ORG_B, USER_B);
    const { GET } = await import("@/app/api/v1/campaigns/[id]/metrics/route");
    const res = await GET(pedido(`http://localhost/api/v1/campaigns/${idDeA}/metrics`, "GET"), {
      params: Promise.resolve({ id: idDeA }),
    });
    expect(res.status).toBe(404);
    como(ORG_A, USER_A);
  });

  it("não cria campanha com o número nem com o modelo da organização A", async () => {
    como(ORG_B, USER_B);
    const res = await criarCampanha(campanhaOficial());
    expect([409, 422]).toContain(res.status);
    como(ORG_A, USER_A);
  });
});

describe("10 · o que a tela usa: lista de modelos, prévia com modelo e envio de teste", () => {
  it("a lista de modelos do número oficial traz o aprovado com as variáveis; a do WAHA vem vazia", async () => {
    como(ORG_A, USER_A);
    const { GET } = await import("@/app/api/v1/campaigns/modelos/route");
    const oficial = await json<{ oficial: boolean; modelos: Array<{ id: string; variaveis: Array<{ chave: string }> }> }>(
      await GET(pedido(`http://localhost/api/v1/campaigns/modelos?channel_session_id=${sessaoId}`, "GET")),
    );
    expect(oficial.data.oficial).toBe(true);
    expect(oficial.data.modelos.map((m) => m.id)).toEqual([modeloId]);
    expect(oficial.data.modelos[0]!.variaveis.map((v) => v.chave)).toEqual(["1", "2"]);

    const { rows } = await pool.query<{ id: string }>(
      `select id from channel_sessions where organization_id = $1 and provider = 'waha' limit 1`,
      [ORG_A],
    );
    const waha = await json<{ oficial: boolean; modelos: unknown[] }>(
      await GET(pedido(`http://localhost/api/v1/campaigns/modelos?channel_session_id=${rows[0]!.id}`, "GET")),
    );
    expect(waha.data).toEqual({ oficial: false, modelos: [] });
  });

  it("a prévia com modelo conta quem fica sem valor para uma variável", async () => {
    const { POST } = await import("@/app/api/v1/campaigns/preview/route");
    const previa = await json<{ elegiveis: number; motivos: Record<string, number> }>(
      await POST(
        pedido("http://localhost/api/v1/campaigns/preview", "POST", {
          audience_filter: { com_alguma_tag: [TAG], limite: 100 },
          meta_template_id: modeloId,
          template_variables: campanhaOficial().template_variables,
        }),
      ),
    );
    expect(previa.data.motivos.variavel_ausente).toBe(1);
    expect(previa.data.elegiveis).toBe(2);
  });

  it("o envio de teste manda o modelo com os valores do contato escolhido", async () => {
    const [teste] = await semearContatos("teste-de-envio", ["Wagner Teixeira"]);
    const criada = await criarCampanha(campanhaOficial({ audience_filter: { com_alguma_tag: ["ninguem"], limite: 1 } }));
    const id = (await json<{ id: string }>(criada)).data.id;

    const res = await acao(id, "testar", { contact_id: teste!.id });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    const [envio] = enviosPara(teste!.tel);
    expect(envio?.corpo).toMatchObject({ type: "template", template: { name: MODELO } });
    expect(parametrosDoCorpo(envio!.corpo)).toEqual(["Wagner", "outubro"]);
  });
});

describe("11 · worker que cai no meio do lote, e o ack que chega antes do vínculo", () => {
  it("destinatário reservado e nunca enviado volta à fila depois de 10 min — sem mandar em dobro", async () => {
    const [q] = await semearContatos("queda", ["Xavier Lopes"]);
    const id = await campanhaRodando({ audience_filter: { com_alguma_tag: ["queda"], limite: 100 } });
    const queda = emMinutos(70);
    // O worker reservou o lote e morreu antes de criar a mensagem.
    const { error } = await (quem.db as ReturnType<typeof pgComoSupabase>).rpc("fn_campanha_reservar_lote", {
      p_campaign_id: id,
      p_limite: 10,
      p_agora: queda.toISOString(),
    });
    expect(error).toBeNull();
    expect((await destinatarioDe(id, q!.id)).status).toBe("sending");

    await rodada(new Date(queda.getTime() + 5 * 60_000));
    expect(enviosPara(q!.tel)).toHaveLength(0); // ainda pode ser o worker vivo

    await rodada(new Date(queda.getTime() + 11 * 60_000));
    expect(enviosPara(q!.tel)).toHaveLength(1);
    expect((await destinatarioDe(id, q!.id)).status).toBe("sent");
  });

  it("travado cuja mensagem SAIU passa a enviado, e a Meta não recebe outra", async () => {
    const [r] = await semearContatos("queda-depois", ["Yara Campos"]);
    const id = await campanhaRodando({ audience_filter: { com_alguma_tag: ["queda-depois"], limite: 100 } });
    const envio = emMinutos(90);
    await rodada(envio);
    expect(enviosPara(r!.tel)).toHaveLength(1);
    // O worker caiu DEPOIS da Meta aceitar e ANTES de ligar o destinatário.
    await pool.query(
      `update campaign_recipients set status = 'sending', message_id = null, sent_at = null where id = $1`,
      [(await destinatarioDe(id, r!.id)).id],
    );

    await rodada(new Date(envio.getTime() + 11 * 60_000));
    expect(enviosPara(r!.tel)).toHaveLength(1);
    expect((await destinatarioDe(id, r!.id)).status).toBe("sent");
  });

  it("entregue que chega antes de o worker ligar a mensagem não se perde", async () => {
    const [c] = await semearContatos("corrida", ["Zeca Brito"]);
    const id = await campanhaRodando({ audience_filter: { com_alguma_tag: ["corrida"], limite: 100 } });
    await rodada(emMinutos(100));
    const destinatario = await destinatarioDe(id, c!.id);
    // A janela da corrida: a Meta já aceitou, o worker ainda não gravou o vínculo.
    await pool.query(
      `update campaign_recipients set status = 'sending', message_id = null, sent_at = null where id = $1`,
      [destinatario.id],
    );

    await postarStatus(c!.tel, "delivered");
    expect((await destinatarioDe(id, c!.id)).status).toBe("delivered");
  });
});

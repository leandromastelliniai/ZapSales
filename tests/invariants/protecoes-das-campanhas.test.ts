/**
 * AS PROTEÇÕES E OS MODOS DE ENVIO DAS CAMPANHAS, NA FRONTEIRA COM A META (issue #9).
 *
 * Mesma seam da campanha oficial (`campanha-oficial-ponta-a-ponta.test.ts`):
 *
 * - **saída**: o falso Graph (`tests/support/falso-graph.ts`) grava cada envio e
 *   responde a leitura da qualidade do número;
 * - **entrada**: webhooks assinados (qualidade do número, status e categoria do
 *   modelo) postados na ROTA REAL; a mensagem do contato no número de QR code
 *   entra pela ingestão real (`dispatchWahaEvent`);
 * - o sistema é dirigido pela API do app e pelos PASSOS DO WORKER
 *   (`rodarUmaRodadaOficial(db, agora)`).
 *
 * Critérios de aceite, na ordem da issue:
 *  1. duas campanhas em números diferentes do mesmo portfólio, somadas, nunca
 *     passam do limite do portfólio;
 *  2. webhook de qualidade vermelha pausa as campanhas ativas do número, com motivo;
 *  3. webhook de modelo rejeitado, pausado, desativado ou recategorizado pausa as
 *     campanhas que o usam, com motivo;
 *  4. sem aceitar o aviso, campanha por número de QR code não inicia; o aceite
 *     fica registrado;
 *  5. no modo "dois números", quem clica e escreve no número de QR code aparece
 *     no mesmo contato da campanha.
 *
 * E as três lacunas que a revisão achou (bloco 6): número conectado antes da
 * coluna do portfólio, campanha de QR code agendada antes do aceite existir, e a
 * recategorização que chega pela sincronização em vez do webhook.
 *
 * ─── O relógio ──────────────────────────────────────────────────────────────
 *
 * A conta do limite compara `messages.created_at` (relógio do BANCO) com o
 * `agora` da rodada. Por isso as campanhas deste arquivo têm janela 0–24 e as
 * rodadas usam o relógio real: "o que saiu agora conta agora". Avançar 25 h no
 * relógio da rodada é o que o dia seguinte é para a conta — o que saiu fica
 * fora das 24 h móveis.
 */
import pg from "pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { pgComoSupabase } from "../pg-como-supabase";
import { subirFalsoGraph, type FalsoGraph } from "../support/falso-graph";
import { eventoDeModelo, postarWebhookMeta } from "../support/webhook-meta-assinado";

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

const ORG_A = "0d0e0009-0000-4000-8000-00000000000a";
const ORG_B = "0d0e0009-0000-4000-8000-00000000000b";
const USER_A = "0d0e0009-0000-4000-8000-0000000000a1";
const USER_B = "0d0e0009-0000-4000-8000-0000000000b1";

/** O número oficial da organização A — conectado pela API, como o operador conecta. */
const NUMERO_A = "1109900000000001";
const WABA_A = "2409900000000001";
/** O número oficial da organização B: OUTRA conta (WABA) do MESMO portfólio. */
const NUMERO_B = "1109900000000002";
const WABA_B = "2409900000000002";
const PORTFOLIO = "portfolio-compartilhado-9";
const TELEFONE_A = "+55 31 90000-0000";

const TOKEN_DA_META = "EAAG-token-de-teste-das-protecoes";
const APP_SECRET = "segredo-do-app-das-protecoes";

/** O número de QR code da organização A (atendimento do modo dois números). */
const TELEFONE_DO_QR = "+5531977770000";

const MODELO = "oferta_protegida";
const TEXTO_DO_MODELO = "Oi {{1}}, temos uma oferta para você.";

let falso: FalsoGraph;
let tokenDoWebhookA = "";
let numeroA = "";
let numeroB = "";
let numeroQr = "";
const modelos: Record<string, string> = {};

const T = () => new Date();
const daqui = (horas: number) => new Date(Date.now() + horas * 60 * 60_000);

function como(org: string, user: string) {
  quem.org = org;
  quem.user = user;
}

async function json<T = unknown>(res: Response): Promise<{ data: T; error?: { code: string; message: string } }> {
  return (await res.json()) as { data: T; error?: { code: string; message: string } };
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

async function lerCampanha(id: string) {
  const { GET } = await import("@/app/api/v1/campaigns/[id]/route");
  const res = await GET(pedido(`http://localhost/api/v1/campaigns/${id}`, "GET"), { params: Promise.resolve({ id }) });
  return (
    await json<{
      status: string;
      pausa_motivo: string | null;
      pausa_detalhe: string | null;
      risco_de_banimento_aceito_em: string | null;
      risco_de_banimento_aceito_por: string | null;
      portfolio: { alcancados: number; teto: number | null; limite: string | null } | null;
    }>(res)
  ).data;
}

async function rodada(agora: Date) {
  const { rodarUmaRodadaOficial } = await import("@/lib/campanhas/rodada-oficial");
  return rodarUmaRodadaOficial(quem.db as never, agora);
}

/** Contatos com uma etiqueta só deles, gerados no banco (o cenário do limite precisa de dezenas). */
async function semear(org: string, tag: string, quantos: number, prefixo: string): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into contacts (organization_id, name, phone_number, tags, source)
     select $1, 'Pessoa ' || g, $3 || lpad(g::text, 4, '0'), array[$2], 'manual'
       from generate_series(1, $4) g
     returning id`,
    [org, tag, prefixo, quantos],
  );
  return rows.map((r) => r.id);
}

async function modelo(org: string, waba: string, nome: string, components: unknown[], categoria = "MARKETING") {
  const { rows } = await pool.query<{ id: string }>(
    `insert into meta_templates (organization_id, waba_id, name, language, status, category, components, contract_hash)
     values ($1, $2, $3, 'pt_BR', 'APPROVED', $4, $5::jsonb, 'hash-' || $3) returning id`,
    [org, waba, nome, categoria, JSON.stringify(components)],
  );
  return rows[0]!.id;
}

/** Cria, prepara e inicia: devolve o id. */
async function campanhaRodando(corpo: Record<string, unknown>): Promise<string> {
  const criada = await criarCampanha(corpo);
  const c = await json<{ id: string }>(criada);
  expect(criada.status, JSON.stringify(c)).toBe(201);
  const preparada = await acao(c.data.id, "preparar");
  expect(preparada.status, JSON.stringify(await preparada.clone().json())).toBe(200);
  const iniciada = await acao(c.data.id, "iniciar");
  expect(iniciada.status, JSON.stringify(await iniciada.clone().json())).toBe(200);
  return c.data.id;
}

function campanhaOficial(sessao: string, modeloId: string, tag: string, extra: Record<string, unknown> = {}) {
  return {
    name: `Campanha ${tag}`,
    channel_session_id: sessao,
    meta_template_id: modeloId,
    template_variables: { "1": { tipo: "contato", campo: "primeiro_nome" } },
    base_legal: "consent",
    audience_filter: { com_alguma_tag: [tag], limite: 500 },
    // Janela o dia todo: as rodadas usam o relógio real (ver o cabeçalho).
    janela_inicio_hora: 0,
    janela_fim_hora: 24,
    ...extra,
  };
}

async function abrirCanal(sessao: string) {
  const { PATCH } = await import("@/app/api/v1/channel-sessions/[id]/ai-access/route");
  const r = await PATCH(
    pedido(`http://localhost/api/v1/channel-sessions/${sessao}/ai-access`, "PATCH", { mode: "open", test_phone_numbers: [] }),
    { params: Promise.resolve({ id: sessao }) },
  );
  expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
}

/** A trilha de auditoria é fire-and-forget: espera a linha aparecer. */
async function auditoria(acaoAuditada: string, recurso: string): Promise<number> {
  let n = 0;
  await vi.waitFor(
    async () => {
      const { rows } = await pool.query<{ n: number }>(
        `select count(*)::int as n from api_audit_log where action = $1 and resource_id = $2`,
        [acaoAuditada, recurso],
      );
      n = rows[0]!.n;
      expect(n).toBeGreaterThan(0);
    },
    { timeout: 5_000 },
  );
  return n;
}

beforeAll(async () => {
  quem.db = pgComoSupabase(pool);

  for (const [org, user, slug] of [
    [ORG_A, USER_A, "protecoes-a"],
    [ORG_B, USER_B, "protecoes-b"],
  ] as const) {
    await pool.query(
      `insert into organizations (id, slug, legal_name, display_name) values ($1, $2, $3, $4) on conflict (id) do nothing`,
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
     values ('integrations_oauth_key', 'chave-de-teste-das-protecoes-nao-e-segredo')
     on conflict (name) do nothing`,
  );

  falso = await subirFalsoGraph({
    phoneNumberId: NUMERO_A,
    wabaId: WABA_A,
    numeroExibido: TELEFONE_A,
    portfolioId: PORTFOLIO,
    numerosExtras: [NUMERO_B],
  });
  vi.stubEnv("META_GRAPH_BASE_URL", falso.base);
  vi.stubEnv("META_GRAPH_VERSION", "");
  vi.stubEnv("META_APP_SECRET", APP_SECRET);
  vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verifica-de-teste");
  vi.stubEnv("META_PHONE_NUMBER_ID", "");
  vi.stubEnv("META_SYSTEM_USER_TOKEN", "");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://painel.teste.local");

  // ─── A: o número oficial, conectado pela API ───
  como(ORG_A, USER_A);
  const { POST, GET } = await import("@/app/api/v1/channels/official/route");
  const conectou = await POST(
    pedido("http://localhost/api/v1/channels/official", "POST", {
      phone_number_id: NUMERO_A,
      waba_id: WABA_A,
      token: TOKEN_DA_META,
    }),
  );
  expect(conectou.status, JSON.stringify(await conectou.clone().json())).toBe(200);
  const estado = (
    await json<{ channel_session_id: string; webhook: { callbackUrl: string } }>(
      await GET(pedido("http://localhost/api/v1/channels/official", "GET")),
    )
  ).data;
  numeroA = estado.channel_session_id;
  tokenDoWebhookA = String(estado.webhook.callbackUrl).split("/").pop()!;
  await pool.query(`update channel_sessions set status = 'WORKING' where id = $1`, [numeroA]);
  await abrirCanal(numeroA);

  // ─── B: outra organização, outra WABA, o MESMO portfólio ───
  // Uma organização tem um número oficial; o par do mesmo portfólio nasce assim.
  // A linha copia a credencial cifrada de A (o falso Graph não distingue token).
  const { rows: b } = await pool.query<{ id: string }>(
    `insert into channel_sessions
       (organization_id, provider, meta_phone_number_id, meta_waba_id, meta_token_encrypted,
        webhook_secret_encrypted, phone_number, display_name, status, meta_portfolio_id)
     select $1, provider, $2, $3, meta_token_encrypted, decode('00', 'hex'),
            '+5531900000002', 'Loja B', 'WORKING', $4
       from channel_sessions where id = $5
     returning id`,
    [ORG_B, NUMERO_B, WABA_B, PORTFOLIO, numeroA],
  );
  numeroB = b[0]!.id;
  como(ORG_B, USER_B);
  await abrirCanal(numeroB);

  // ─── A: o número de QR code (atendimento do modo dois números) ───
  const { rows: q } = await pool.query<{ id: string }>(
    `insert into channel_sessions (organization_id, waha_session_name, webhook_secret_encrypted, status, phone_number, display_name)
     values ($1, 'qr-das-protecoes', decode('00','hex'), 'WORKING', $2, 'Atendimento') returning id`,
    [ORG_A, TELEFONE_DO_QR],
  );
  numeroQr = q[0]!.id;

  const corpo = { type: "BODY", text: TEXTO_DO_MODELO };
  modelos.a = await modelo(ORG_A, WABA_A, MODELO, [corpo]);
  modelos.b = await modelo(ORG_B, WABA_B, MODELO, [corpo]);
  for (const nome of ["rejeitado", "pausado", "desativado", "recategorizado"]) {
    modelos[nome] = await modelo(ORG_A, WABA_A, `modelo_${nome}`, [corpo], nome === "recategorizado" ? "UTILITY" : "MARKETING");
  }
  modelos.waMe = await modelo(ORG_A, WABA_A, "oferta_com_atendimento", [
    corpo,
    { type: "BUTTONS", buttons: [{ type: "URL", text: "Falar com a gente", url: "https://wa.me/{{1}}" }] },
  ]);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await falso?.fechar();
  await pool.end();
});

describe("0 · a conexão guarda o portfólio da WABA", () => {
  it("o número conectado pela API sabe de qual portfólio é (owner_business_info)", async () => {
    const { rows } = await pool.query<{ meta_portfolio_id: string | null }>(
      `select meta_portfolio_id from channel_sessions where id = $1`,
      [numeroA],
    );
    expect(rows[0]!.meta_portfolio_id).toBe(PORTFOLIO);
  });
});

describe("1 · o limite do portfólio é um só para os números dele", () => {
  let campanhaA = "";
  let campanhaB = "";

  it("duas campanhas em números de organizações diferentes do mesmo portfólio, somadas, não passam do limite", async () => {
    // O portfólio está na faixa de 50 contatos por dia; cada campanha tem 40.
    await pool.query(`update channel_sessions set meta_limite_de_mensagens = 'TIER_50' where id = any($1)`, [
      [numeroA, numeroB],
    ]);
    como(ORG_A, USER_A);
    await semear(ORG_A, "portfolio", 40, "+55319811");
    campanhaA = await campanhaRodando(campanhaOficial(numeroA, modelos.a!, "portfolio"));
    como(ORG_B, USER_B);
    await semear(ORG_B, "portfolio", 40, "+55319822");
    campanhaB = await campanhaRodando(campanhaOficial(numeroB, modelos.b!, "portfolio"));

    falso.limpar();
    for (let i = 0; i < 4; i++) await rodada(T());

    const deA = falso.enviosDe(NUMERO_A).length;
    const deB = falso.enviosDe(NUMERO_B).length;
    expect(deA + deB, JSON.stringify({ deA, deB })).toBe(50);
    // A começou antes e levou o que cabia nela; B ficou com o resto do limite.
    expect(deA).toBe(40);
    expect(deB).toBe(10);
  });

  it("a tela da campanha mostra o limite do portfólio inteiro, não só o dela", async () => {
    como(ORG_B, USER_B);
    const b = await lerCampanha(campanhaB);
    expect(b.status).toBe("running");
    expect(b.portfolio).toEqual({ alcancados: 50, teto: 50, limite: "TIER_50" });
  });

  it("a reserva dentro do limite é uma operação só: chamadas simultâneas não somam mais que o teto", async () => {
    // Duas reservas ao mesmo tempo, em conexões separadas, para o MESMO portfólio
    // já cheio: nenhuma pode levar ninguém.
    const outra = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`, max: 2 });
    try {
      const reservar = (campanha: string) =>
        outra.query<{ id: string }>(
          `select * from public.fn_campanha_reservar_lote_no_portfolio($1, 50, now(), $2::uuid[], 50)`,
          [campanha, [numeroA, numeroB]],
        );
      const [r1, r2] = await Promise.all([reservar(campanhaA), reservar(campanhaB)]);
      expect(r1.rows.length + r2.rows.length).toBe(0);
    } finally {
      await outra.end();
    }
  });

  it("passadas as 24 h móveis, o resto sai sozinho", async () => {
    falso.limpar();
    await rodada(daqui(25));
    expect(falso.enviosDe(NUMERO_B)).toHaveLength(30);
  });
});

describe("2 · modelo rejeitado, pausado, desativado ou recategorizado pausa as campanhas que o usam", () => {
  const campanhas: Record<string, string> = {};

  it("cada evento do webhook pausa a campanha do seu modelo, com o motivo — e só ela", async () => {
    como(ORG_A, USER_A);
    // Um contato por campanha: o mesmo contato em cinco campanhas seguidas fica
    // fora das seguintes pela régua de elegibilidade, e não é isso que se mede.
    const prefixos: Record<string, string> = {
      rejeitado: "+55319831",
      pausado: "+55319832",
      desativado: "+55319833",
      recategorizado: "+55319834",
      controle: "+55319835",
    };
    for (const nome of ["rejeitado", "pausado", "desativado", "recategorizado", "controle"]) {
      await semear(ORG_A, `modelo-${nome}`, 1, prefixos[nome]!);
      const modeloId = nome === "controle" ? modelos.a! : modelos[nome]!;
      campanhas[nome] = await campanhaRodando({ ...campanhaOficial(numeroA, modeloId, `modelo-${nome}`), name: nome });
    }

    const status = (nome: string, event: string, reason: string | null) =>
      eventoDeModelo(WABA_A, "message_template_status_update", {
        event,
        message_template_name: `modelo_${nome}`,
        message_template_language: "pt_BR",
        reason,
      });
    const entregas = [
      status("rejeitado", "REJECTED", "INVALID_FORMAT"),
      status("pausado", "PAUSED", null),
      status("desativado", "DISABLED", null),
      eventoDeModelo(WABA_A, "template_category_update", {
        message_template_name: "modelo_recategorizado",
        message_template_language: "pt_BR",
        previous_category: "UTILITY",
        new_category: "MARKETING",
      }),
    ];
    for (const corpo of entregas) {
      const r = await postarWebhookMeta({ token: tokenDoWebhookA, appSecret: APP_SECRET, corpo });
      expect(r.status).toBe(200);
    }

    const esperado: Record<string, string> = {
      rejeitado: "modelo_rejeitado",
      pausado: "modelo_pausado",
      desativado: "modelo_desativado",
      recategorizado: "modelo_recategorizado",
    };
    for (const [nome, motivo] of Object.entries(esperado)) {
      const c = await lerCampanha(campanhas[nome]!);
      expect(c.status, nome).toBe("paused");
      expect(c.pausa_motivo, nome).toBe(motivo);
      expect(c.pausa_detalhe, nome).toContain(`modelo_${nome}`);
    }
    expect((await lerCampanha(campanhas.rejeitado!)).pausa_detalhe).toContain("INVALID_FORMAT");
    expect((await lerCampanha(campanhas.recategorizado!)).pausa_detalhe).toMatch(/utilidade para marketing/);
    expect((await lerCampanha(campanhas.controle!)).status).toBe("running");
    await auditoria("campaign.auto_paused", campanhas.pausado!);
  });

  it("a mesma entrega de novo não repete efeito", async () => {
    const { rows: antes } = await pool.query<{ n: number }>(
      `select count(*)::int as n from api_audit_log where action = 'campaign.auto_paused'`,
    );
    const r = await postarWebhookMeta({
      token: tokenDoWebhookA,
      appSecret: APP_SECRET,
      corpo: eventoDeModelo(WABA_A, "message_template_status_update", {
        event: "PAUSED",
        message_template_name: "modelo_pausado",
        message_template_language: "pt_BR",
      }),
    });
    expect(r.status).toBe(200);
    await new Promise((ok) => setTimeout(ok, 300));
    const { rows: depois } = await pool.query<{ n: number }>(
      `select count(*)::int as n from api_audit_log where action = 'campaign.auto_paused'`,
    );
    expect(depois[0]!.n).toBe(antes[0]!.n);
  });

  it("retomar com o modelo ainda rejeitado é recusado; a recategorizada o operador retoma, e o motivo sai", async () => {
    const recusada = await acao(campanhas.rejeitado!, "retomar");
    expect(recusada.status).toBe(422);

    const retomada = await acao(campanhas.recategorizado!, "retomar");
    expect(retomada.status, JSON.stringify(await retomada.clone().json())).toBe(200);
    const c = await lerCampanha(campanhas.recategorizado!);
    expect(c.status).toBe("running");
    expect(c.pausa_motivo).toBeNull();
    expect(c.pausa_detalhe).toBeNull();
  });

  it("modelo que mudou sem webhook (sincronização) pausa na rodada, com o motivo", async () => {
    await pool.query(`update meta_templates set status = 'PAUSED' where id = $1`, [modelos.recategorizado]);
    await rodada(T());
    const c = await lerCampanha(campanhas.recategorizado!);
    expect(c.status).toBe("paused");
    expect(c.pausa_motivo).toBe("modelo_pausado");
  });
});

describe("3 · qualidade vermelha do número pausa as campanhas dele", () => {
  let campanha = "";

  it("o webhook de qualidade vermelha pausa as campanhas ativas do número, com o motivo", async () => {
    como(ORG_A, USER_A);
    await semear(ORG_A, "qualidade", 1, "+55319844");
    campanha = await campanhaRodando(campanhaOficial(numeroA, modelos.a!, "qualidade"));

    // O evento não traz a qualidade: o sistema pergunta à Graph, que diz vermelha.
    falso.programar(
      { metodo: "GET", terminaCom: `/${NUMERO_A}` },
      { status: 200, corpo: { quality_rating: "RED", whatsapp_business_manager_messaging_limit: "TIER_50" } },
    );
    const r = await postarWebhookMeta({
      token: tokenDoWebhookA,
      appSecret: APP_SECRET,
      corpo: {
        object: "whatsapp_business_account",
        entry: [
          {
            id: WABA_A,
            changes: [
              {
                field: "phone_number_quality_update",
                value: { display_phone_number: TELEFONE_A.replace(/\D/g, ""), event: "FLAGGED" },
              },
            ],
          },
        ],
      },
    });
    expect(r.status).toBe(200);

    const c = await lerCampanha(campanha);
    expect(c.status).toBe("paused");
    expect(c.pausa_motivo).toBe("qualidade_vermelha");
    expect(c.pausa_detalhe).toContain("vermelha");
    // O número nomeado como o operador o reconhece: apelido + telefone.
    expect(c.pausa_detalhe).toContain("Loja de Teste +5531900000000");
    await auditoria("campaign.auto_paused", campanha);

    // A campanha de OUTRO portfólio/organização segue o seu caminho.
    const { rows } = await pool.query<{ status: string }>(
      `select status from campaigns where organization_id = $1 and status = 'paused' and pausa_motivo = 'qualidade_vermelha'`,
      [ORG_B],
    );
    expect(rows).toHaveLength(0);
  });

  it("retomar com o número ainda vermelho é recusado; voltando ao verde, retoma e o motivo sai", async () => {
    const recusada = await acao(campanha, "retomar");
    expect(recusada.status).toBe(409);
    expect((await json(recusada)).error?.message).toMatch(/vermelha/);

    await pool.query(`update channel_sessions set meta_qualidade = 'GREEN' where id = $1`, [numeroA]);
    const retomada = await acao(campanha, "retomar");
    expect(retomada.status, JSON.stringify(await retomada.clone().json())).toBe(200);
    const c = await lerCampanha(campanha);
    expect(c.status).toBe("running");
    expect(c.pausa_motivo).toBeNull();
  });

  it("qualidade vermelha lida sem webhook pausa na rodada", async () => {
    await pool.query(`update channel_sessions set meta_qualidade = 'RED' where id = $1`, [numeroA]);
    await rodada(daqui(26));
    const c = await lerCampanha(campanha);
    expect(c.status).toBe("paused");
    expect(c.pausa_motivo).toBe("qualidade_vermelha");
    await pool.query(`update channel_sessions set meta_qualidade = 'GREEN' where id = $1`, [numeroA]);
  });
});

describe("4 · campanha por número de QR code exige aceitar o risco de banimento", () => {
  let campanha = "";

  it("sem o aceite não inicia nem agenda", async () => {
    como(ORG_A, USER_A);
    await semear(ORG_A, "qr", 2, "+55319855");
    const criada = await criarCampanha({
      name: "Texto pelo QR code",
      channel_session_id: numeroQr,
      message_body: "Oi {{primeiro_nome}}, tudo bem?",
      base_legal: "consent",
      audience_filter: { com_alguma_tag: ["qr"], limite: 10 },
    });
    expect(criada.status, JSON.stringify(await criada.clone().json())).toBe(201);
    campanha = (await json<{ id: string }>(criada)).data.id;
    expect((await acao(campanha, "preparar")).status).toBe(200);

    const iniciar = await acao(campanha, "iniciar");
    expect(iniciar.status).toBe(422);
    expect((await json(iniciar)).error?.code).toBe("campanha_risco_nao_aceito");

    const agendar = await acao(campanha, "agendar", { scheduled_at: daqui(48).toISOString() });
    expect(agendar.status).toBe(422);
    expect((await json(agendar)).error?.code).toBe("campanha_risco_nao_aceito");
    expect((await lerCampanha(campanha)).status).toBe("ready");
  });

  it("o aceite fica registrado na campanha (quem e quando) e na auditoria, uma vez", async () => {
    const aceite = await acao(campanha, "aceitar-risco");
    expect(aceite.status, JSON.stringify(await aceite.clone().json())).toBe(200);
    const c = await lerCampanha(campanha);
    expect(c.risco_de_banimento_aceito_em).not.toBeNull();
    expect(c.risco_de_banimento_aceito_por).toBe(USER_A);
    expect(await auditoria("campaign.ban_risk_accepted", campanha)).toBe(1);

    expect((await acao(campanha, "aceitar-risco")).status).toBe(200);
    await new Promise((ok) => setTimeout(ok, 300));
    const { rows } = await pool.query<{ n: number }>(
      `select count(*)::int as n from api_audit_log where action = 'campaign.ban_risk_accepted' and resource_id = $1`,
      [campanha],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it("com o aceite, inicia", async () => {
    const iniciar = await acao(campanha, "iniciar");
    expect(iniciar.status, JSON.stringify(await iniciar.clone().json())).toBe(200);
  });

  it("a cópia da campanha não herda o aceite — é uma intenção nova", async () => {
    const copia = await acao(campanha, "duplicar");
    expect(copia.status).toBe(200);
    const id = (await json<{ id: string }>(copia)).data.id;
    expect((await lerCampanha(id)).risco_de_banimento_aceito_em).toBeNull();
  });

  it("campanha pela API Oficial não tem risco de banimento a aceitar", async () => {
    const { rows } = await pool.query<{ id: string }>(
      `select id from campaigns where organization_id = $1 and meta_template_id is not null limit 1`,
      [ORG_A],
    );
    expect((await acao(rows[0]!.id, "aceitar-risco")).status).toBe(409);
  });
});

describe("5 · modo dois números: o modelo sai pelo oficial, a conversa segue no número de QR code", () => {
  let campanha = "";
  let contato = "";
  const TELEFONE_DO_CONTATO = "+5531988889999";

  it("modelo sem botão wa.me não serve para o modo", async () => {
    como(ORG_A, USER_A);
    const r = await criarCampanha(
      campanhaOficial(numeroA, modelos.a!, "dois-numeros", { numero_de_atendimento_id: numeroQr }),
    );
    expect(r.status).toBe(422);
    expect((await json(r)).error?.message).toMatch(/wa\.me/);
  });

  it("o número de atendimento tem de ser de QR code", async () => {
    const r = await criarCampanha(
      campanhaOficial(numeroA, modelos.waMe!, "dois-numeros", { numero_de_atendimento_id: numeroA }),
    );
    expect(r.status).toBe(422);
  });

  it("o modelo sai pelo número oficial com o botão abrindo o número de QR code", async () => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into contacts (organization_id, name, phone_number, tags, source)
       values ($1, 'Rita Souza', $2, array['dois-numeros'], 'manual') returning id`,
      [ORG_A, TELEFONE_DO_CONTATO],
    );
    contato = rows[0]!.id;
    // Sem fonte para a variável do botão: ela é do sistema.
    campanha = await campanhaRodando(
      campanhaOficial(numeroA, modelos.waMe!, "dois-numeros", { numero_de_atendimento_id: numeroQr }),
    );

    falso.limpar();
    await rodada(daqui(27));
    const envio = falso.enviosDe(NUMERO_A).find((e) => e.corpo?.to === TELEFONE_DO_CONTATO.slice(1));
    expect(envio, JSON.stringify(falso.chamadas.map((c) => c.caminho))).toBeTruthy();
    const componentes = (envio!.corpo?.template as { components?: unknown[] }).components ?? [];
    expect(componentes).toContainEqual({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: TELEFONE_DO_QR.replace(/\D/g, "") }],
    });
  });

  it("quem clica e escreve no número de QR code cai no MESMO contato, e a resposta conta para a campanha", async () => {
    const { dispatchWahaEvent } = await import("@/lib/waha/ingest");
    const recebidoEm = daqui(27.1);
    await dispatchWahaEvent(
      quem.db as never,
      { id: numeroQr, organization_id: ORG_A } as never,
      {
        event: "message",
        payload: {
          id: "false_5531988889999@c.us_RESPOSTA9",
          from: "5531988889999@c.us",
          fromMe: false,
          body: "Oi! Vi a oferta, quero saber mais.",
          timestamp: Math.floor(Date.now() / 1000),
        },
      } as never,
      "req-dois-numeros",
    );

    const { rows } = await pool.query<{ contact_id: string; channel_session_id: string }>(
      `select contact_id, channel_session_id from messages
        where organization_id = $1 and direction = 'inbound' and channel_session_id = $2`,
      [ORG_A, numeroQr],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.contact_id).toBe(contato);
    const { rows: fichas } = await pool.query<{ n: number }>(
      `select count(*)::int as n from contacts where organization_id = $1 and phone_number = $2`,
      [ORG_A, TELEFONE_DO_CONTATO],
    );
    expect(fichas[0]!.n, "a resposta abriu uma ficha nova em vez de cair na da campanha").toBe(1);

    // A resposta é atribuída pelo CONTATO — o número por onde ela chegou não importa.
    const { aplicarRespostaNaCampanha } = await import("@/lib/campanhas/resposta");
    const r = await aplicarRespostaNaCampanha(quem.db as never, { organizationId: ORG_A, contactId: contato, recebidoEm });
    expect(r.atribuiu).toBe(true);
    const { rows: d } = await pool.query<{ status: string }>(
      `select status from campaign_recipients where campaign_id = $1 and contact_id = $2`,
      [campanha, contato],
    );
    expect(d[0]!.status).toBe("replied");
  });
});

describe("6 · o que chega por outro caminho", () => {
  it("número conectado antes da coluna do portfólio descobre o portfólio na Meta antes de contar o limite", async () => {
    await pool.query(`update channel_sessions set meta_portfolio_id = null where id = $1`, [numeroA]);
    const { rows: campanhas } = await pool.query<{ id: string }>(
      `select id from campaigns where organization_id = $1 and channel_session_id = $2 and meta_template_id is not null limit 1`,
      [ORG_A, numeroA],
    );
    como(ORG_A, USER_A);
    const c = await lerCampanha(campanhas[0]!.id);
    // O limite volta a ser o do portfólio inteiro (o número de B entra na conta).
    expect(c.portfolio?.teto).toBe(50);
    const { rows } = await pool.query<{ meta_portfolio_id: string | null }>(
      `select meta_portfolio_id from channel_sessions where id = $1`,
      [numeroA],
    );
    expect(rows[0]!.meta_portfolio_id).toBe(PORTFOLIO);
  });

  it("campanha de QR code agendada sem o aceite não sai sozinha: pausa com o motivo, e retomar pede o aceite", async () => {
    como(ORG_A, USER_A);
    await semear(ORG_A, "qr-agendada", 1, "+55319866");
    const criada = await criarCampanha({
      name: "Agendada antes do aceite existir",
      channel_session_id: numeroQr,
      message_body: "Oi {{primeiro_nome}}!",
      base_legal: "consent",
      audience_filter: { com_alguma_tag: ["qr-agendada"], limite: 10 },
    });
    const id = (await json<{ id: string }>(criada)).data.id;
    expect((await acao(id, "preparar")).status).toBe(200);
    // Agendada como era possível antes da regra: direto no banco, hora já vencida.
    await pool.query(`update campaigns set status = 'scheduled', scheduled_at = now() - interval '1 minute' where id = $1`, [
      id,
    ]);

    await rodada(T());
    const pausada = await lerCampanha(id);
    expect(pausada.status).toBe("paused");
    expect(pausada.pausa_motivo).toBe("risco_nao_aceito");

    const retomar = await acao(id, "retomar");
    expect(retomar.status).toBe(422);
    expect((await json(retomar)).error?.code).toBe("campanha_risco_nao_aceito");
    expect((await acao(id, "aceitar-risco")).status).toBe(200);
    expect((await acao(id, "retomar")).status).toBe(200);
    expect((await lerCampanha(id)).pausa_motivo).toBeNull();
  });

  it("a recategorização que chega pela SINCRONIZAÇÃO também pausa as campanhas do modelo", async () => {
    como(ORG_A, USER_A);
    const sincronizado = await modelo(ORG_A, WABA_A, "modelo_sincronizado", [{ type: "BODY", text: TEXTO_DO_MODELO }], "UTILITY");
    await semear(ORG_A, "sincronizado", 1, "+55319877");
    const campanha = await campanhaRodando(campanhaOficial(numeroA, sincronizado, "sincronizado"));

    falso.programar(
      { metodo: "GET", terminaCom: `/${WABA_A}/message_templates` },
      {
        status: 200,
        corpo: {
          data: [
            {
              id: "998877",
              name: "modelo_sincronizado",
              language: "pt_BR",
              status: "APPROVED",
              category: "MARKETING",
              components: [{ type: "BODY", text: TEXTO_DO_MODELO }],
            },
          ],
          paging: {},
        },
      },
    );
    const { syncTemplates } = await import("@/lib/channels/meta/template-sync");
    await syncTemplates({ organizationId: ORG_A, wabaId: WABA_A, token: TOKEN_DA_META, graphVersion: "v26.0" });

    const c = await lerCampanha(campanha);
    expect(c.status).toBe("paused");
    expect(c.pausa_motivo).toBe("modelo_recategorizado");
    expect(c.pausa_detalhe).toMatch(/utilidade para marketing/);
  });
});

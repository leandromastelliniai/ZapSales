/**
 * O CUSTO DA CAMPANHA OFICIAL, NA FRONTEIRA COM A META (issue #10).
 *
 * A mesma seam de `campanha-oficial-ponta-a-ponta.test.ts`:
 *
 * - **saída**: o falso Graph grava cada envio de modelo;
 * - **entrada**: webhook de status assinado, COM `pricing`, postado na rota real;
 * - o sistema é dirigido pela API do app (prévia, criar, preparar, iniciar,
 *   custo, contador das grátis), pela ação do painel da instalação e pelos
 *   passos do worker com relógio controlado.
 *
 * Critérios de aceite, na ordem da issue:
 *  1. a estimativa aparece antes do disparo e bate com a tabela para o público;
 *  2. ao atingir o teto da campanha ou da empresa, a campanha pausa com motivo;
 *  3. o custo real de cada mensagem é registrado a partir do webhook;
 *  4. o contador das 1.000 grátis avisa em 80% e 100% e zera no início do mês
 *     no fuso da conta (relógio controlado);
 *  5. o relatório mostra custo da Meta, de IA, por lead que respondeu e as
 *     conversas de anúncio grátis;
 *  6. alterar a tabela de preços muda as estimativas seguintes.
 * E o isolamento: a organização B não vê custo da A, nem pela API nem pela RLS.
 */
import pg from "pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { pgComoSupabase } from "../pg-como-supabase";
import { subirFalsoGraph, type FalsoGraph } from "../support/falso-graph";
import { postarWebhookMeta, statusDeEntrega } from "../support/webhook-meta-assinado";

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);

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
// O painel da instalação: a server action roda de verdade; só a identidade do
// administrador da instalação e os utilitários do Next são dublados.
vi.mock("@/lib/auth/escritaDeAdminOuRecusa", () => ({
  escritaDeAdminOuRecusa: async () => ({
    ok: true,
    ctx: { user: { id: quem.user }, platformAdmin: { user_id: quem.user, scope: "full", mfa_required: false } },
  }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

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

const ORG_A = "0d0e0010-0000-4000-8000-00000000000a";
const ORG_B = "0d0e0010-0000-4000-8000-00000000000b";
const USER_A = "0d0e0010-0000-4000-8000-0000000000a1";
const USER_B = "0d0e0010-0000-4000-8000-0000000000b1";

const NUMERO = "1108800000000010";
const WABA = "2408800000000010";
const APP_SECRET = "segredo-do-app-do-custo";
const ORIGEM = { wabaId: WABA, phoneNumberId: NUMERO };

/** Marketing no Brasil pela tabela inicial (R$ 0,3217). */
const MARKETING_BR = 32.17;

let falso: FalsoGraph;
let tokenDoWebhook = "";
let sessaoId = "";
let modeloId = "";

/** Amanhã, 12:00 em São Paulo: dentro da janela padrão do número. */
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

async function acao(id: string, nome: string, corpo?: unknown): Promise<Response> {
  const { POST } = await import("@/app/api/v1/campaigns/[id]/[acao]/route");
  return POST(pedido(`http://localhost/api/v1/campaigns/${id}/${nome}`, "POST", corpo), {
    params: Promise.resolve({ id, acao: nome }),
  });
}

async function rodada(agora: Date) {
  const { rodarUmaRodadaOficial } = await import("@/lib/campanhas/rodada-oficial");
  return rodarUmaRodadaOficial(quem.db as never, agora);
}

let sequencia = 0;
async function semearContatos(tag: string, quantos: number): Promise<Array<{ id: string; tel: string }>> {
  const criados: Array<{ id: string; tel: string }> = [];
  for (let i = 0; i < quantos; i += 1) {
    sequencia += 1;
    const tel = `+553197770${String(sequencia).padStart(4, "0")}`;
    const { rows } = await pool.query<{ id: string }>(
      `insert into contacts (organization_id, name, phone_number, tags, source)
       values ($1, $2, $3, array[$4], 'manual') returning id`,
      [ORG_A, `Pessoa ${sequencia}`, tel, tag],
    );
    criados.push({ id: rows[0]!.id, tel });
  }
  return criados;
}

function campanhaOficial(tag: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: `Custo ${tag}`,
    channel_session_id: sessaoId,
    meta_template_id: modeloId,
    template_variables: { "1": { tipo: "contato", campo: "primeiro_nome" } },
    base_legal: "consent",
    audience_filter: { com_alguma_tag: [tag], limite: 100 },
    ...extra,
  };
}

async function criarEPreparar(tag: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { POST } = await import("@/app/api/v1/campaigns/route");
  const criada = await POST(pedido("http://localhost/api/v1/campaigns", "POST", campanhaOficial(tag, extra)));
  const corpo = await json<{ id: string }>(criada);
  expect(criada.status, JSON.stringify(corpo)).toBe(201);
  const preparada = await acao(corpo.data.id, "preparar");
  expect(preparada.status, JSON.stringify(await preparada.clone().json())).toBe(200);
  return corpo.data.id;
}

async function iniciar(id: string): Promise<void> {
  const r = await acao(id, "iniciar");
  expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
}

interface Relatorio {
  estimativa: { mensagens: number; total_cents: number; sem_preco: number } | null;
  meta_cents: number;
  meta_estimado_cents: number;
  ia_cents: number;
  ia_usd_cents: number;
  cotacao_usd_brl: number;
  total_cents: number;
  responderam: number;
  custo_por_lead_que_respondeu_cents: number | null;
  conversas_de_anuncio: number;
}

async function custo(id: string): Promise<{ status: number; data: Relatorio }> {
  const { GET } = await import("@/app/api/v1/campaigns/[id]/cost/route");
  const res = await GET(pedido(`http://localhost/api/v1/campaigns/${id}/cost`, "GET"), {
    params: Promise.resolve({ id }),
  });
  return { status: res.status, data: (await json<Relatorio>(res)).data };
}

async function campanha(id: string): Promise<{ status: string; pausa_motivo: string | null; pausa_detalhe: string | null }> {
  const { GET } = await import("@/app/api/v1/campaigns/[id]/route");
  const res = await GET(pedido(`http://localhost/api/v1/campaigns/${id}`, "GET"), { params: Promise.resolve({ id }) });
  return (await json<{ status: string; pausa_motivo: string | null; pausa_detalhe: string | null }>(res)).data;
}

function wamidPara(tel: string): string {
  const ultimo = falso.envios().filter((e) => e.corpo?.to === tel.slice(1)).at(-1);
  const id = (ultimo?.resposta?.corpo as { messages?: Array<{ id: string }> } | undefined)?.messages?.[0]?.id;
  if (!id) throw new Error(`nenhum envio com sucesso para ${tel}`);
  return id;
}

async function postarStatus(wamid: string, tel: string, extra: Partial<Parameters<typeof statusDeEntrega>[1]>) {
  const res = await postarWebhookMeta({
    token: tokenDoWebhook,
    appSecret: APP_SECRET,
    corpo: statusDeEntrega(ORIGEM, { wamid, status: "sent", telefone: tel.replace(/\D/g, ""), ...extra }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { outcomes: string[] };
}

async function custoDaMensagem(wamid: string) {
  const { rows } = await pool.query(
    `select c.* from meta_message_costs c join messages m on m.id = c.message_id where m.external_id = $1`,
    [wamid],
  );
  return rows[0] as
    | { origem: string; billable: boolean; category: string; cost_cents: string | null; janela_gratis_de_anuncio: boolean }
    | undefined;
}

beforeAll(async () => {
  quem.db = pgComoSupabase(pool);

  for (const [org, user, slug] of [
    [ORG_A, USER_A, "custo-oficial-a"],
    [ORG_B, USER_B, "custo-oficial-b"],
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
     values ('integrations_oauth_key', 'chave-de-teste-do-custo-oficial-nao-e-segredo')
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

  como(ORG_A, USER_A);
  const { POST, GET } = await import("@/app/api/v1/channels/official/route");
  const conectou = await POST(
    pedido("http://localhost/api/v1/channels/official", "POST", {
      phone_number_id: NUMERO,
      waba_id: WABA,
      token: "EAAG-token-de-teste-do-custo",
    }),
  );
  expect(conectou.status, JSON.stringify(await conectou.clone().json())).toBe(200);
  const estado = (await json<{ channel_session_id: string; webhook: { callbackUrl: string } }>(
    await GET(pedido("http://localhost/api/v1/channels/official", "GET")),
  )).data;
  sessaoId = estado.channel_session_id;
  tokenDoWebhook = String(estado.webhook.callbackUrl).split("/").pop()!;
  await pool.query(`update channel_sessions set status = 'WORKING' where id = $1`, [sessaoId]);
  const { PATCH: abrir } = await import("@/app/api/v1/channel-sessions/[id]/ai-access/route");
  const aberto = await abrir(
    pedido(`http://localhost/api/v1/channel-sessions/${sessaoId}/ai-access`, "PATCH", {
      mode: "open",
      test_phone_numbers: [],
    }),
    { params: Promise.resolve({ id: sessaoId }) },
  );
  expect(aberto.status, JSON.stringify(await aberto.clone().json())).toBe(200);

  const { rows } = await pool.query<{ id: string }>(
    `insert into meta_templates (organization_id, waba_id, name, language, status, category, components, contract_hash)
     values ($1, $2, 'oferta_com_custo', 'pt_BR', 'APPROVED', 'MARKETING', $3::jsonb, 'hash-do-custo') returning id`,
    [ORG_A, WABA, JSON.stringify([{ type: "BODY", text: "Oi {{1}}, temos uma oferta." }])],
  );
  modeloId = rows[0]!.id;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await falso?.fechar();
  await pool.end();
});

describe("1 · a estimativa aparece antes do disparo e bate com a tabela", () => {
  it("a prévia do público estima 3 × R$ 0,3217 para três contatos do Brasil", async () => {
    como(ORG_A, USER_A);
    await semearContatos("estimativa", 3);
    const { POST } = await import("@/app/api/v1/campaigns/preview/route");
    const res = await POST(
      pedido("http://localhost/api/v1/campaigns/preview", "POST", {
        audience_filter: { com_alguma_tag: ["estimativa"], limite: 100 },
        meta_template_id: modeloId,
        template_variables: { "1": { tipo: "contato", campo: "primeiro_nome" } },
      }),
    );
    const corpo = await json<{ elegiveis: number; estimativa: { mensagens: number; total_cents: number } }>(res);
    expect(res.status, JSON.stringify(corpo)).toBe(200);
    expect(corpo.data.elegiveis).toBe(3);
    expect(corpo.data.estimativa.mensagens).toBe(3);
    expect(corpo.data.estimativa.total_cents).toBeCloseTo(3 * MARKETING_BR, 4);
  });

  it("a campanha preparada mostra a mesma estimativa no relatório de custo, antes de iniciar", async () => {
    const id = await criarEPreparar("estimativa");
    const r = await custo(id);
    expect(r.status).toBe(200);
    expect(r.data.estimativa).toMatchObject({ mensagens: 3, sem_preco: 0 });
    expect(r.data.estimativa!.total_cents).toBeCloseTo(3 * MARKETING_BR, 4);
    expect(r.data.meta_cents).toBe(0);
  });
});

describe("2 · teto atingido pausa a campanha com motivo", () => {
  it("teto da campanha: R$ 0,70 deixa sair 2 de 3, e a rodada seguinte pausa dizendo por quê", async () => {
    como(ORG_A, USER_A);
    falso.limpar();
    await semearContatos("teto-campanha", 3);
    const id = await criarEPreparar("teto-campanha", { teto_gasto_cents: 70 });
    await iniciar(id);

    const r1 = await rodada(emMinutos(0));
    expect(r1.enviadas, JSON.stringify(r1)).toBe(2);
    expect(falso.envios()).toHaveLength(2);

    await rodada(emMinutos(1));
    const c = await campanha(id);
    expect(c.status).toBe("paused");
    expect(c.pausa_motivo).toBe("teto_de_gasto");
    expect(c.pausa_detalhe).toContain("teto de gasto");
    expect(c.pausa_detalhe).toContain("R$ 0,70");
    // Nada além do teto saiu.
    expect(falso.envios()).toHaveLength(2);
  });

  it("subir o teto e retomar volta a enviar, e o motivo sai", async () => {
    const { rows } = await pool.query<{ id: string }>(
      `select id from campaigns where organization_id = $1 and name = 'Custo teto-campanha'`,
      [ORG_A],
    );
    const id = rows[0]!.id;
    const { PATCH } = await import("@/app/api/v1/campaigns/[id]/route");
    const mudou = await PATCH(pedido(`http://localhost/api/v1/campaigns/${id}`, "PATCH", { teto_gasto_cents: 200 }), {
      params: Promise.resolve({ id }),
    });
    expect(mudou.status, JSON.stringify(await mudou.clone().json())).toBe(200);
    const retomou = await acao(id, "retomar");
    expect(retomou.status, JSON.stringify(await retomou.clone().json())).toBe(200);
    expect((await campanha(id)).pausa_motivo).toBeNull();

    const r = await rodada(emMinutos(2));
    expect(r.enviadas).toBe(1);
  });

  it("teto mensal da empresa: com folga para uma mensagem, sai uma e a campanha pausa com o motivo da empresa", async () => {
    como(ORG_A, USER_A);
    falso.limpar();
    // O que a organização já comprometeu neste mês, contado como o teto conta.
    const { rows } = await pool.query<{ gasto: string }>(
      `select coalesce(sum(coalesce(cost_cents, $2)), 0) as gasto
         from meta_message_costs where organization_id = $1`,
      [ORG_A, MARKETING_BR],
    );
    const tetoMensal = Number(rows[0]!.gasto) + MARKETING_BR + 10;
    const { PATCH } = await import("@/app/api/v1/settings/campanhas/route");
    const salvou = await PATCH(
      pedido("http://localhost/api/v1/settings/campanhas", "PATCH", { atribuicao_horas: 72, teto_gasto_mensal_cents: tetoMensal }),
    );
    expect(salvou.status, JSON.stringify(await salvou.clone().json())).toBe(200);

    await semearContatos("teto-empresa", 3);
    const id = await criarEPreparar("teto-empresa");
    await iniciar(id);
    const r1 = await rodada(emMinutos(3));
    expect(r1.enviadas, JSON.stringify(r1)).toBe(1);
    await rodada(emMinutos(4));
    const c = await campanha(id);
    expect(c.status).toBe("paused");
    expect(c.pausa_motivo).toBe("teto_de_gasto");
    expect(c.pausa_detalhe).toContain("empresa atingiu o teto de gasto do mês");
    expect(falso.envios()).toHaveLength(1);

    // Tira o teto mensal para os cenários seguintes.
    await PATCH(pedido("http://localhost/api/v1/settings/campanhas", "PATCH", { atribuicao_horas: 72, teto_gasto_mensal_cents: null }));
  });

  it("a pausa automática fica auditada sem ator, com o motivo", async () => {
    // O audit é fire-and-forget: dá um instante para a escrita chegar.
    await new Promise((r) => setTimeout(r, 200));
    const { rows } = await pool.query(
      `select metadata from api_audit_log where organization_id = $1 and action = 'campaign.auto_paused'`,
      [ORG_A],
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]!.metadata).toMatchObject({ motivo: "teto_de_gasto" });
  });
});

describe("3 · o custo real de cada mensagem vem do webhook", () => {
  let tels: Array<{ id: string; tel: string }> = [];
  let campanhaId = "";

  it("no envio a rodada estima; o pricing do webhook torna o custo real", async () => {
    como(ORG_A, USER_A);
    falso.limpar();
    tels = await semearContatos("custo-real", 3);
    campanhaId = await criarEPreparar("custo-real");
    await iniciar(campanhaId);
    expect((await rodada(emMinutos(5))).enviadas).toBe(3);

    const [ana, bia, caio] = tels;
    const estimado = await custoDaMensagem(wamidPara(ana!.tel));
    expect(estimado).toMatchObject({ origem: "estimado", category: "marketing" });
    expect(Number(estimado!.cost_cents)).toBeCloseTo(MARKETING_BR, 4);

    // Marketing cobrado.
    const r = await postarStatus(wamidPara(ana!.tel), ana!.tel, { status: "delivered", categoria: "marketing" });
    expect(r.outcomes).toContain("custo:registrado");
    const real = await custoDaMensagem(wamidPara(ana!.tel));
    expect(real).toMatchObject({ origem: "webhook", billable: true });
    expect(Number(real!.cost_cents)).toBeCloseTo(MARKETING_BR, 4);

    // A Meta reentrega `read` com o mesmo pricing: nada muda.
    const de_novo = await postarStatus(wamidPara(ana!.tel), ana!.tel, { status: "read", categoria: "marketing" });
    expect(de_novo.outcomes).not.toContain("custo:registrado");

    // Não cobrável: a Meta decide, e o custo é zero apesar da tabela.
    await postarStatus(wamidPara(bia!.tel), bia!.tel, {
      status: "delivered",
      pricing: { billable: false, pricing_model: "PMP", type: "free_customer_service", category: "marketing" },
    });
    expect(Number((await custoDaMensagem(wamidPara(bia!.tel)))!.cost_cents)).toBe(0);

    // Veio de anúncio Click-to-WhatsApp: janela grátis, marcada.
    await postarStatus(wamidPara(caio!.tel), caio!.tel, {
      status: "delivered",
      pricing: { billable: false, pricing_model: "PMP", type: "free_entry_point", category: "marketing" },
    });
    expect(await custoDaMensagem(wamidPara(caio!.tel))).toMatchObject({ janela_gratis_de_anuncio: true, cost_cents: "0.0000" });
  });

  it("mensagem que falhou na entrega não custa: a estimativa vira zero", async () => {
    como(ORG_A, USER_A);
    falso.limpar();
    const [dani] = await semearContatos("custo-falha", 1);
    const id = await criarEPreparar("custo-falha");
    await iniciar(id);
    expect((await rodada(emMinutos(6))).enviadas).toBe(1);
    await postarStatus(wamidPara(dani!.tel), dani!.tel, {
      status: "failed",
      erro: { code: 131026, title: "Message undeliverable" },
      pricing: null,
    });
    expect(Number((await custoDaMensagem(wamidPara(dani!.tel)))!.cost_cents)).toBe(0);
  });

  describe("5 · o relatório da campanha", () => {
    it("soma Meta e IA, divide por quem respondeu e conta as conversas de anúncio", async () => {
      // A Ana respondeu, e o agente gastou US$ 0,10 (10 centavos de dólar) com ela
      // dentro da janela de atribuição.
      const [ana] = tels;
      await pool.query(
        `update campaign_recipients set replied_at = sent_at + interval '1 hour', status = 'replied'
          where campaign_id = $1 and contact_id = $2`,
        [campanhaId, ana!.id],
      );
      await pool.query(
        `insert into llm_calls (organization_id, contact_id, purpose, provider, model, cost_cents, created_at)
         select $1, $2, 'agent_turn', 'anthropic', 'claude-sonnet-4-6', 10, sent_at + interval '2 hours'
           from campaign_recipients where campaign_id = $3 and contact_id = $2`,
        [ORG_A, ana!.id, campanhaId],
      );
      // IA de outro contato, fora da campanha, não entra.
      await pool.query(
        `insert into llm_calls (organization_id, contact_id, purpose, provider, model, cost_cents)
         values ($1, null, 'agent_turn', 'anthropic', 'claude-sonnet-4-6', 999)`,
        [ORG_A],
      );

      const r = (await custo(campanhaId)).data;
      expect(r.meta_cents).toBeCloseTo(MARKETING_BR, 4);
      expect(r.meta_estimado_cents).toBe(0);
      expect(r.ia_usd_cents).toBeCloseTo(10, 4);
      expect(r.ia_cents).toBeCloseTo(10 * r.cotacao_usd_brl, 4);
      expect(r.total_cents).toBeCloseTo(MARKETING_BR + 10 * r.cotacao_usd_brl, 4);
      expect(r.responderam).toBe(1);
      expect(r.custo_por_lead_que_respondeu_cents).toBeCloseTo(r.total_cents, 4);
      expect(r.conversas_de_anuncio).toBe(1);
    });

    it("a organização B não vê o custo da campanha da A, nem pela API nem pela RLS", async () => {
      como(ORG_B, USER_B);
      expect((await custo(campanhaId)).status).toBe(404);
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("set local row_security = on");
        await client.query("set local role authenticated");
        await client.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: USER_B, role: "authenticated" }),
        ]);
        const { rows } = await client.query(`select count(*)::int as n from meta_message_costs`);
        expect(rows[0]!.n).toBe(0);
        // Controle: a A, pelo mesmo caminho, vê as dela — senão o zero acima
        // poderia ser só a RLS escondendo tudo de todo mundo.
        await client.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: USER_A, role: "authenticated" }),
        ]);
        const { rows: daA } = await client.query(`select count(*)::int as n from meta_message_costs`);
        expect(daA[0]!.n).toBeGreaterThan(0);
      } finally {
        await client.query("rollback").catch(() => undefined);
        client.release();
      }
      como(ORG_A, USER_A);
    });
  });
});

describe("4 · as 1.000 de atendimento grátis por número", () => {
  /** Uma mensagem de atendimento do número, com `wamid` próprio, pronta para o status. */
  async function mensagemDeAtendimento(n: number): Promise<{ wamid: string; tel: string }> {
    const [c] = await semearContatos(`atendimento-${n}`, 1);
    const { rows: conv } = await pool.query<{ id: string }>(
      `insert into conversations (organization_id, contact_id, channel_session_id)
       values ($1, $2, $3) returning id`,
      [ORG_A, c!.id, sessaoId],
    );
    const wamid = `wamid.ATENDIMENTO.${n}`;
    await pool.query(
      `insert into messages (organization_id, conversation_id, channel_session_id, contact_id, external_id, type, direction, status, body)
       values ($1, $2, $3, $4, $5, 'text', 'outbound', 'sent', 'Oi, posso ajudar?')`,
      [ORG_A, conv[0]!.id, sessaoId, c!.id, wamid],
    );
    return { wamid, tel: c!.tel };
  }

  async function semearAtendimentos(quantos: number, quando: string): Promise<void> {
    await pool.query(
      `insert into meta_message_costs (organization_id, channel_session_id, origem, billable, category, cost_cents, created_at)
       select $1, $2, 'webhook', false, 'service', 0, $3::timestamptz from generate_series(1, $4)`,
      [ORG_A, sessaoId, quando, quantos],
    );
  }

  async function avisos(): Promise<string[]> {
    const { rows } = await pool.query<{ title: string }>(
      `select title from agent_inbox_items where organization_id = $1 and kind = 'atendimento_gratis_do_numero'
        order by created_at`,
      [ORG_A],
    );
    return rows.map((r) => r.title);
  }

  it("a 800ª do mês abre o aviso de 80%, e a 1.000ª o de 100% — uma vez cada", async () => {
    como(ORG_A, USER_A);
    await semearAtendimentos(799, new Date().toISOString());

    const m800 = await mensagemDeAtendimento(800);
    await postarStatus(m800.wamid, m800.tel, {
      status: "delivered",
      pricing: { billable: false, pricing_model: "PMP", type: "free_customer_service", category: "service" },
    });
    expect(await avisos()).toHaveLength(1);
    expect((await avisos())[0]).toContain("80%");

    // A reentrega do mesmo status não conta de novo nem abre outro aviso.
    await postarStatus(m800.wamid, m800.tel, {
      status: "read",
      pricing: { billable: false, pricing_model: "PMP", type: "free_customer_service", category: "service" },
    });
    expect(await avisos()).toHaveLength(1);

    await semearAtendimentos(199, new Date().toISOString());
    const m1000 = await mensagemDeAtendimento(1000);
    await postarStatus(m1000.wamid, m1000.tel, {
      status: "delivered",
      pricing: { billable: false, pricing_model: "PMP", type: "free_customer_service", category: "service" },
    });
    const todos = await avisos();
    expect(todos).toHaveLength(2);
    expect(todos[1]).toContain("acabaram");

    // A 1.001ª é cobrada pela Meta, e custa o atendimento da tabela.
    const m1001 = await mensagemDeAtendimento(1001);
    await postarStatus(m1001.wamid, m1001.tel, { status: "delivered", categoria: "service" });
    expect(Number((await custoDaMensagem(m1001.wamid))!.cost_cents)).toBeCloseTo(3.5, 4);
    expect(await avisos()).toHaveLength(2);
  });

  it("a rota do contador mostra o número com o que já usou", async () => {
    const { GET } = await import("@/app/api/v1/campaigns/atendimento-gratis/route");
    const res = await GET(pedido("http://localhost/api/v1/campaigns/atendimento-gratis", "GET"));
    const corpo = await json<{ numeros: Array<{ channel_session_id: string; usadas: number; gratis: number }> }>(res);
    expect(res.status).toBe(200);
    expect(corpo.data.numeros.find((n) => n.channel_session_id === sessaoId)).toMatchObject({ usadas: 1001, gratis: 1000 });
  });

  it("zera à meia-noite do dia 1 no fuso da conta (relógio controlado)", async () => {
    const { contadorDoAtendimentoGratis } = await import("@/lib/custo/registro");
    await pool.query(
      `insert into channel_knobs (organization_id, channel_session_id, timezone)
       values ($1, $2, 'America/Sao_Paulo')
       on conflict (organization_id, channel_session_id) do update set timezone = excluded.timezone`,
      [ORG_A, sessaoId],
    );
    // 31/10 às 23h30 em São Paulo (02h30 de 01/11 em UTC): três de atendimento.
    await semearAtendimentos(3, "2030-11-01T02:30:00Z");
    const aindaOutubro = await contadorDoAtendimentoGratis(quem.db as never, ORG_A, sessaoId, new Date("2030-11-01T02:45:00Z"));
    expect(aindaOutubro.desde).toBe("2030-10-01T03:00:00.000Z");
    expect(aindaOutubro.usadas).toBe(3);

    const novembro = await contadorDoAtendimentoGratis(quem.db as never, ORG_A, sessaoId, new Date("2030-11-01T03:00:00Z"));
    expect(novembro.desde).toBe("2030-11-01T03:00:00.000Z");
    expect(novembro.usadas).toBe(0);
  });
});

describe("6 · alterar a tabela de preços muda as estimativas seguintes", () => {
  it("o painel da instalação grava o novo preço, e a próxima estimativa o usa", async () => {
    como(ORG_A, USER_A);
    const { updatePrecosDaMeta } = await import("@/app/actions/settings/updatePrecosDaMeta");
    const r = await updatePrecosDaMeta({
      linhas: [
        { country: "BR", dial_prefix: "55", category: "marketing", unit_price_cents: 40, currency: "BRL" },
        { country: "BR", dial_prefix: "55", category: "utility", unit_price_cents: 3.5, currency: "BRL" },
        { country: "BR", dial_prefix: "55", category: "authentication", unit_price_cents: 3.5, currency: "BRL" },
        { country: "BR", dial_prefix: "55", category: "service", unit_price_cents: 3.5, currency: "BRL" },
      ],
      cotacao_usd_brl: 5,
    });
    expect(r).toEqual({ ok: true });

    const { rows } = await pool.query<{ id: string }>(
      `select id from campaigns where organization_id = $1 and name = 'Custo estimativa'`,
      [ORG_A],
    );
    const depois = (await custo(rows[0]!.id)).data;
    expect(depois.estimativa!.total_cents).toBeCloseTo(3 * 40, 4);
    expect(depois.cotacao_usd_brl).toBe(5);

    // O custo JÁ registrado não muda: ele copiou o preço do momento.
    const { rows: real } = await pool.query<{ cost_cents: string }>(
      `select cost_cents from meta_message_costs where organization_id = $1 and origem = 'webhook' and category = 'marketing' and billable`,
      [ORG_A],
    );
    expect(real.length).toBeGreaterThan(0);
    for (const l of real) expect(Number(l.cost_cents)).toBeCloseTo(MARKETING_BR, 4);
  });
});

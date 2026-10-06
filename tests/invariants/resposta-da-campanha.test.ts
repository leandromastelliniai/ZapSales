/**
 * A RESPOSTA DA CAMPANHA CAI NO FUNIL E NO AGENTE (issue #11), na fronteira
 * com a Meta.
 *
 * Mesma seam de `campanha-oficial-ponta-a-ponta.test.ts`:
 *
 * - **saída**: o falso Graph grava o envio do modelo e devolve o `wamid`;
 * - **entrada**: a resposta chega como webhook ASSINADO, postado na ROTA REAL —
 *   texto digitado ou toque num botão de resposta rápida, com o `context.id`
 *   da mensagem do modelo, como a Cloud API entrega;
 * - o sistema é dirigido pela API do app e pelos passos do worker com relógio
 *   controlado.
 *
 * O banco é o de verdade (baseline aplicado). Dublê só da identidade de quem
 * chama.
 *
 * Critérios de aceite, na ordem da issue:
 *  1. a resposta cria o lead na etapa configurada; quem já é lead é movido, não duplicado;
 *  2. a origem da campanha aparece no lead e na conversa;
 *  3. "IA" acorda o agente da campanha; "humano" manda para a fila; "IA e depois
 *     humano" passa pela regra existente e cai na fila;
 *  4. cada botão mapeado executa a ação sem acordar modelo de linguagem; o de
 *     parar grava opt-out;
 *  5. o turno do agente recebe o contexto da campanha;
 *  6. o destinatário conta como "respondeu" nas métricas;
 *  7. (a janela de 24 h está em `tests/unit/gate-messaging-window.test.ts`,
 *     `tests/unit/fluxo-envia-modelo-aprovado.test.ts` e
 *     `agent-send-template-turn.test.ts`, com relógio controlado).
 */
import pg from "pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { pgComoSupabase } from "../pg-como-supabase";
import { subirFalsoGraph, type FalsoGraph } from "../support/falso-graph";
import {
  mensagemRecebida,
  postarWebhookMeta,
  toqueNoBotao,
} from "../support/webhook-meta-assinado";

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

const ORG = "0d0e0011-0000-4000-8000-00000000000a";
const USER = "0d0e0011-0000-4000-8000-0000000000a1";

const NUMERO = "1101100000000011";
const WABA = "2401100000000011";
const TOKEN_DA_META = "EAAG-token-de-teste-da-resposta-da-campanha";
const APP_SECRET = "segredo-do-app-da-resposta";
const ORIGEM = { wabaId: WABA, phoneNumberId: NUMERO };

const MODELO = "avaliacao_99";
const TEXTO_DO_MODELO = "Oi {{1}}, a avaliação sai por R$ 99 até sexta. Quer garantir a sua?";
const BOTOES = [
  "Quero saber mais",
  "Falar com atendente",
  "Já comprei",
  "Não tenho interesse",
  "Parar",
];
const OFERTA = "Avaliação odontológica por R$ 99, só até sexta-feira.";

/** O funil da campanha e um segundo funil, para o lead que mora em outro lugar. */
const FUNIL = "0d0e0011-0000-4000-8000-0000000f0001";
const ETAPA_NOVO = "0d0e0011-0000-4000-8000-0000000e0001";
const ETAPA_RESPONDEU = "0d0e0011-0000-4000-8000-0000000e0002";
const ETAPA_COMPROU = "0d0e0011-0000-4000-8000-0000000e0003";
const ETAPA_PERDIDO = "0d0e0011-0000-4000-8000-0000000e0004";
const OUTRO_FUNIL = "0d0e0011-0000-4000-8000-0000000f0002";
const OUTRA_ETAPA = "0d0e0011-0000-4000-8000-0000000e0011";
const OUTRA_PERDIDO = "0d0e0011-0000-4000-8000-0000000e0012";

/** O agente da campanha mora em OUTRO número: o oficial não tem agente publicado. */
const OUTRO_NUMERO = "0d0e0011-0000-4000-8000-0000000d0001";
const AGENTE = "0d0e0011-0000-4000-8000-0000000a0001";
const VERSAO = "0d0e0011-0000-4000-8000-0000000a0002";

let falso: FalsoGraph;
let tokenDoWebhook = "";
let sessaoId = "";
let modeloId = "";

const AMANHA = new Date(Date.now() + 24 * 60 * 60_000);
const T0 = new Date(
  Date.UTC(AMANHA.getUTCFullYear(), AMANHA.getUTCMonth(), AMANHA.getUTCDate(), 15),
);
function emMinutos(min: number): Date {
  return new Date(T0.getTime() + min * 60_000);
}

async function json<T = unknown>(res: Response): Promise<{ data: T } & Record<string, unknown>> {
  return (await res.json()) as { data: T } & Record<string, unknown>;
}

function pedido(url: string, metodo: string, corpo?: unknown): NextRequest {
  return new NextRequest(url, {
    method: metodo,
    ...(corpo === undefined
      ? {}
      : { body: JSON.stringify(corpo), headers: { "content-type": "application/json" } }),
  });
}

async function criarCampanha(corpo: Record<string, unknown>): Promise<Response> {
  const { POST } = await import("@/app/api/v1/campaigns/route");
  return POST(pedido("http://localhost/api/v1/campaigns", "POST", corpo));
}

async function acao(id: string, nome: string): Promise<Response> {
  const { POST } = await import("@/app/api/v1/campaigns/[id]/[acao]/route");
  return POST(pedido(`http://localhost/api/v1/campaigns/${id}/${nome}`, "POST"), {
    params: Promise.resolve({ id, acao: nome }),
  });
}

async function rodada(agora: Date) {
  const { rodarUmaRodadaOficial } = await import("@/lib/campanhas/rodada-oficial");
  return rodarUmaRodadaOficial(quem.db as never, agora);
}

let sequenciaDeTelefone = 0;
let minutoDaRodada = 0;

interface Pessoa {
  id: string;
  tel: string;
  nome: string;
}

async function semearContatos(tag: string, nomes: string[]): Promise<Pessoa[]> {
  const criados: Pessoa[] = [];
  for (const nome of nomes) {
    sequenciaDeTelefone += 1;
    const tel = `+553197711${String(sequenciaDeTelefone).padStart(4, "0")}`;
    const { rows } = await pool.query<{ id: string }>(
      `insert into contacts (organization_id, name, phone_number, tags, source)
       values ($1, $2, $3, array[$4], 'manual') returning id`,
      [ORG, nome, tel, tag],
    );
    criados.push({ id: rows[0]!.id, tel, nome });
  }
  return criados;
}

/**
 * Cria a campanha pela API com o destino declarado, prepara, inicia e roda até
 * todos os contatos da etiqueta terem recebido o modelo.
 */
async function campanhaEnviada(
  tag: string,
  nomes: string[],
  extra: Record<string, unknown> = {},
): Promise<{ id: string; pessoas: Pessoa[] }> {
  const pessoas = await semearContatos(tag, nomes);
  const criada = await criarCampanha({
    name: `Avaliação ${tag}`,
    channel_session_id: sessaoId,
    meta_template_id: modeloId,
    template_variables: { "1": { tipo: "contato", campo: "primeiro_nome" } },
    base_legal: "consent",
    audience_filter: { com_alguma_tag: [tag], limite: 100 },
    pipeline_id: FUNIL,
    stage_id: ETAPA_RESPONDEU,
    agent_id: AGENTE,
    oferta: OFERTA,
    ...extra,
  });
  const corpo = await json<{ id: string }>(criada);
  expect(criada.status, JSON.stringify(corpo)).toBe(201);
  const id = corpo.data.id;
  expect((await acao(id, "preparar")).status).toBe(200);
  expect((await acao(id, "iniciar")).status).toBe(200);
  for (let i = 0; i < 6; i += 1) {
    await rodada(emMinutos(minutoDaRodada));
    minutoDaRodada += 1;
    if (pessoas.every((p) => enviosPara(p.tel).length > 0)) break;
  }
  for (const p of pessoas)
    expect(enviosPara(p.tel).length, `modelo não saiu para ${p.nome}`).toBeGreaterThan(0);
  return { id, pessoas };
}

function enviosPara(tel: string) {
  return falso.envios().filter((e) => e.corpo?.to === tel.slice(1));
}

function wamidPara(tel: string): string {
  const corpo = enviosPara(tel).at(-1)?.resposta?.corpo as
    { messages?: Array<{ id: string }> } | undefined;
  const id = corpo?.messages?.[0]?.id;
  if (!id) throw new Error(`nenhum envio com sucesso para ${tel}`);
  return id;
}

let sequenciaDeResposta = 0;

/** A pessoa responde pelo WhatsApp: texto digitado (citando o modelo) ou toque num botão. */
async function responder(
  p: Pessoa,
  resposta: { texto: string } | { botao: string },
): Promise<string> {
  sequenciaDeResposta += 1;
  const wamid = `wamid.RESPOSTA.${sequenciaDeResposta}`;
  const quando = emMinutos(30 + sequenciaDeResposta);
  const corpo =
    "botao" in resposta
      ? toqueNoBotao(ORIGEM, {
          wamid,
          rotulo: resposta.botao,
          respondendoA: wamidPara(p.tel),
          telefone: p.tel.slice(1),
          nome: p.nome,
          quando,
        })
      : mensagemRecebida(ORIGEM, {
          wamid,
          texto: resposta.texto,
          telefone: p.tel.slice(1),
          nome: p.nome,
          quando,
        });
  const res = await postarWebhookMeta({ token: tokenDoWebhook, appSecret: APP_SECRET, corpo });
  expect(res.status).toBe(200);
  return wamid;
}

async function conversaDe(p: Pessoa): Promise<string> {
  const { rows } = await pool.query<{ conversation_id: string }>(
    `select conversation_id from campaign_recipients where organization_id = $1 and contact_id = $2
      order by sent_at desc limit 1`,
    [ORG, p.id],
  );
  return rows[0]!.conversation_id;
}

async function leadsAbertos(p: Pessoa) {
  const { rows } = await pool.query<{
    id: string;
    pipeline_id: string;
    stage_id: string;
    source: string;
    source_metadata: Record<string, unknown>;
  }>(
    `select id, pipeline_id, stage_id, source, source_metadata from crm_leads
      where organization_id = $1 and contact_id = $2 and status = 'open'`,
    [ORG, p.id],
  );
  return rows;
}

/** O agente foi acordado para esta resposta? (o evento que o dreno do agente consome) */
async function agenteAcordado(conversa: string): Promise<boolean> {
  const { rows } = await pool.query(
    `select 1 from event_log where organization_id = $1 and event_type = 'ai_agent.dispatch_requested'
       and payload->>'conversation_id' = $2`,
    [ORG, conversa],
  );
  return rows.length > 0;
}

/** Há pedido de fila PENDENTE para esta conversa? */
async function naFila(conversa: string): Promise<boolean> {
  const { rows } = await pool.query(
    `select 1 from event_log where organization_id = $1 and event_type = 'conversation.routing_requested'
       and entity_id = $2 and status = 'pending'`,
    [ORG, conversa],
  );
  return rows.length > 0;
}

/**
 * O rodízio da CONVERSA NOVA já rodou: a conversa nasce no envio do modelo, e
 * o banco pede rodízio para toda conversa que nasce. Fechar esse pedido aqui é
 * o que o worker de roteamento faria — e é o que separa "a campanha pediu a
 * fila" de "a conversa nasceu".
 */
async function rodizioDoNascimentoJaRodou(conversa: string): Promise<void> {
  await pool.query(
    `update event_log set status = 'done' where organization_id = $1
       and event_type = 'conversation.routing_requested' and entity_id = $2`,
    [ORG, conversa],
  );
}

beforeAll(async () => {
  quem.db = pgComoSupabase(pool);
  quem.org = ORG;
  quem.user = USER;

  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name) values ($1, 'resposta-da-campanha', 'Resposta LTDA', 'Resposta')
     on conflict (id) do nothing`,
    [ORG],
  );
  await pool.query(
    `insert into auth.users (id, email) values ($1, 'resposta@teste.local') on conflict (id) do nothing`,
    [USER],
  );
  await pool.query(
    `insert into user_organizations (organization_id, user_id, role, accepted_at)
     values ($1, $2, 'admin', now()) on conflict do nothing`,
    [ORG, USER],
  );
  await pool.query(
    `insert into private.app_secrets (name, value)
     values ('integrations_oauth_key', 'chave-de-teste-da-resposta-nao-e-segredo')
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

  const { POST, GET } = await import("@/app/api/v1/channels/official/route");
  const conectou = await POST(
    pedido("http://localhost/api/v1/channels/official", "POST", {
      phone_number_id: NUMERO,
      waba_id: WABA,
      token: TOKEN_DA_META,
    }),
  );
  expect(conectou.status, JSON.stringify(await conectou.clone().json())).toBe(200);
  const estado = (
    await json<{ channel_session_id: string; webhook: { callbackUrl: string } }>(
      await GET(pedido("http://localhost/api/v1/channels/official", "GET")),
    )
  ).data;
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
     values ($1, $2, $3, 'pt_BR', 'APPROVED', 'MARKETING', $4::jsonb, 'hash-da-resposta') returning id`,
    [
      ORG,
      WABA,
      MODELO,
      JSON.stringify([
        { type: "BODY", text: TEXTO_DO_MODELO },
        { type: "BUTTONS", buttons: BOTOES.map((text) => ({ type: "QUICK_REPLY", text })) },
      ]),
    ],
  );
  modeloId = rows[0]!.id;

  await pool.query(
    `insert into crm_pipelines (id, organization_id, name, slug) values ($1, $3, 'Campanha de avaliação', 'campanha-avaliacao'),
                                                                        ($2, $3, 'Pós-venda', 'pos-venda')`,
    [FUNIL, OUTRO_FUNIL, ORG],
  );
  await pool.query(
    `insert into crm_stages (id, organization_id, pipeline_id, name, slug, position, is_lost) values
       ($1, $9, $7, 'Novo', 'novo', 1, false),
       ($2, $9, $7, 'Respondeu', 'respondeu', 2, false),
       ($3, $9, $7, 'Comprou', 'comprou', 3, false),
       ($4, $9, $7, 'Perdido', 'perdido', 4, true),
       ($5, $9, $8, 'Acompanhamento', 'acompanhamento', 1, false),
       ($6, $9, $8, 'Perdido', 'perdido', 2, true)`,
    [
      ETAPA_NOVO,
      ETAPA_RESPONDEU,
      ETAPA_COMPROU,
      ETAPA_PERDIDO,
      OUTRA_ETAPA,
      OUTRA_PERDIDO,
      FUNIL,
      OUTRO_FUNIL,
      ORG,
    ],
  );

  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $2, 'resposta-outro-numero', 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
    [OUTRO_NUMERO, ORG],
  );
  await pool.query(
    `insert into ai_agents (id, organization_id, name, system_prompt)
     values ($1, $2, 'Agente da avaliação', 'você atende quem respondeu à campanha') on conflict (id) do nothing`,
    [AGENTE, ORG],
  );
  await pool.query(
    `insert into ai_agent_versions (id, organization_id, agent_id, version_number, system_prompt,
                                    provider, model, channel_session_id, status, published_at)
     values ($1, $2, $3, 1, 'você atende quem respondeu à campanha', 'anthropic', 'claude-sonnet-4-6', $4, 'published', now())
     on conflict (id) do nothing`,
    [VERSAO, ORG, AGENTE, OUTRO_NUMERO],
  );
  await pool.query(`update ai_agents set published_version_id = $1 where id = $2`, [
    VERSAO,
    AGENTE,
  ]);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await falso?.fechar();
  await pool.end();
});

describe("1 · a resposta cria o lead na etapa configurada; quem já é lead é movido, não duplicado", () => {
  it("contato novo: a resposta digitada cria o card na etapa da campanha, marcado com ela", async () => {
    const { id, pessoas } = await campanhaEnviada("resp-novo", ["Ana Souza"]);
    const [ana] = pessoas as [Pessoa];
    expect(await leadsAbertos(ana)).toHaveLength(0);

    await responder(ana, { texto: "quero sim" });

    const leads = await leadsAbertos(ana);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      pipeline_id: FUNIL,
      stage_id: ETAPA_RESPONDEU,
      source: "campanha",
      source_metadata: { campaign_id: id },
    });
  });

  it("contato que já é lead no funil: é MOVIDO para a etapa da campanha, e continua um negócio só", async () => {
    const [bia] = (await semearContatos("resp-existe", ["Bia Lopes"])) as [Pessoa];
    await pool.query(
      `insert into crm_leads (organization_id, pipeline_id, stage_id, contact_id, title) values ($1, $2, $3, $4, 'Negócio da Bia')`,
      [ORG, FUNIL, ETAPA_NOVO, bia.id],
    );
    const criada = await criarCampanha({
      name: "Avaliação para quem já é lead",
      channel_session_id: sessaoId,
      meta_template_id: modeloId,
      template_variables: { "1": { tipo: "contato", campo: "primeiro_nome" } },
      base_legal: "consent",
      audience_filter: { com_alguma_tag: ["resp-existe"], limite: 100 },
      pipeline_id: FUNIL,
      stage_id: ETAPA_RESPONDEU,
      agent_id: AGENTE,
    });
    const id = (await json<{ id: string }>(criada)).data.id;
    expect((await acao(id, "preparar")).status).toBe(200);
    expect((await acao(id, "iniciar")).status).toBe(200);
    await rodada(emMinutos(minutoDaRodada++));
    expect(enviosPara(bia.tel).length).toBeGreaterThan(0);
    const antes = await leadsAbertos(bia);
    expect(antes).toHaveLength(1);

    await responder(bia, { texto: "oi, me conta mais" });

    const depois = await leadsAbertos(bia);
    expect(depois).toHaveLength(1);
    expect(depois[0]!.id).toBe(antes[0]!.id);
    expect(depois[0]!.stage_id).toBe(ETAPA_RESPONDEU);

    // A origem da campanha fica na timeline do negócio que já existia.
    const { rows } = await pool.query<{ reason: string; payload: Record<string, unknown> }>(
      `select reason, payload from crm_lead_activities where organization_id = $1 and lead_id = $2 and type = 'campaign_replied'`,
      [ORG, antes[0]!.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload).toMatchObject({ campaign_id: id });
  });

  it("contato com negócio aberto em OUTRO funil: é levado para o funil da campanha, sem ficar com dois abertos", async () => {
    const [caio] = (await semearContatos("resp-outro-funil", ["Caio Prado"])) as [Pessoa];
    await pool.query(
      `insert into crm_leads (organization_id, pipeline_id, stage_id, contact_id, title) values ($1, $2, $3, $4, 'Pós-venda do Caio')`,
      [ORG, OUTRO_FUNIL, OUTRA_ETAPA, caio.id],
    );
    const criada = await criarCampanha({
      name: "Avaliação para quem está no pós-venda",
      channel_session_id: sessaoId,
      meta_template_id: modeloId,
      template_variables: { "1": { tipo: "contato", campo: "primeiro_nome" } },
      base_legal: "consent",
      audience_filter: { com_alguma_tag: ["resp-outro-funil"], limite: 100 },
      pipeline_id: FUNIL,
      stage_id: ETAPA_RESPONDEU,
      agent_id: AGENTE,
    });
    const id = (await json<{ id: string }>(criada)).data.id;
    expect((await acao(id, "preparar")).status).toBe(200);
    expect((await acao(id, "iniciar")).status).toBe(200);
    await rodada(emMinutos(minutoDaRodada++));

    await responder(caio, { texto: "tenho interesse" });

    const abertos = await leadsAbertos(caio);
    expect(abertos).toHaveLength(1);
    expect(abertos[0]).toMatchObject({ pipeline_id: FUNIL, stage_id: ETAPA_RESPONDEU });
  });
});

describe("2 · a origem da campanha aparece no lead e na conversa", () => {
  it("a conversa diz a campanha e o modelo de origem", async () => {
    const { id, pessoas } = await campanhaEnviada("resp-origem", ["Dora Reis"]);
    const [dora] = pessoas as [Pessoa];
    await responder(dora, { texto: "olá" });
    const conversa = await conversaDe(dora);

    const { GET } = await import("@/app/api/v1/conversations/[id]/campanha/route");
    const res = await GET(
      pedido(`http://localhost/api/v1/conversations/${conversa}/campanha`, "GET"),
      {
        params: Promise.resolve({ id: conversa }),
      },
    );
    expect(res.status).toBe(200);
    const corpo = (
      await json<{ campanha: { id: string; nome: string }; modelo: { nome: string } | null }>(res)
    ).data;
    expect(corpo.campanha).toEqual({ id, nome: "Avaliação resp-origem" });
    expect(corpo.modelo?.nome).toBe(MODELO);
  });

  it("conversa que não nasceu de campanha devolve null — a tela não desenha nada", async () => {
    const [eli] = (await semearContatos("resp-sem-campanha", ["Eli Matos"])) as [Pessoa];
    const res = await postarWebhookMeta({
      token: tokenDoWebhook,
      appSecret: APP_SECRET,
      corpo: mensagemRecebida(ORIGEM, {
        wamid: "wamid.SEM.CAMPANHA",
        texto: "oi",
        telefone: eli.tel.slice(1),
        nome: eli.nome,
      }),
    });
    expect(res.status).toBe(200);
    const { rows } = await pool.query<{ id: string }>(
      `select id from conversations where organization_id = $1 and contact_id = $2 limit 1`,
      [ORG, eli.id],
    );
    const conversa = rows[0]!.id;
    const { GET } = await import("@/app/api/v1/conversations/[id]/campanha/route");
    const resposta = await GET(
      pedido(`http://localhost/api/v1/conversations/${conversa}/campanha`, "GET"),
      {
        params: Promise.resolve({ id: conversa }),
      },
    );
    expect((await json(resposta)).data).toBeNull();
  });
});

describe("3 · quem assume", () => {
  it("'IA': o agente é acordado — e o portão do dreno deixa passar o agente da campanha num número sem agente", async () => {
    const { pessoas } = await campanhaEnviada("resp-ia", ["Fábio Nunes"], { quem_assume: "ia" });
    const [fabio] = pessoas as [Pessoa];
    const conversa = await conversaDe(fabio);
    await rodizioDoNascimentoJaRodou(conversa);

    await responder(fabio, { texto: "quero saber o preço" });

    expect(await agenteAcordado(conversa)).toBe(true);
    expect(await naFila(conversa)).toBe(false);

    const { haQuemAtendaASessao, haAgenteDaCampanhaNaConversa } =
      await import("@/lib/ai/agents/quem-atende-a-sessao");
    expect(await haQuemAtendaASessao(pool, ORG, sessaoId)).toBe(false);
    expect(await haAgenteDaCampanhaNaConversa(pool, ORG, conversa)).toBe(true);

    const { agenteDaCampanhaDaConversa } =
      await import("@/lib/agent-engine/agent/agente-da-campanha");
    expect(await agenteDaCampanhaDaConversa(pool, ORG, conversa)).toBe(AGENTE);
  });

  it("'humano': a IA fica calada nesta conversa, ela vai para a fila, e o agente NÃO é acordado", async () => {
    const { pessoas } = await campanhaEnviada("resp-humano", ["Gil Castro"], {
      quem_assume: "humano",
    });
    const [gil] = pessoas as [Pessoa];
    const conversa = await conversaDe(gil);
    await rodizioDoNascimentoJaRodou(conversa);

    await responder(gil, { texto: "quero falar com alguém" });

    expect(await agenteAcordado(conversa)).toBe(false);
    expect(await naFila(conversa)).toBe(true);
    const { rows } = await pool.query<{ silenciada: boolean; motivo: string }>(
      `select bot_silenced_until = 'infinity'::timestamptz as silenciada, last_handoff_reason as motivo
         from conversations where id = $1`,
      [conversa],
    );
    expect(rows[0]).toEqual({ silenciada: true, motivo: "campanha_atendimento_humano" });
    // O card cai no funil do mesmo jeito.
    expect((await leadsAbertos(gil))[0]?.stage_id).toBe(ETAPA_RESPONDEU);
  });

  it("'IA e depois humano': o agente atende, e a passagem pela regra existente leva a conversa à fila", async () => {
    const { pessoas } = await campanhaEnviada("resp-ia-humano", ["Hugo Lima"], {
      quem_assume: "ia_e_humano",
    });
    const [hugo] = pessoas as [Pessoa];
    const conversa = await conversaDe(hugo);
    await rodizioDoNascimentoJaRodou(conversa);

    await responder(hugo, { texto: "quanto custa?" });
    expect(await agenteAcordado(conversa)).toBe(true);
    expect(await naFila(conversa)).toBe(false);

    const { performHumanHandoff } = await import("@/lib/agent-engine/agent/human-handoff");
    const mudo = {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    };
    await performHumanHandoff(
      pool,
      { tenantId: ORG, leadId: hugo.id, conversationId: conversa },
      {
        reason: "requested_human",
        conversationSummary: "quer falar com uma pessoa",
        log: mudo as never,
      },
    );
    expect(await naFila(conversa)).toBe(true);
  });

  it("controle: a mesma passagem numa campanha de 'IA' NÃO pede a fila — o destino é da campanha", async () => {
    const { pessoas } = await campanhaEnviada("resp-ia-controle", ["Iris Melo"], {
      quem_assume: "ia",
    });
    const [iris] = pessoas as [Pessoa];
    const conversa = await conversaDe(iris);
    await rodizioDoNascimentoJaRodou(conversa);
    await responder(iris, { texto: "oi" });

    const { performHumanHandoff } = await import("@/lib/agent-engine/agent/human-handoff");
    const mudo = {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    };
    await performHumanHandoff(
      pool,
      { tenantId: ORG, leadId: iris.id, conversationId: conversa },
      {
        reason: "requested_human",
        conversationSummary: "quer falar com uma pessoa",
        log: mudo as never,
      },
    );
    expect(await naFila(conversa)).toBe(false);
  });
});

describe("4 · cada botão mapeado executa a ação sem acordar modelo de linguagem", () => {
  const MAPA = [
    { botao: "Quero saber mais", acao: "atribuir_ia" },
    { botao: "Falar com atendente", acao: "atribuir_humano" },
    { botao: "Já comprei", acao: "mover_etapa", stage_id: ETAPA_COMPROU },
    { botao: "Não tenho interesse", acao: "marcar_perdido" },
    { botao: "Parar", acao: "opt_out" },
  ];
  let pessoas: Pessoa[] = [];

  beforeAll(async () => {
    ({ pessoas } = await campanhaEnviada(
      "resp-botoes",
      ["João Ramos", "Kátia Dias", "Léo Faria", "Mara Silva", "Nina Costa"],
      { quem_assume: "ia", botoes_de_resposta: MAPA },
    ));
    for (const p of pessoas) await rodizioDoNascimentoJaRodou(await conversaDe(p));
  });

  it("'Já comprei' (mover para etapa): o card vai para a etapa do botão; ninguém pediu fila", async () => {
    const leo = pessoas[2]!;
    await responder(leo, { botao: "Já comprei" });
    expect((await leadsAbertos(leo))[0]?.stage_id).toBe(ETAPA_COMPROU);
    expect(await naFila(await conversaDe(leo))).toBe(false);
  });

  it("'Falar com atendente': fila, IA calada, agente não acordado", async () => {
    const katia = pessoas[1]!;
    await responder(katia, { botao: "Falar com atendente" });
    const conversa = await conversaDe(katia);
    expect(await naFila(conversa)).toBe(true);
    expect(await agenteAcordado(conversa)).toBe(false);
  });

  it("'Não tenho interesse': o negócio fecha como perdido, e o agente não é acordado", async () => {
    const mara = pessoas[3]!;
    await responder(mara, { botao: "Não tenho interesse" });
    expect(await leadsAbertos(mara)).toHaveLength(0);
    const { rows } = await pool.query<{ status: string; stage_id: string }>(
      `select status, stage_id from crm_leads where organization_id = $1 and contact_id = $2`,
      [ORG, mara.id],
    );
    expect(rows).toEqual([{ status: "lost", stage_id: ETAPA_PERDIDO }]);
    expect(await agenteAcordado(await conversaDe(mara))).toBe(false);
  });

  it("'Parar': grava o opt-out no contato, e ninguém fala mais com ele", async () => {
    const nina = pessoas[4]!;
    await responder(nina, { botao: "Parar" });
    const { rows } = await pool.query<{ is_blocked: boolean; blocked_reason: string }>(
      `select is_blocked, blocked_reason from contacts where id = $1`,
      [nina.id],
    );
    expect(rows[0]).toEqual({ is_blocked: true, blocked_reason: "quick_reply_opt_out" });
    expect(await agenteAcordado(await conversaDe(nina))).toBe(false);
  });

  it("'Quero saber mais' (atribuir à IA): o agente é acordado para responder", async () => {
    const joao = pessoas[0]!;
    await responder(joao, { botao: "Quero saber mais" });
    expect(await agenteAcordado(await conversaDe(joao))).toBe(true);
  });

  it("o toque fica gravado na mensagem: o rótulo como texto e o clique no metadata", async () => {
    const { rows } = await pool.query<{
      type: string;
      body: string;
      metadata: Record<string, unknown>;
    }>(
      `select type, body, metadata from messages where organization_id = $1 and contact_id = $2 and direction = 'inbound'`,
      [ORG, pessoas[0]!.id],
    );
    expect(rows[0]).toMatchObject({
      type: "text",
      body: "Quero saber mais",
      metadata: { resposta_rapida: { texto: "Quero saber mais", payload: "Quero saber mais" } },
    });
  });

  it("só pede turno de agente quem a ação entrega à IA (ou à campanha de 'IA'): perdido, opt-out e fila, não", async () => {
    const conversas = await Promise.all(pessoas.map((p) => conversaDe(p)));
    const acordadas = await Promise.all(conversas.map((c) => agenteAcordado(c)));
    expect(acordadas).toEqual([true, false, true, false, false]);
    // `true` no "Já comprei": mover o card não decide quem atende — a campanha
    // é de "IA", e a pessoa merece resposta. O toque em si não passou por LLM.
  });
});

describe("5 · o agente recebe o contexto da campanha", () => {
  it("o bloco do turno traz nome, modelo, texto recebido, variáveis e oferta", async () => {
    const { pessoas } = await campanhaEnviada("resp-contexto", ["Otto Braga"]);
    const [otto] = pessoas as [Pessoa];
    const conversa = await conversaDe(otto);
    const { contextoDaCampanhaDaConversa } = await import("@/lib/campanhas/contexto-do-agente");

    const bloco = await contextoDaCampanhaDaConversa(pool, ORG, conversa, emMinutos(60));
    expect(bloco).toContain("Avaliação resp-contexto");
    expect(bloco).toContain(`${MODELO} (pt_BR)`);
    expect(bloco).toContain("Oi Otto, a avaliação sai por R$ 99 até sexta.");
    expect(bloco).toContain('"1": "Otto"');
    expect(bloco).toContain(OFERTA);
  });

  it("fora da janela de atribuição (72 h), a oferta não vai mais — ela pode ter vencido", async () => {
    const { pessoas } = await campanhaEnviada("resp-contexto-velho", ["Pia Moura"]);
    const conversa = await conversaDe(pessoas[0]!);
    const { contextoDaCampanhaDaConversa } = await import("@/lib/campanhas/contexto-do-agente");
    expect(await contextoDaCampanhaDaConversa(pool, ORG, conversa, emMinutos(73 * 60))).toBe("");
  });
});

describe("6 · o destinatário conta como 'respondeu' nas métricas", () => {
  it("a resposta (digitada ou por botão) vira `replied` e soma em `responderam`", async () => {
    const { id, pessoas } = await campanhaEnviada("resp-metrica", ["Rui Alves", "Sara Lins"]);
    const [rui, sara] = pessoas as [Pessoa, Pessoa];
    await responder(rui, { texto: "pode ser" });
    await responder(sara, { botao: "Quero saber mais" });

    // O consumidor de `message.received` — o mesmo que o dreno chama —, com a
    // hora da mensagem, como o evento real carrega.
    const { campanhaRespostaHandler } = await import("@/lib/campanhas/resposta.handler");
    for (const p of [rui, sara]) {
      const r = await campanhaRespostaHandler.handle({
        organization_id: ORG,
        payload: { contact_id: p.id },
        created_at: emMinutos(30 + sequenciaDeResposta).toISOString(),
      } as never);
      expect(r.status).toBe("ok");
    }

    const { GET } = await import("@/app/api/v1/campaigns/[id]/metrics/route");
    const res = await GET(pedido(`http://localhost/api/v1/campaigns/${id}/metrics`, "GET"), {
      params: Promise.resolve({ id }),
    });
    const contagem = (await json<{ contagem: { responderam: number } }>(res)).data.contagem;
    expect(contagem.responderam).toBe(2);
  });
});

describe("a API guarda o mapa e a regra de quem atende", () => {
  it("botão para etapa de outro CRM é recusado com a frase da tela", async () => {
    const res = await criarCampanha({
      name: "Etapa inexistente",
      channel_session_id: sessaoId,
      meta_template_id: modeloId,
      template_variables: { "1": { tipo: "contato", campo: "primeiro_nome" } },
      base_legal: "consent",
      audience_filter: { com_alguma_tag: ["ninguem"], limite: 10 },
      agent_id: AGENTE,
      botoes_de_resposta: [
        {
          botao: "Já comprei",
          acao: "mover_etapa",
          stage_id: "0d0e0011-0000-4000-8000-00000000dead",
        },
      ],
    });
    expect(res.status).toBe(422);
  });

  it("'IA e depois humano' sem agente é recusado — não haveria quem atender antes da passagem", async () => {
    const res = await criarCampanha({
      name: "Sem agente",
      channel_session_id: sessaoId,
      meta_template_id: modeloId,
      template_variables: { "1": { tipo: "contato", campo: "primeiro_nome" } },
      base_legal: "consent",
      audience_filter: { com_alguma_tag: ["ninguem"], limite: 10 },
      quem_assume: "ia_e_humano",
    });
    expect(res.status).toBe(422);
  });
});

describe("revisão: as bordas que a primeira versão errava", () => {
  /** Uma campanha para uma etiqueta, já disparada. */
  async function disparar(tag: string, extra: Record<string, unknown> = {}): Promise<string> {
    const criada = await criarCampanha({
      name: `Avaliação ${tag}`,
      channel_session_id: sessaoId,
      meta_template_id: modeloId,
      template_variables: { "1": { tipo: "contato", campo: "primeiro_nome" } },
      base_legal: "consent",
      audience_filter: { com_alguma_tag: [tag], limite: 100 },
      pipeline_id: FUNIL,
      stage_id: ETAPA_RESPONDEU,
      agent_id: AGENTE,
      ...extra,
    });
    const corpo = await json<{ id: string }>(criada);
    expect(criada.status, JSON.stringify(corpo)).toBe(201);
    const id = corpo.data.id;
    expect((await acao(id, "preparar")).status).toBe(200);
    expect((await acao(id, "iniciar")).status).toBe(200);
    await rodada(emMinutos(minutoDaRodada++));
    return id;
  }

  async function comNegocio(
    tag: string,
    nome: string,
    funil: string,
    etapa: string,
  ): Promise<Pessoa> {
    const [p] = (await semearContatos(tag, [nome])) as [Pessoa];
    await pool.query(
      `insert into crm_leads (organization_id, pipeline_id, stage_id, contact_id, title) values ($1, $2, $3, $4, $5)`,
      [ORG, funil, etapa, p.id, `Negócio de ${nome}`],
    );
    return p;
  }

  it("duas mensagens coladas ('oi', 'quero') deixam UMA linha 'Respondeu à campanha' na timeline", async () => {
    const vera = await comNegocio("resp-duas", "Vera Pinto", FUNIL, ETAPA_NOVO);
    await disparar("resp-duas");

    await responder(vera, { texto: "oi" });
    await responder(vera, { texto: "quero" });

    const lead = (await leadsAbertos(vera))[0]!;
    expect(lead.stage_id).toBe(ETAPA_RESPONDEU);
    const { rows } = await pool.query(
      `select 1 from crm_lead_activities where organization_id = $1 and lead_id = $2 and type = 'campaign_replied'`,
      [ORG, lead.id],
    );
    expect(rows).toHaveLength(1);
  });

  it("o consumidor da métrica carimbou ANTES: a resposta ainda conta como primeira e o card anda", async () => {
    const wil = await comNegocio("resp-carimbo-antes", "Wil Souto", FUNIL, ETAPA_NOVO);
    const id = await disparar("resp-carimbo-antes");
    // O dreno de `message.received` passou primeiro, com a hora do evento.
    await pool.query(
      `update campaign_recipients set replied_at = $2, status = 'replied' where campaign_id = $1`,
      [id, emMinutos(30 + sequenciaDeResposta + 1)],
    );

    await responder(wil, { texto: "pode mandar" });
    expect((await leadsAbertos(wil))[0]?.stage_id).toBe(ETAPA_RESPONDEU);
  });

  it("funil declarado SEM etapa: quem já é lead vai para a primeira etapa aberta do funil", async () => {
    const xavi = await comNegocio("resp-sem-etapa", "Xavi Rocha", OUTRO_FUNIL, OUTRA_ETAPA);
    await disparar("resp-sem-etapa", { stage_id: null });

    await responder(xavi, { texto: "tenho interesse" });
    const abertos = await leadsAbertos(xavi);
    expect(abertos).toHaveLength(1);
    expect(abertos[0]).toMatchObject({ pipeline_id: FUNIL, stage_id: ETAPA_NOVO });
  });

  it("'Atribuir à IA' depois de a campanha mandar para a fila: a pausa da campanha sai e o agente atende", async () => {
    const { pessoas } = await campanhaEnviada("resp-volta-ia", ["Yara Gomes"], {
      quem_assume: "humano",
      botoes_de_resposta: [{ botao: "Quero saber mais", acao: "atribuir_ia" }],
    });
    const [yara] = pessoas as [Pessoa];
    const conversa = await conversaDe(yara);
    const silenciada = async () =>
      (
        await pool.query<{ s: boolean }>(
          `select coalesce(bot_silenced_until > now(), false) as s from conversations where id = $1`,
          [conversa],
        )
      ).rows[0]!.s;

    await responder(yara, { texto: "oi" });
    expect(await silenciada()).toBe(true);
    expect(await agenteAcordado(conversa)).toBe(false);

    await responder(yara, { botao: "Quero saber mais" });
    expect(await silenciada()).toBe(false);
    expect(await agenteAcordado(conversa)).toBe(true);
  });

  it("toque num botão de uma campanha ANTIGA: a métrica credita a campanha tocada, não a mais recente", async () => {
    const [zeca] = (await semearContatos("resp-duas-campanhas", ["Zeca Lima"])) as [Pessoa];
    const antiga = await disparar("resp-duas-campanhas");
    const wamidDaAntiga = wamidPara(zeca.tel);
    // A campanha B falou com a mesma pessoa DEPOIS da A. A preparação recusaria
    // o contato (limite de 24 h por usuário, no relógio real), então o envio de B
    // é o destinatário gravado como a rodada o grava: entregue, mais recente.
    const criadaB = await criarCampanha({
      name: "Avaliação resp-duas-campanhas B",
      channel_session_id: sessaoId,
      meta_template_id: modeloId,
      template_variables: { "1": { tipo: "contato", campo: "primeiro_nome" } },
      base_legal: "consent",
      audience_filter: { com_alguma_tag: ["resp-duas-campanhas"], limite: 100 },
    });
    const recente = (await json<{ id: string }>(criadaB)).data.id;
    await pool.query(
      `insert into campaign_recipients (organization_id, campaign_id, contact_id, conversation_id, status, sent_at, delivered_at)
       values ($1, $2, $3, $4, 'delivered', $5, $5)`,
      [ORG, recente, zeca.id, await conversaDe(zeca), emMinutos(minutoDaRodada + 1)],
    );

    sequenciaDeResposta += 1;
    const wamid = `wamid.RESPOSTA.${sequenciaDeResposta}`;
    const quando = emMinutos(minutoDaRodada + 5);
    const res = await postarWebhookMeta({
      token: tokenDoWebhook,
      appSecret: APP_SECRET,
      corpo: toqueNoBotao(ORIGEM, {
        wamid,
        rotulo: "Quero saber mais",
        respondendoA: wamidDaAntiga,
        telefone: zeca.tel.slice(1),
        nome: zeca.nome,
        quando,
      }),
    });
    expect(res.status).toBe(200);
    const { rows: msg } = await pool.query<{ id: string }>(
      `select id from messages where organization_id = $1 and external_id = $2`,
      [ORG, wamid],
    );
    const { campanhaRespostaHandler } = await import("@/lib/campanhas/resposta.handler");
    await campanhaRespostaHandler.handle({
      organization_id: ORG,
      payload: { contact_id: zeca.id, message_id: msg[0]!.id },
      created_at: quando.toISOString(),
    } as never);

    const { rows } = await pool.query<{ campaign_id: string; replied: boolean }>(
      `select campaign_id, replied_at is not null as replied from campaign_recipients where contact_id = $1`,
      [zeca.id],
    );
    const porCampanha = Object.fromEntries(rows.map((r) => [r.campaign_id, r.replied]));
    expect(porCampanha[antiga]).toBe(true);
    expect(porCampanha[recente]).toBe(false);
  });
});

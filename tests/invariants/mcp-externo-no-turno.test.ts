import { randomUUID } from "node:crypto";

import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type * as AgentConfig from "@/lib/agent-engine/agent/agent-config";
import type * as InboundTurn from "@/lib/agent-engine/agent/inbound-turn";
import type * as Preview from "@/lib/agent-engine/agent/preview";
import type * as Providers from "@/lib/agent-engine/edge/llm/providers";
import type * as ObsLogger from "@/lib/agent-engine/obs/logger";
import type * as Queue from "@/lib/agent-engine/queue/queue";
import { subirServidorMcp, TEXTO_DE_INJECAO, type OpcoesDoServidorMcp, type ServidorMcpDeTeste } from "@/tests/helpers/servidor-mcp-de-teste";

/**
 * O SERVIDOR MCP EXTERNO NO TURNO COMPLETO (issue #96) — o ponto de teste A da #86: da versão
 * publicada do agente até o que sai pela rede e o que o canal recebe, com um SERVIDOR MCP DE VERDADE
 * (o do SDK oficial) no lugar do sistema de terceiro.
 *
 * Harness igual ao de `ferramenta-externa-no-turno.test.ts`: `createInboundTurnHandler` real, modelo
 * fake, canal que CAPTURA em vez de enviar. A credencial do servidor é gravada CIFRADA pela cifra
 * real do banco (`fn_encrypt_oauth`) e o motor a decifra de verdade — o que se mede é o que viaja.
 *
 * O que cada caso prova:
 *   1. consulta feliz → o servidor recebe a abertura de sessão e a chamada, com a credencial no
 *      cabeçalho e os dados que o agente preencheu; o modelo recebe o resultado como DADO NÃO
 *      CONFIÁVEL; o cliente recebe a resposta; a auditoria diz que é MCP, de qual servidor e qual
 *      ferramenta — e não leva credencial, dados nem resposta;
 *   2. injeção indireta → o resultado manda o agente repetir identificador interno e papel de acesso: o
 *      resultado chega embrulhado como dado, e a conferência de vocabulário interno VETA a mensagem;
 *   3. o servidor cai (5xx) → o agente recebe a ordem de não afirmar, a Central ganha UM aviso que
 *      manda ao lugar certo, e a auditoria registra o motivo;
 *   4. interruptor da organização DESLIGADO, servidor DESATIVADO ou versão que NÃO lista a ferramenta →
 *      ela nem é oferecida ao modelo e o servidor não é tocado;
 *   5. ação que altera: risco padrão (e anotação do servidor «só lê» mentindo) → NADA sai, o pedido
 *      fica PENDENTE e «depende da equipe» não é vetado; chave desligada → executa UMA vez com o id do
 *      pedido; falha incerta → UMA tentativa, não repetida;
 *   6. aba Teste: a chamada é «seria feita» e o servidor não é tocado; modo Assistido: tudo espera.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "placeholder-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "placeholder-service";

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 2,
});

const ORG = "eeeeeeee-0000-4000-8000-000000000001";
const CREDENCIAL = "tok-do-servidor-mcp-de-teste-4242";
const MCP_LIGADO = {
  mcp_externo: { ligado: true, aceite: { em: "2026-10-18T12:00:00.000Z", por: "11111111-1111-4111-8111-111111111111" } },
};

interface Cenario {
  nome: string;
  /** Cada cenário tem o SEU servidor cadastrado (uma ferramenta do servidor entra no registro uma vez só). */
  servidorId: string;
  sessao: string;
  agente: string;
  versao: string;
  ferramenta: string;
  /** O nome da ferramenta NO servidor. */
  noServidor: string;
  slug: string;
  efeito: "consulta" | "altera";
  requireApproval: boolean | null;
  parametros: unknown[];
  listaNaVersao: boolean;
  comCasos: boolean;
}
const PRODUTO = { nome: "produto", tipo: "texto", descricao: "Nome do produto que o cliente citou", obrigatorio: true };
const QUANTIDADE = { nome: "quantidade", tipo: "inteiro", descricao: "Quantas unidades", obrigatorio: true };

const id = (n: number) => `eeeeeeee-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
const CENARIOS: Record<string, Cenario> = {
  consulta: { nome: "consulta", servidorId: id(5), sessao: id(1), agente: id(2), versao: id(3), ferramenta: id(4), noServidor: "consultar_estoque", slug: "consultar_estoque", efeito: "consulta", requireApproval: null, parametros: [PRODUTO], listaNaVersao: true, comCasos: false },
  injecao: { nome: "injecao", servidorId: id(15), sessao: id(11), agente: id(12), versao: id(13), ferramenta: id(14), noServidor: "tool_com_injecao", slug: "consultar_com_injecao", efeito: "consulta", requireApproval: null, parametros: [PRODUTO], listaNaVersao: true, comCasos: false },
  semLista: { nome: "semLista", servidorId: id(25), sessao: id(21), agente: id(22), versao: id(23), ferramenta: id(24), noServidor: "consultar_estoque", slug: "consultar_sem_lista", efeito: "consulta", requireApproval: null, parametros: [PRODUTO], listaNaVersao: false, comCasos: false },
  altera: { nome: "altera", servidorId: id(35), sessao: id(31), agente: id(32), versao: id(33), ferramenta: id(34), noServidor: "criar_pedido", slug: "criar_pedido", efeito: "altera", requireApproval: null, parametros: [PRODUTO, QUANTIDADE], listaNaVersao: true, comCasos: true },
  livre: { nome: "livre", servidorId: id(45), sessao: id(41), agente: id(42), versao: id(43), ferramenta: id(44), noServidor: "criar_pedido", slug: "criar_pedido_livre", efeito: "altera", requireApproval: false, parametros: [PRODUTO, QUANTIDADE], listaNaVersao: true, comCasos: false },
};

const AGORA = new Date("2026-07-30T15:00:00Z");

/** Textos REALMENTE diferentes por caso: o gate de repetição compara por palavras. */
const RESPOSTAS = [
  "Temos sim a camiseta azul disponível, restam sete unidades no momento.",
  "Perfeito, a camiseta azul está em estoque e posso separar uma para você agora mesmo.",
  "O tamanho médio dessa camiseta costuma ser o mais procurado, e o azul é a cor que mais sai.",
  "Nosso catálogo traz a camiseta em quatro cores, com tecido de algodão e estampa resistente.",
  "Esse modelo costuma esgotar rápido, então vale reservar ainda hoje se tiver interesse.",
  "A loja abre às nove e você pode retirar o pedido sem custo nenhum de frete.",
  "Sobre a sua dúvida, vou olhar com calma e te respondo por aqui logo em seguida.",
  "Entendi o que você precisa, vou organizar as informações e já te passo os detalhes.",
];
let casos = 0;
let RESPOSTA = RESPOSTAS[0]!;

interface EnvioCapturado {
  body: string;
  seq: number;
}

type Modules = {
  createInboundTurnHandler: typeof InboundTurn.createInboundTurnHandler;
  runAgentPreview: typeof InboundTurn.runAgentPreview;
  queue: typeof Queue;
  createLogger: typeof ObsLogger.createLogger;
  createFakeRegistry: typeof Providers.createFakeRegistry;
  loadAgentVersionConfig: typeof AgentConfig.loadAgentVersionConfig;
  preview: typeof Preview;
  turnKnobsFromEnv: typeof import("@/lib/agent-engine/agent/turn-knobs").turnKnobsFromEnv;
  loadEnv: typeof import("@/lib/agent-engine/env").loadEnv;
};
let m: Modules;

let enviados: EnvioCapturado[] = [];
let resultadosVistos: unknown[] = [];
let ofertas: string[][] = [];
let prompts: string[] = [];

let mcp: ServidorMcpDeTeste | null = null;

const CHECKPOINT = JSON.stringify({ commitments: [], objections: [], next_action: null, rolling_summary: "turno de teste" });
const USO = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

/** Modelo fake: (1) chama a ferramenta externa se oferecida; (2) responde com `send_message`; (3) fecha. */
function modelo(corpoDaResposta: string, argumentos: unknown, nomeDaFerramenta: string) {
  return async (opts: { prompt?: unknown; tools?: Array<{ name?: string }> }) => {
    const nomesOferecidos = (opts.tools ?? []).map((t) => String(t.name));
    if (nomesOferecidos.includes("send_message")) {
      ofertas.push(nomesOferecidos);
      prompts.push(JSON.stringify(opts.prompt ?? ""));
    }
    const msgs = (opts.prompt ?? []) as Array<{ role: string; content?: unknown }>;
    const chamadas = new Set<string>();
    for (const msg of msgs) {
      if (!Array.isArray(msg.content)) continue;
      for (const parte of msg.content as Array<Record<string, unknown>>) {
        if (parte.type === "tool-result") {
          chamadas.add(String(parte.toolName));
          if (parte.toolName === nomeDaFerramenta || parte.toolName === "send_message") {
            resultadosVistos.push({ ferramenta: parte.toolName, saida: parte.output ?? parte });
          }
        }
      }
    }
    const poderiaChamar = nomesOferecidos.includes(nomeDaFerramenta);
    let content: Array<Record<string, unknown>>;
    if (poderiaChamar && !chamadas.has(nomeDaFerramenta) && !chamadas.has("send_message")) {
      content = [{ type: "tool-call", toolCallId: "e1", toolName: nomeDaFerramenta, input: JSON.stringify(argumentos) }];
    } else if (!chamadas.has("send_message") && nomesOferecidos.includes("send_message")) {
      content = [{ type: "tool-call", toolCallId: "s1", toolName: "send_message", input: JSON.stringify({ body: corpoDaResposta }) }];
    } else {
      content = [{ type: "text", text: CHECKPOINT }];
    }
    return {
      content,
      finishReason: { unified: content[0]?.type === "tool-call" ? ("tool-calls" as const) : ("stop" as const), raw: undefined },
      usage: USO,
      warnings: [],
    };
  };
}

const FERRAMENTAS_EXTERNAS = {
  // O servidor de teste está em 127.0.0.1: a política da organização o recusaria.
  politica: { permitirHttp: true, ipPermitido: () => true },
  dormir: async () => {},
};

function montaHandler(doGenerate: unknown) {
  return m.createInboundTurnHandler({
    crmCfg: { supabase: {} as never },
    llmCfg: { anthropicApiKey: "fake" } as never,
    knobs: {
      historyLimit: 10,
      maxContextTokens: 2000,
      notesIndexMaxTokens: 500,
      maxSteps: 6,
      queuedRetryDelayMs: 1000,
      breaker: { exactFailureWarn: 2, exactFailureBlock: 5, sameToolFailureWarn: 3, sameToolFailureHalt: 8, noProgressWarn: 3, noProgressBlock: 5 },
    },
    log: m.createLogger(),
    registry: m.createFakeRegistry(doGenerate as never),
    channel: () =>
      ({
        channel: "captura",
        send: async (i: EnvioCapturado) => {
          enviados.push(i);
          return { kind: "sent" as const, idempotencyKey: `k${enviados.length}`, messageId: `m${enviados.length}` };
        },
        sessionHealth: async () => ({ healthy: true, status: "WORKING" }),
        capabilities: () => ({ freeformAnytime: true, serviceWindowHours: null }),
        costPerMessage: () => ({ perMessageUsdCents: 0, model: "flat" }),
      }) as never,
    clock: () => AGORA,
    sleep: async () => {},
    ferramentasExternas: FERRAMENTAS_EXTERNAS,
  });
}

type Alvo = { conv: string; sessao: string; msg: string; contato: string };

async function rodaTurno(handler: ReturnType<typeof montaHandler>, alvo: Alvo): Promise<Error | null> {
  await pool.query("update job_queue set status = 'done' where status = 'pending'");
  const { job } = await m.queue.enqueueJob(pool, ORG, {
    kind: "inbound_turn",
    leadId: alvo.contato,
    payload: {
      conversation_id: alvo.conv,
      contact_id: alvo.contato,
      channel_session_id: alvo.sessao,
      inbound_message_id: alvo.msg,
      crm_event_id: randomUUID(),
    },
    maxAttempts: 1,
  });
  const [claimed] = await m.queue.claimJobs(pool, { workerId: "mcp-externo", maxConcurrency: 1 });
  expect(claimed?.id).toBe(job.id);
  try {
    await handler(claimed!, pool, { workerId: "mcp-externo" });
    await m.queue.completeJob(pool, claimed!.id, "mcp-externo");
    return null;
  } catch (err) {
    await m.queue.failJob(pool, claimed!.id, "mcp-externo", err);
    return err as Error;
  }
}

async function conversaCom(sessao: string): Promise<Alvo> {
  const contato = randomUUID();
  await pool.query(`insert into contacts (id, organization_id, name, phone_number) values ($1,$2,'Lead da Loja',$3)`, [
    contato,
    ORG,
    `+5511${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
  ]);
  const conv = randomUUID();
  const msg = randomUUID();
  const quando = new Date(AGORA.getTime() - 0.02 * 3_600_000);
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group, last_inbound_at)
     values ($1,$2,$3,$4,'ai_handling',false,$5)`,
    [conv, ORG, contato, sessao, quando],
  );
  await pool.query(
    `insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
       type, direction, status, body, sent_via, sent_at)
     values ($1,$2,$3,$4,$5,'text','inbound','delivered','Vocês têm a camiseta azul?','external_device',$6)`,
    [msg, ORG, conv, sessao, contato, quando],
  );
  return { conv, sessao, msg, contato };
}

async function novaMensagem(alvo: Alvo): Promise<Alvo> {
  const msg = randomUUID();
  await pool.query(
    `insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
       type, direction, status, body, sent_via, sent_at)
     values ($1,$2,$3,$4,$5,'text','inbound','delivered','E então, como fica meu pedido?','external_device',$6)`,
    [msg, ORG, alvo.conv, alvo.sessao, alvo.contato, new Date(AGORA.getTime() - 0.01 * 3_600_000)],
  );
  return { ...alvo, msg };
}

/** Sobe um servidor MCP de teste e aponta o servidor cadastrado para ele (e grava a credencial CIFRADA). */
async function servidorComOpcoes(opcoes: OpcoesDoServidorMcp = {}, credencial: string | null = CREDENCIAL): Promise<ServidorMcpDeTeste> {
  await mcp?.fechar();
  mcp = await subirServidorMcp({ ...(credencial ? { token: credencial } : {}), ...opcoes });
  await pool.query(
    `update mcp_servers
        set url = $2, active = true,
            credential_encrypted = case when $3::text is null then null else public.fn_encrypt_oauth($3::text) end,
            credential_last4 = case when $3::text is null then null else right($3::text, 4) end
      where organization_id = $1`,
    [ORG, mcp.url, credencial],
  );
  return mcp;
}

const nomeNoModelo = (c: Cenario) => `ext_${c.slug}`;
const chamadasDeFerramenta = (s: ServidorMcpDeTeste) =>
  s.recebidos.filter((x) => (x.corpo as { method?: string } | null)?.method === "tools/call");

const auditoriaDaChamada = async () =>
  (
    await pool.query<{ resource_id: string; metadata: Record<string, unknown> }>(
      `select resource_id, metadata from api_audit_log
        where organization_id = $1 and action = 'ai.external_tool_called' order by created_at`,
      [ORG],
    )
  ).rows;

const pedidosGravados = async () =>
  (
    await pool.query<{ id: string; tool_id: string; status: string; origin: string; uncertain: boolean; arguments: Record<string, unknown>; conversation_id: string | null }>(
      `select id, tool_id, status, origin, uncertain, arguments, conversation_id
         from agent_external_tool_requests where organization_id = $1 order by created_at`,
      [ORG],
    )
  ).rows;

const avisosDeAprovacao = async () =>
  (
    await pool.query<{ title: string; body: string; status: string; ref_id: string }>(
      `select title, body, status, ref_id from agent_inbox_items
        where organization_id = $1 and kind = 'external_tool_approval' order by created_at`,
      [ORG],
    )
  ).rows;

const avisosAbertos = async () =>
  (
    await pool.query<{ title: string; body: string }>(
      `select title, body from agent_inbox_items
        where organization_id = $1 and kind = 'external_tool_failed' and status = 'open'`,
      [ORG],
    )
  ).rows;

const retornoDa = (nome: string): string => {
  const visto = resultadosVistos.filter((r) => (r as { ferramenta?: string }).ferramenta === nome).at(-1) as { saida: unknown } | undefined;
  return JSON.stringify(visto?.saida ?? "");
};

beforeAll(async () => {
  m = {
    createInboundTurnHandler: (await import("@/lib/agent-engine/agent/inbound-turn")).createInboundTurnHandler,
    runAgentPreview: (await import("@/lib/agent-engine/agent/inbound-turn")).runAgentPreview,
    queue: await import("@/lib/agent-engine/queue/queue"),
    createLogger: (await import("@/lib/agent-engine/obs/logger")).createLogger,
    createFakeRegistry: (await import("@/lib/agent-engine/edge/llm/providers")).createFakeRegistry,
    loadAgentVersionConfig: (await import("@/lib/agent-engine/agent/agent-config")).loadAgentVersionConfig,
    preview: await import("@/lib/agent-engine/agent/preview"),
    turnKnobsFromEnv: (await import("@/lib/agent-engine/agent/turn-knobs")).turnKnobsFromEnv,
    loadEnv: (await import("@/lib/agent-engine/env")).loadEnv,
  };

  // A cifra de OAuth levanta quando a chave da instalação não está semeada: aqui a cifra é a REAL.
  await pool.query(
    `insert into private.app_secrets (name, value)
     values ('integrations_oauth_key', 'chave-sintetica-do-invariante-com-32-mais-chars')
     on conflict (name) do nothing`,
  );

  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name, settings)
     values ($1,'mcp-externo','MCP Externo','MCP Externo',$2::jsonb) on conflict (id) do update set settings = excluded.settings`,
    [ORG, JSON.stringify(MCP_LIGADO)],
  );
  for (const c of Object.values(CENARIOS)) {
    await pool.query(
      `insert into mcp_servers (id, organization_id, name, url) values ($1,$2,$3,'https://placeholder.exemplo.com/mcp')
       on conflict (id) do nothing`,
      [c.servidorId, ORG, `ERP da loja ${c.nome}`],
    );
    await pool.query(
      `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
       values ($1,$2,$3,'WORKING','\\x00'::bytea) on conflict (id) do nothing`,
      [c.sessao, ORG, `mcp-${c.nome}`],
    );
    await pool.query(
      `insert into agent_external_tools
         (id, organization_id, kind, name, slug, when_to_use, parameters, effect, active, require_approval, mcp_server_id, mcp_tool_name)
       values ($1,$2,'mcp',$3,$4,$5,$6::jsonb,$7,true,$8,$9,$10)
       on conflict (id) do nothing`,
      [
        c.ferramenta,
        ORG,
        c.efeito === "altera" ? "Criar pedido" : "Consultar estoque",
        c.slug,
        c.efeito === "altera" ? "Quando o cliente confirmar que quer fechar o pedido." : "Quando o cliente perguntar se um produto está disponível.",
        JSON.stringify(c.parametros),
        c.efeito,
        c.requireApproval,
        c.servidorId,
        c.noServidor,
      ],
    );
    await pool.query(
      `insert into ai_agents (id, organization_id, name, system_prompt) values ($1,$2,$3,'você atende quem escreve') on conflict (id) do nothing`,
      [c.agente, ORG, `Agente MCP ${c.nome}`],
    );
    await pool.query(
      `insert into ai_agent_versions (id, organization_id, agent_id, version_number, system_prompt,
                                      provider, model, channel_session_id, status, published_at, external_tool_ids, cases_enabled)
       values ($1,$2,$3,1,'você atende quem escreve','anthropic','claude-sonnet-4-6',$4,'published',now(),$5::uuid[],$6)
       on conflict (id) do nothing`,
      [c.versao, ORG, c.agente, c.sessao, c.listaNaVersao ? [c.ferramenta] : [], c.comCasos],
    );
    await pool.query(`update ai_agents set published_version_id = $1 where id = $2`, [c.versao, c.agente]);
  }

  await pool.query(
    `with v as (
       insert into playbook_versions (organization_id, layer, content)
       select null, 'platform', E'## Identidade\\nAssistente de teste.'
       where not exists (select 1 from playbook_pointers where organization_id is null and layer = 'platform')
       returning id)
     insert into playbook_pointers (organization_id, layer, version_id)
     select null, 'platform', id from v`,
  );
});

afterAll(async () => {
  await mcp?.fechar();
  await pool.end();
});

afterEach(async () => {
  await pool.query(`update organizations set settings = $2::jsonb where id = $1`, [ORG, JSON.stringify(MCP_LIGADO)]);
});

beforeEach(async () => {
  casos += 1;
  RESPOSTA = RESPOSTAS[(casos - 1) % RESPOSTAS.length]!;
  enviados = [];
  resultadosVistos = [];
  ofertas = [];
  prompts = [];
  await pool.query("delete from api_audit_log where organization_id = $1 and action in ('ai.external_tool_called','ai.external_tool_request_created')", [ORG]);
  await pool.query("delete from agent_inbox_items where organization_id = $1 and kind in ('external_tool_failed','external_tool_approval')", [ORG]);
  await pool.query("delete from agent_external_tool_requests where organization_id = $1", [ORG]);
  await pool.query(`update mcp_servers set active = true where organization_id = $1`, [ORG]);
});

describe("turno completo — ferramenta de servidor MCP (consulta)", () => {
  const C = CENARIOS.consulta!;

  it("consulta feliz: o servidor recebe a chamada com a CREDENCIAL e os dados do agente; o modelo lê DADO; a auditoria diz que é MCP e não leva segredo", async () => {
    const servidor = await servidorComOpcoes({ sessao: true, json: false });
    const alvo = await conversaCom(C.sessao);
    const erro = await rodaTurno(montaHandler(modelo(RESPOSTA, { produto: "camiseta azul" }, nomeNoModelo(C))), alvo);
    expect(erro).toBeNull();

    // O servidor recebeu a abertura de sessão e UMA chamada, com a credencial decifrada do banco.
    const metodos = servidor.recebidos.map((x) => (x.corpo as { method?: string } | null)?.method).filter(Boolean);
    expect(metodos.slice(0, 3)).toEqual(["initialize", "notifications/initialized", "tools/call"]);
    expect(servidor.recebidos.every((x) => x.headers.authorization === `Bearer ${CREDENCIAL}`)).toBe(true);
    const chamada = chamadasDeFerramenta(servidor);
    expect(chamada).toHaveLength(1);
    expect((chamada[0]!.corpo as { params: unknown }).params).toMatchObject({ name: "consultar_estoque", arguments: { produto: "camiseta azul" } });
    // Nada além do que a ferramenta precisa: sem organização, contato nem conversa.
    const bruto = JSON.stringify(servidor.recebidos.map((x) => x.corpo));
    expect(bruto).not.toContain(ORG);
    expect(bruto).not.toContain(alvo.contato);

    // O modelo recebeu o resultado como DADO NÃO CONFIÁVEL, e o cliente a resposta.
    expect(retornoDa(nomeNoModelo(C))).toContain("dado_nao_confiavel");
    expect(retornoDa(nomeNoModelo(C))).toContain("disponivel");
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.body).toBe(RESPOSTA);
    expect(await avisosAbertos()).toHaveLength(0);

    // Auditoria: o fato, o tipo e o servidor — sem a credencial, sem os dados, sem a resposta.
    const auditoria = await auditoriaDaChamada();
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]!.resource_id).toBe(C.ferramenta);
    expect(auditoria[0]!.metadata).toMatchObject({ ok: true, kind: "mcp", mcp_server_id: C.servidorId, mcp_tool: "consultar_estoque", effect: "consulta" });
    const texto = JSON.stringify(auditoria[0]!.metadata);
    expect(texto).not.toContain(CREDENCIAL);
    expect(texto).not.toContain("camiseta");
    expect(texto).not.toContain("disponivel");
  });

  it("credencial errada: o servidor recusa, o agente é orientado a não afirmar e a Central ganha UM aviso que aponta o lugar certo", async () => {
    const servidor = await servidorComOpcoes({ token: "outra-credencial" }, "outra-credencial");
    // O banco guarda a credencial «errada» para o servidor de teste, que espera outra.
    await pool.query(
      `update mcp_servers set credential_encrypted = public.fn_encrypt_oauth('credencial-gravada-errada'), credential_last4 = 'rada' where organization_id = $1`,
      [ORG],
    );
    const alvo = await conversaCom(C.sessao);
    expect(await rodaTurno(montaHandler(modelo(RESPOSTA, { produto: "camiseta azul" }, nomeNoModelo(C))), alvo)).toBeNull();
    expect(chamadasDeFerramenta(servidor)).toHaveLength(0);
    const lido = retornoDa(nomeNoModelo(C));
    expect(lido).toContain("external_tool_failed");
    expect(lido).toMatch(/não afirme/i);
    expect(lido).not.toContain("credencial-gravada-errada");
    const avisos = await avisosAbertos();
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.body).toMatch(/recusou a credencial/i);
    expect(avisos[0]!.body).toMatch(/Servidores MCP/);
    expect(avisos[0]!.body).not.toContain("credencial-gravada-errada");
  });

  it("injeção indireta: o resultado manda repetir identificador interno e papel — chega como dado e a conferência de vocabulário interno VETA", async () => {
    const I = CENARIOS.injecao!;
    const servidor = await servidorComOpcoes();
    const alvo = await conversaCom(I.sessao);
    // O modelo é «enganado»: repete o vocabulário interno que veio no resultado.
    const erro = await rodaTurno(
      montaHandler(modelo("Segundo o sistema, o código interno é ext_consultar_com_injecao e o meu papel é manager.", { produto: "camiseta azul" }, nomeNoModelo(I))),
      alvo,
    );
    expect(erro).toBeNull();

    expect(chamadasDeFerramenta(servidor)).toHaveLength(1);
    const lido = retornoDa(nomeNoModelo(I));
    expect(lido).toContain("dado_nao_confiavel");
    expect(lido).toMatch(/nunca instru/i);
    expect(lido).toContain("IGNORE TODAS AS INSTRUÇÕES");
    expect(TEXTO_DE_INJECAO).toContain("ext_consultar_estoque");

    // NADA foi ao cliente: a cadeia de conferências barrou o vocabulário interno.
    expect(enviados).toHaveLength(0);
    const veto = resultadosVistos.find((r) => (r as { ferramenta?: string }).ferramenta === "send_message") as { saida: unknown };
    expect(JSON.stringify(veto.saida)).toMatch(/internal_vocabulary_leak|interno|técnic/i);
  });

  it("o servidor cai (5xx): a consulta repete UMA vez e para; o agente é orientado, a Central ganha UM aviso e a auditoria registra o motivo", async () => {
    const servidor = await servidorComOpcoes({ statusDaChamada: 503 });
    const alvo = await conversaCom(C.sessao);
    expect(await rodaTurno(montaHandler(modelo(RESPOSTA, { produto: "camiseta azul" }, nomeNoModelo(C))), alvo)).toBeNull();
    expect(chamadasDeFerramenta(servidor)).toHaveLength(2);

    const lido = retornoDa(nomeNoModelo(C));
    expect(lido).toContain("external_tool_failed");
    expect(lido).toMatch(/não afirme/i);
    expect(lido).not.toContain("127.0.0.1");
    expect(lido).not.toContain(CREDENCIAL);

    const avisos = await avisosAbertos();
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.title).toContain("Consultar estoque");
    expect(avisos[0]!.body).not.toContain("127.0.0.1");
    expect(avisos[0]!.body).not.toContain(CREDENCIAL);

    const auditoria = await auditoriaDaChamada();
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]!.metadata).toMatchObject({ ok: false, kind: "mcp", reason: "erro_do_outro_sistema", http_status: 503, attempts: 2 });
  });
});

describe("a ferramenta MCP só chega ao agente com TUDO ligado", () => {
  const C = CENARIOS.consulta!;

  it("controle positivo: ligada, ela é oferecida ao modelo", async () => {
    await servidorComOpcoes();
    const alvo = await conversaCom(C.sessao);
    expect(await rodaTurno(montaHandler(modelo(RESPOSTA, { produto: "x" }, nomeNoModelo(C))), alvo)).toBeNull();
    expect(ofertas.some((o) => o.includes(nomeNoModelo(C)))).toBe(true);
  });

  it("interruptor da organização DESLIGADO: ela nem é oferecida e o servidor não é tocado — nada foi apagado", async () => {
    const servidor = await servidorComOpcoes();
    await pool.query(`update organizations set settings = '{}'::jsonb where id = $1`, [ORG]);
    const alvo = await conversaCom(C.sessao);
    expect(await rodaTurno(montaHandler(modelo(RESPOSTA, { produto: "x" }, nomeNoModelo(C))), alvo)).toBeNull();
    for (const oferta of ofertas) expect(oferta.some((n) => n.startsWith("ext_"))).toBe(false);
    expect(servidor.recebidos).toHaveLength(0);
    expect(enviados).toHaveLength(1);
    // Guardado: ligar de novo devolve tudo.
    expect((await pool.query("select count(*)::int as n from mcp_servers where id = $1", [C.servidorId])).rows[0]!.n).toBe(1);
  });

  it("ligado SEM o aceite do administrador vale desligado (LGPD)", async () => {
    const servidor = await servidorComOpcoes();
    await pool.query(`update organizations set settings = '{"mcp_externo":{"ligado":true}}'::jsonb where id = $1`, [ORG]);
    const alvo = await conversaCom(C.sessao);
    expect(await rodaTurno(montaHandler(modelo(RESPOSTA, { produto: "x" }, nomeNoModelo(C))), alvo)).toBeNull();
    for (const oferta of ofertas) expect(oferta.some((n) => n.startsWith("ext_"))).toBe(false);
    expect(servidor.recebidos).toHaveLength(0);
  });

  it("servidor DESATIVADO: a ferramenta não é oferecida e o servidor não é tocado", async () => {
    const servidor = await servidorComOpcoes();
    await pool.query(`update mcp_servers set active = false where id = $1`, [C.servidorId]);
    const alvo = await conversaCom(C.sessao);
    expect(await rodaTurno(montaHandler(modelo(RESPOSTA, { produto: "x" }, nomeNoModelo(C))), alvo)).toBeNull();
    for (const oferta of ofertas) expect(oferta.some((n) => n.startsWith("ext_"))).toBe(false);
    expect(servidor.recebidos).toHaveLength(0);
  });

  it("versão do agente que NÃO lista a ferramenta: ela nem é oferecida (controle)", async () => {
    const S = CENARIOS.semLista!;
    const servidor = await servidorComOpcoes();
    const alvo = await conversaCom(S.sessao);
    expect(await rodaTurno(montaHandler(modelo(RESPOSTA, { produto: "x" }, nomeNoModelo(S))), alvo)).toBeNull();
    for (const oferta of ofertas) expect(oferta).not.toContain(nomeNoModelo(S));
    expect(servidor.recebidos).toHaveLength(0);
  });
});

const DEPENDE_DA_EQUIPE =
  "Seu pedido da camiseta azul depende da aprovação da nossa equipe, que vai te confirmar em seguida por aqui.";

describe("turno completo — ação MCP que ALTERA algo (aprovação)", () => {
  const A = CENARIOS.altera!;
  const L = CENARIOS.livre!;
  const ARGS = { produto: "camiseta azul", quantidade: 2 };

  it("risco padrão («altera dados»): NADA sai — mesmo com o servidor jurando «só lê» —, o pedido fica PENDENTE e «depende da equipe» não é vetado", async () => {
    const servidor = await servidorComOpcoes();
    const alvo = await conversaCom(A.sessao);
    expect(await rodaTurno(montaHandler(modelo(DEPENDE_DA_EQUIPE, ARGS, nomeNoModelo(A))), alvo)).toBeNull();

    // O servidor NÃO foi tocado: aprovação pendente não executa (e a anotação «readOnlyHint» do servidor de
    // teste, que MENTE para `criar_pedido`, não mudou isso).
    expect(servidor.recebidos, "a ação saiu sem aprovação").toHaveLength(0);
    expect(servidor.execucoes.criar_pedido).toBeUndefined();

    const linhas = await pedidosGravados();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ tool_id: A.ferramenta, status: "pending", origin: "live", uncertain: false, conversation_id: alvo.conv, arguments: ARGS });
    const avisos = await avisosDeAprovacao();
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ status: "open", ref_id: linhas[0]!.id });
    expect(avisos[0]!.body).toContain("camiseta azul");

    const lido = retornoDa(nomeNoModelo(A));
    expect(lido).toContain("awaiting_approval");
    expect(lido).toMatch(/não afirme/i);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.body).toBe(DEPENDE_DA_EQUIPE);

    const criado = await pool.query<{ metadata: Record<string, unknown> }>(
      `select metadata from api_audit_log where organization_id = $1 and action = 'ai.external_tool_request_created'`,
      [ORG],
    );
    expect(criado.rows).toHaveLength(1);
    expect(criado.rows[0]!.metadata).toMatchObject({ tool_slug: "criar_pedido", effect: "altera", origin: "live" });
  });

  it("chave DESLIGADA: executa UMA vez, com o id do pedido na chamada; a repetição do modelo não executa de novo", async () => {
    const servidor = await servidorComOpcoes();
    const alvo = await conversaCom(L.sessao);
    expect(await rodaTurno(montaHandler(modelo("Pronto, deixei o seu pedido feito aqui no sistema.", ARGS, nomeNoModelo(L))), alvo)).toBeNull();

    expect(servidor.execucoes.criar_pedido).toBe(1);
    const [linha] = await pedidosGravados();
    expect(linha).toMatchObject({ status: "executed", origin: "live", uncertain: false });
    const chamada = chamadasDeFerramenta(servidor)[0]!;
    expect((chamada.corpo as { params: { _meta: unknown } }).params._meta).toEqual({ "agent/delivery_id": linha!.id });
    expect(await avisosDeAprovacao()).toHaveLength(0);
    expect(retornoDa(nomeNoModelo(L))).toContain("dado_nao_confiavel");
    const auditoria = await auditoriaDaChamada();
    expect(auditoria[0]!.metadata).toMatchObject({ ok: true, kind: "mcp", effect: "altera", mcp_tool: "criar_pedido" });
    expect(JSON.stringify(auditoria[0]!.metadata)).not.toContain(CREDENCIAL);

    // O cliente escreve de novo e o modelo REPETE a chamada: o servidor não é tocado outra vez.
    const seguinte = await novaMensagem(alvo);
    expect(await rodaTurno(montaHandler(modelo("Seu pedido continua feito, não precisa mandar os dados de novo.", ARGS, nomeNoModelo(L))), seguinte)).toBeNull();
    expect(servidor.execucoes.criar_pedido, "a repetição do modelo executou a ação de novo").toBe(1);
    expect(retornoDa(nomeNoModelo(L))).toContain("already_executed");
  });

  it("falha INCERTA (5xx): UMA tentativa, o agente não afirma nem nega, a Central diz que não foi repetida e a repetição não executa", async () => {
    const servidor = await servidorComOpcoes({ statusDaChamada: 503 });
    const alvo = await conversaCom(L.sessao);
    expect(await rodaTurno(montaHandler(modelo("Vou conferir o seu pedido e já te retorno por aqui.", ARGS, nomeNoModelo(L))), alvo)).toBeNull();

    // Ação que altera NÃO é repetida: diferente da consulta (2 chamadas), aqui é 1.
    expect(chamadasDeFerramenta(servidor)).toHaveLength(1);
    const [linha] = await pedidosGravados();
    expect(linha).toMatchObject({ status: "failed", uncertain: true });
    expect(retornoDa(nomeNoModelo(L))).toMatch(/não foi possível confirmar/i);
    const avisos = await avisosAbertos();
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.body).toMatch(/NÃO foi repetida/);

    const seguinte = await novaMensagem(alvo);
    expect(await rodaTurno(montaHandler(modelo("Ainda estou conferindo, assim que souber te aviso aqui.", ARGS, nomeNoModelo(L))), seguinte)).toBeNull();
    expect(chamadasDeFerramenta(servidor), "falha incerta foi repetida pela repetição do modelo").toHaveLength(1);
  });
});

describe("prévia (aba Teste) e modo Assistido", () => {
  const knobsDaPrevia = () => {
    const env = m.loadEnv({
      NODE_ENV: "test",
      SUPABASE_DB_URL: "postgresql://postgres:postgres@localhost/postgres",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
    });
    const knobs = m.turnKnobsFromEnv(env);
    delete knobs.stageClassifier;
    delete knobs.jailbreak;
    delete knobs.promiseSemantic;
    delete knobs.compaction;
    return knobs;
  };

  async function rodaPrevia(tipo: "sandbox" | "assisted", c: Cenario, contactId: string | null) {
    const doGenerate = modelo(RESPOSTA, c.efeito === "altera" ? { produto: "camiseta azul", quantidade: 2 } : { produto: "camiseta azul" }, nomeNoModelo(c));
    const agent = (await m.loadAgentVersionConfig(pool, ORG, c.agente, c.versao))!;
    expect(agent.externalToolIds).toEqual([c.ferramenta]);
    const preview: Preview.TurnPreview = {
      kind: tipo,
      organizationId: ORG,
      runId: randomUUID(),
      agent,
      contactId,
      channelId: c.sessao,
      context: m.preview.scenarioContext([{ direction: "inbound", body: "Quero fechar o pedido da camiseta azul.", sent_at: "2026-07-30T14:50:00Z" }]),
      result: m.preview.newPreviewResult(),
    };
    await m.runAgentPreview(
      {
        crmCfg: { supabase: {} as never },
        llmCfg: { anthropicApiKey: "fake-local" },
        knobs: knobsDaPrevia(),
        log: m.createLogger(),
        clock: () => AGORA,
        embed: async () => ({ embedding: Array(1536).fill(0.1), promptTokens: 0, model: "x" }),
        registry: m.createFakeRegistry(async (o) => (await doGenerate(o as never)) as never),
        ferramentasExternas: FERRAMENTAS_EXTERNAS,
      } as never,
      pool,
      preview,
    );
    return preview;
  }

  it("aba Teste: a chamada MCP NÃO sai nem abre pedido — aparece como «seria feita», dizendo que pediria aprovação", async () => {
    const servidor = await servidorComOpcoes();
    const A = CENARIOS.altera!;
    const preview = await rodaPrevia("sandbox", A, null);
    expect(servidor.recebidos, "a aba Teste chamou o servidor MCP de verdade").toHaveLength(0);
    expect(await pedidosGravados()).toHaveLength(0);
    expect(preview.result.externalCalls).toEqual([
      {
        tool: nomeNoModelo(A),
        name: "Criar pedido",
        arguments: { produto: "camiseta azul", quantidade: 2 },
        executed: false,
        effect: "altera",
        wouldAskApproval: true,
      },
    ]);
    expect(retornoDa(nomeNoModelo(A))).toContain("nao_executada_em_teste");
    expect(await auditoriaDaChamada()).toHaveLength(0);
  });

  it("modo Assistido: até a consulta MCP espera aprovação; nada sai para o servidor", async () => {
    const servidor = await servidorComOpcoes();
    const C = CENARIOS.consulta!;
    const alvo = await conversaCom(C.sessao);
    const preview = await rodaPrevia("assisted", C, alvo.contato);
    expect(servidor.recebidos, "o rascunho do modo Assistido chamou o servidor sem aprovação").toHaveLength(0);
    const linhas = await pedidosGravados();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ tool_id: C.ferramenta, status: "pending", origin: "assisted" });
    expect(retornoDa(nomeNoModelo(C))).toContain("awaiting_approval");
    expect(preview.result.externalCalls ?? []).toHaveLength(0);
  });
});

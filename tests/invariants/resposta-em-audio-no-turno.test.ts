import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import pg from "pg";

import type * as InboundTurn from "@/lib/agent-engine/agent/inbound-turn";
import type * as Providers from "@/lib/agent-engine/edge/llm/providers";
import type * as Queue from "@/lib/agent-engine/queue/queue";
import type * as ObsLogger from "@/lib/agent-engine/obs/logger";

/**
 * A RESPOSTA EM ÁUDIO NO TURNO COMPLETO (issue #91) — o ponto de teste A da #86:
 * da versão publicada do agente até o que o canal recebe.
 *
 * Harness igual ao de `agent-send-template-turn.test.ts`: `createInboundTurnHandler`
 * real, modelo fake, canal que CAPTURA em vez de enviar — e, aqui, um endpoint de
 * voz DE VERDADE (servidor HTTP efêmero), porque o que se mede é o que sai pela
 * rede e a ordem: o provedor de voz só é chamado DEPOIS de a cadeia de
 * conferências aprovar o texto.
 *
 * O que cada caso prova:
 *   1. cliente mandou áudio → o canal recebe a NOTA DE VOZ (tipo áudio, na pasta
 *      da conversa), com o TEXTO da resposta como corpo; o provedor recebeu o
 *      texto exato e a chave do cliente; o uso foi registrado em `llm_calls`;
 *   2. cliente escreveu → texto, e o provedor NEM é chamado;
 *   3. provedor sem créditos → cai em TEXTO (o cliente não fica sem resposta) e a
 *      falha fica registrada para a tela de configuração;
 *   4. a conferência veta (janela de 24h) → NADA é enviado e o provedor NEM é
 *      chamado: áudio nunca contorna a cadeia;
 *   5. agente com a opção desligada (o padrão) → texto, sem tocar no provedor.
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
const CONTACT = "eeeeeeee-0000-4000-8000-000000000002";
/** Número com agente de áudio LIGADO (canal sem janela de 24h). */
const SESSION_LIVRE = "eeeeeeee-0000-4000-8000-000000000003";
/** Número com agente de áudio LIGADO em canal que EXIGE modelo fora da janela de 24h. */
const SESSION_JANELA = "eeeeeeee-0000-4000-8000-000000000013";
/** Número cujo agente NÃO pediu áudio (o padrão de todo agente que já existia). */
const SESSION_SEM_AUDIO = "eeeeeeee-0000-4000-8000-000000000023";
const AGENTE_LIVRE = "eeeeeeee-0000-4000-8000-000000000004";
const VERSAO_LIVRE = "eeeeeeee-0000-4000-8000-000000000005";
const AGENTE_JANELA = "eeeeeeee-0000-4000-8000-000000000014";
const VERSAO_JANELA = "eeeeeeee-0000-4000-8000-000000000015";
const AGENTE_SEM_AUDIO = "eeeeeeee-0000-4000-8000-000000000024";
const VERSAO_SEM_AUDIO = "eeeeeeee-0000-4000-8000-000000000025";

const AGORA = new Date("2026-07-30T15:00:00Z");
const CHAVE_DE_VOZ = "chave-de-voz-do-cliente-0001";
const RESPOSTA = "Claro, posso ajudar com a sua avaliação. Qual dia fica melhor para você?";
const MP3 = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0x21, 0xff, 0xfb, 0x90, 0x00]);
const OGG = Buffer.from("OggS-de-mentira");

interface EnvioCapturado {
  body: string;
  media?: { storagePath: string; mime: string; kind?: "image" | "audio" };
  seq: number;
}

type Modules = {
  createInboundTurnHandler: typeof InboundTurn.createInboundTurnHandler;
  queue: typeof Queue;
  createLogger: typeof ObsLogger.createLogger;
  createFakeRegistry: typeof Providers.createFakeRegistry;
};
let m: Modules;

let enviados: EnvioCapturado[] = [];
let guardados: Array<{ caminho: string; mime: string; bytes: string }> = [];
let resultadosVistos: unknown[] = [];

// ── O endpoint de voz de verdade ─────────────────────────────────────────────
let servidor: http.Server;
let base: string;
let pedidosDeVoz: Array<{ url: string; autorizacao: string | undefined; corpo: string }> = [];
let respostaDaVoz: { status: number; tipo: string; corpo: Buffer | string } = {
  status: 200,
  tipo: "audio/mpeg",
  corpo: MP3,
};

const CHECKPOINT = JSON.stringify({
  commitments: [],
  objections: [],
  next_action: null,
  rolling_summary: "turno de teste",
});

const USO = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

/** Modelo fake que chama `send_message` UMA vez e só então encerra com o checkpoint. */
function modeloQueResponde(corpo: string) {
  let chamou = false;
  return async (opts: { prompt?: unknown }) => {
    const msgs = (opts.prompt ?? []) as Array<{ role: string; content?: unknown }>;
    for (const msg of msgs) {
      if (!Array.isArray(msg.content)) continue;
      for (const parte of msg.content as Array<Record<string, unknown>>) {
        if (parte.type === "tool-result") resultadosVistos.push(parte.output ?? parte);
      }
    }
    if (!chamou) {
      chamou = true;
      return {
        content: [
          { type: "tool-call" as const, toolCallId: "c1", toolName: "send_message", input: JSON.stringify({ body: corpo }) },
        ],
        finishReason: { unified: "tool-calls" as const, raw: undefined },
        usage: USO,
        warnings: [],
      };
    }
    return {
      content: [{ type: "text" as const, text: CHECKPOINT }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: USO,
      warnings: [],
    };
  };
}

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
      breaker: {
        exactFailureWarn: 2,
        exactFailureBlock: 5,
        sameToolFailureWarn: 3,
        sameToolFailureHalt: 8,
        noProgressWarn: 3,
        noProgressBlock: 5,
      },
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
    // Quinta, 12h BRT: dentro da janela anti-ban (7h-22h).
    clock: () => AGORA,
    sleep: async () => {},
    // O endpoint de voz de verdade; a chave do cliente, o ffmpeg e o Storage entram por aqui.
    respostaEmAudio: {
      fetch,
      chaveConfigurada: async () => true,
      lerChave: async () => CHAVE_DE_VOZ,
      converter: async () => ({ buffer: OGG, mime: "audio/ogg;codecs=opus" }),
      guardar: async (caminho, nota) => {
        guardados.push({ caminho, mime: nota.mime, bytes: nota.buffer.toString() });
      },
    },
  });
}

async function rodaTurno(
  handler: ReturnType<typeof montaHandler>,
  alvo: { conv: string; sessao: string; msg: string },
): Promise<Error | null> {
  // O PG efêmero é compartilhado: neutraliza jobs alheios para o claim FIFO pegar o deste.
  await pool.query("update job_queue set status = 'done' where status = 'pending'");
  const { job } = await m.queue.enqueueJob(pool, ORG, {
    kind: "inbound_turn",
    leadId: CONTACT,
    payload: {
      conversation_id: alvo.conv,
      contact_id: CONTACT,
      channel_session_id: alvo.sessao,
      inbound_message_id: alvo.msg,
      crm_event_id: randomUUID(),
    },
    maxAttempts: 1,
  });
  const [claimed] = await m.queue.claimJobs(pool, { workerId: "audio", maxConcurrency: 1 });
  expect(claimed?.id).toBe(job.id);
  try {
    await handler(claimed!, pool, { workerId: "audio" });
    await m.queue.completeJob(pool, claimed!.id, "audio");
    return null;
  } catch (err) {
    await m.queue.failJob(pool, claimed!.id, "audio", err);
    return err as Error;
  }
}

/** Uma conversa nova numa sessão, com a última mensagem do cliente no formato pedido. */
async function conversaCom(
  sessao: string,
  formato: "audio" | "texto",
  opcoes: { ultimaMensagemHa?: number } = {},
): Promise<{ conv: string; sessao: string; msg: string }> {
  const conv = randomUUID();
  const msg = randomUUID();
  const quando = new Date(AGORA.getTime() - (opcoes.ultimaMensagemHa ?? 0.02) * 3_600_000);
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group, last_inbound_at)
     values ($1,$2,$3,$4,'ai_handling',false,$5)`,
    [conv, ORG, CONTACT, sessao, quando],
  );
  if (formato === "audio") {
    await pool.query(
      `insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
         type, direction, status, body, media_storage_path, media_mime,
         media_derived_text, media_derived_status, sent_via, sent_at)
       values ($1,$2,$3,$4,$5,'audio','inbound','delivered',null,$6,'audio/ogg',
               'Oi, queria marcar uma avaliação', 'ready', 'external_device', $7)`,
      [msg, ORG, conv, sessao, CONTACT, `${ORG}/${conv}/entrada.ogg`, quando],
    );
  } else {
    await pool.query(
      `insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
         type, direction, status, body, sent_via, sent_at)
       values ($1,$2,$3,$4,$5,'text','inbound','delivered','Oi, queria marcar uma avaliação','external_device',$6)`,
      [msg, ORG, conv, sessao, CONTACT, quando],
    );
  }
  return { conv, sessao, msg };
}

async function usosDaVoz() {
  return (
    await pool.query<{ provider: string; model: string; input_tokens: number; status: string; error_code: string | null }>(
      `select provider, model, input_tokens, status, error_code
         from llm_calls where organization_id = $1 and purpose = 'voice_reply' order by created_at`,
      [ORG],
    )
  ).rows;
}

beforeAll(async () => {
  servidor = http.createServer((req, res) => {
    const partes: Buffer[] = [];
    req.on("data", (c: Buffer) => partes.push(c));
    req.on("end", () => {
      pedidosDeVoz.push({
        url: req.url ?? "",
        autorizacao: req.headers.authorization,
        corpo: Buffer.concat(partes).toString("utf8"),
      });
      res.writeHead(respostaDaVoz.status, { "content-type": respostaDaVoz.tipo });
      res.end(respostaDaVoz.corpo);
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;

  m = {
    createInboundTurnHandler: (await import("@/lib/agent-engine/agent/inbound-turn")).createInboundTurnHandler,
    queue: await import("@/lib/agent-engine/queue/queue"),
    createLogger: (await import("@/lib/agent-engine/obs/logger")).createLogger,
    createFakeRegistry: (await import("@/lib/agent-engine/edge/llm/providers")).createFakeRegistry,
  };

  // A organização: resposta em áudio LIGADA, com o aceite, apontando para o endpoint de verdade.
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name, settings)
     values ($1,'resposta-em-audio','Resposta em Audio','Resposta em Audio', $2::jsonb)
     on conflict (id) do update set settings = excluded.settings`,
    [
      ORG,
      JSON.stringify({
        resposta_em_audio: {
          ligado: true,
          provedor: "openai_compativel",
          endereco: `${base}/v1`,
          aceite: { em: AGORA.toISOString(), por: randomUUID() },
        },
      }),
    ],
  );
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number)
     values ($1,$2,'Lead de Audio','+5511900000555') on conflict (id) do nothing`,
    [CONTACT, ORG],
  );
  // Canal por QR code (sem janela de 24h)…
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1,$2,'audio-livre','WORKING','\\x00'::bytea),
            ($3,$2,'audio-sem-opcao','WORKING','\\x00'::bytea) on conflict (id) do nothing`,
    [SESSION_LIVRE, ORG, SESSION_SEM_AUDIO],
  );
  // …e canal oficial (exige modelo aprovado fora da janela de 24h).
  await pool.query(
    `insert into channel_sessions (id, organization_id, provider, meta_phone_number_id, meta_waba_id, status, webhook_secret_encrypted)
     values ($1,$2,'meta_cloud','444','555','WORKING','\\x00'::bytea) on conflict (id) do nothing`,
    [SESSION_JANELA, ORG],
  );

  const agentes: Array<[string, string, string, boolean]> = [
    [AGENTE_LIVRE, VERSAO_LIVRE, SESSION_LIVRE, true],
    [AGENTE_JANELA, VERSAO_JANELA, SESSION_JANELA, true],
    [AGENTE_SEM_AUDIO, VERSAO_SEM_AUDIO, SESSION_SEM_AUDIO, false],
  ];
  for (const [agente, versao, sessao, audio] of agentes) {
    await pool.query(
      `insert into ai_agents (id, organization_id, name, system_prompt)
       values ($1,$2,'Agente de áudio','você atende quem escreve') on conflict (id) do nothing`,
      [agente, ORG],
    );
    await pool.query(
      `insert into ai_agent_versions (id, organization_id, agent_id, version_number, system_prompt,
                                      provider, model, channel_session_id, status, published_at,
                                      audio_reply_enabled)
       values ($1,$2,$3,1,'você atende quem escreve','anthropic','claude-sonnet-4-6',$4,'published',now(),$5)
       on conflict (id) do nothing`,
      [versao, ORG, agente, sessao, audio],
    );
    await pool.query(`update ai_agents set published_version_id = $1 where id = $2`, [versao, agente]);
  }

  await pool.query(
    `with v as (
       insert into playbook_versions (organization_id, layer, content)
       select null, 'platform', E'## Identidade\nAssistente de teste.'
       where not exists (select 1 from playbook_pointers where organization_id is null and layer = 'platform')
       returning id)
     insert into playbook_pointers (organization_id, layer, version_id)
     select null, 'platform', id from v`,
  );
});

afterAll(async () => {
  servidor.closeAllConnections();
  await new Promise<void>((ok) => servidor.close(() => ok()));
  await pool.end();
});

beforeEach(async () => {
  enviados = [];
  guardados = [];
  resultadosVistos = [];
  pedidosDeVoz = [];
  respostaDaVoz = { status: 200, tipo: "audio/mpeg", corpo: MP3 };
  await pool.query("delete from llm_calls where organization_id = $1 and purpose = 'voice_reply'", [ORG]);
});

describe("turno completo — resposta em áudio", () => {
  it("o cliente mandou áudio: o canal recebe a NOTA DE VOZ, com o texto da resposta como corpo", async () => {
    const alvo = await conversaCom(SESSION_LIVRE, "audio");
    const erro = await rodaTurno(montaHandler(modeloQueResponde(RESPOSTA)), alvo);
    expect(erro).toBeNull();

    // UMA mensagem física, do tipo áudio, na pasta DESTA conversa.
    expect(enviados).toHaveLength(1);
    const envio = enviados[0]!;
    expect(envio.media).toMatchObject({ kind: "audio", mime: "audio/ogg;codecs=opus" });
    expect(envio.media!.storagePath.startsWith(`${ORG}/${alvo.conv}/`)).toBe(true);
    // O texto é SEMPRE o que fica gravado na conversa.
    expect(envio.body).toBe(RESPOSTA);

    // O provedor recebeu exatamente o texto aprovado, com a chave DO CLIENTE.
    expect(pedidosDeVoz).toHaveLength(1);
    expect(pedidosDeVoz[0]!.url).toBe("/v1/audio/speech");
    expect(pedidosDeVoz[0]!.autorizacao).toBe(`Bearer ${CHAVE_DE_VOZ}`);
    expect(JSON.parse(pedidosDeVoz[0]!.corpo).input).toBe(RESPOSTA);

    // O arquivo foi guardado no caminho que o canal recebeu.
    expect(guardados).toEqual([{ caminho: envio.media!.storagePath, mime: "audio/ogg;codecs=opus", bytes: OGG.toString() }]);

    // E o custo apareceu no uso de IA da organização (voz cobra por caractere).
    const usos = await usosDaVoz();
    expect(usos).toHaveLength(1);
    expect(usos[0]).toMatchObject({ provider: "openai_compativel", input_tokens: RESPOSTA.length, status: "ok" });
  });

  it("o cliente escreveu: a resposta sai em TEXTO e o provedor de voz nem é chamado", async () => {
    const alvo = await conversaCom(SESSION_LIVRE, "texto");
    const erro = await rodaTurno(montaHandler(modeloQueResponde(RESPOSTA)), alvo);
    expect(erro).toBeNull();

    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.media).toBeUndefined();
    expect(enviados[0]!.body).toBe(RESPOSTA);
    expect(pedidosDeVoz).toHaveLength(0);
    expect(await usosDaVoz()).toHaveLength(0);
  });

  it("provedor sem créditos: CAI EM TEXTO — o cliente não fica sem resposta — e a falha fica registrada", async () => {
    respostaDaVoz = {
      status: 429,
      tipo: "application/json",
      corpo: JSON.stringify({ error: { code: "insufficient_quota", message: "You exceeded your current quota" } }),
    };
    const alvo = await conversaCom(SESSION_LIVRE, "audio");
    const erro = await rodaTurno(montaHandler(modeloQueResponde(RESPOSTA)), alvo);
    expect(erro).toBeNull();

    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.media).toBeUndefined();
    expect(enviados[0]!.body).toBe(RESPOSTA);
    expect(guardados).toHaveLength(0);

    const usos = await usosDaVoz();
    expect(usos).toHaveLength(1);
    expect(usos[0]).toMatchObject({ status: "erro", error_code: "sem_creditos" });
  });

  it("a conferência veta (janela de 24h fechada): NADA é enviado e o provedor de voz NEM é chamado — áudio não contorna a cadeia", async () => {
    // 30 h desde a última mensagem do cliente: no canal oficial, texto livre é recusado.
    const alvo = await conversaCom(SESSION_JANELA, "audio", { ultimaMensagemHa: 30 });
    const erro = await rodaTurno(montaHandler(modeloQueResponde(RESPOSTA)), alvo);
    expect(erro).toBeNull();

    expect(enviados).toHaveLength(0);
    expect(pedidosDeVoz).toHaveLength(0);
    expect(guardados).toHaveLength(0);
    expect(await usosDaVoz()).toHaveLength(0);
    // O modelo foi avisado do veto (não é silêncio).
    expect(JSON.stringify(resultadosVistos)).toMatch(/janela|window/i);
  });

  it("agente com a opção desligada (o padrão): texto, e o provedor de voz nem é consultado", async () => {
    const alvo = await conversaCom(SESSION_SEM_AUDIO, "audio");
    const erro = await rodaTurno(montaHandler(modeloQueResponde(RESPOSTA)), alvo);
    expect(erro).toBeNull();

    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.media).toBeUndefined();
    expect(pedidosDeVoz).toHaveLength(0);
  });

  it("organização com o recurso desligado: texto, mesmo com o agente pedindo áudio", async () => {
    await pool.query(
      `update organizations set settings = jsonb_set(settings, '{resposta_em_audio,ligado}', 'false'::jsonb) where id = $1`,
      [ORG],
    );
    try {
      const alvo = await conversaCom(SESSION_LIVRE, "audio");
      const erro = await rodaTurno(montaHandler(modeloQueResponde(RESPOSTA)), alvo);
      expect(erro).toBeNull();
      expect(enviados).toHaveLength(1);
      expect(enviados[0]!.media).toBeUndefined();
      expect(pedidosDeVoz).toHaveLength(0);
    } finally {
      await pool.query(
        `update organizations set settings = jsonb_set(settings, '{resposta_em_audio,ligado}', 'true'::jsonb) where id = $1`,
        [ORG],
      );
    }
  });
});

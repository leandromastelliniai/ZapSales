/**
 * PONTO DE TESTE A DA #86 — da VERSÃO PUBLICADA do agente até o TURNO, com modelo
 * falso (issue #89: perfil guiado e temperatura funcional).
 *
 * O que o dono preenche no formulário (persona, tom, objetivo, boas-vindas,
 * idioma) e o que ele deixa em "avançado" (temperatura) moram na versão. Esta
 * prova mede o que SAI do outro lado: o que o modelo recebeu, de verdade, no
 * turno — não o que a tela ou o loader dizem que mandariam.
 *
 * Quatro coisas, cada uma com o seu controle:
 *   1. perfil preenchido → o modelo recebe a seção do perfil + o prompt livre;
 *   2. agente SEM perfil → o modelo recebe o prompt de sempre, sem seção nenhuma
 *      (a promessa "agente existente não muda até ser editado");
 *   3. temperatura da versão → chega à chamada ao modelo;
 *   4. temperatura em branco → a chamada sai como saía (sem temperatura, ou a da
 *      organização, quando ela configurou uma).
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadAgentVersionConfig } from "@/lib/agent-engine/agent/agent-config";
import { runAgentPreview } from "@/lib/agent-engine/agent/inbound-turn";
import {
  newPreviewResult,
  scenarioContext,
  type TurnPreview,
} from "@/lib/agent-engine/agent/preview";
import { turnKnobsFromEnv } from "@/lib/agent-engine/agent/turn-knobs";
import { createFakeRegistry } from "@/lib/agent-engine/edge/llm/providers";
import { loadEnv } from "@/lib/agent-engine/env";
import { createLogger } from "@/lib/agent-engine/obs/logger";

import { replyFixture } from "../support/autonomia-fixture";
import { seedGov } from "./gov-helpers";

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 4,
});

beforeAll(async () => {
  await seedGov();
  await pool.query(
    `with v as(insert into playbook_versions(organization_id,layer,content) select null,'platform','## Identidade: Assistente de teste.' where not exists(select 1 from playbook_pointers where organization_id is null and layer='platform') returning id) insert into playbook_pointers(organization_id,layer,version_id) select null,'platform',id from v`,
  );
});
afterAll(() => pool.end());

/** Cada chamada ao modelo: o texto do `system` e a temperatura recebida. */
interface Chamada {
  system: string;
  temperature: number | undefined;
}

function deps(chamadas: Chamada[]) {
  const knobs = turnKnobsFromEnv(
    loadEnv({
      NODE_ENV: "test",
      SUPABASE_DB_URL: "postgresql://postgres:postgres@localhost/postgres",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
    }),
  );
  delete knobs.stageClassifier;
  delete knobs.jailbreak;
  delete knobs.promiseSemantic;
  delete knobs.compaction;
  return {
    crmCfg: { supabase: createClient("http://127.0.0.1:1", "test-key") },
    llmCfg: { anthropicApiKey: "fake-local" },
    knobs,
    log: createLogger(),
    clock: () => new Date("2026-09-07T15:00:00Z"),
    embed: async () => ({ embedding: Array(1536).fill(0.1), promptTokens: 0, model: "x" }),
    registry: createFakeRegistry(async (options) => {
      const system = options.prompt
        .filter((m) => m.role === "system")
        .map((m) => String(m.content))
        .join("\n");
      chamadas.push({ system, temperature: options.temperature });
      const jaEnviou = options.prompt
        .filter((m) => m.role === "tool")
        .flatMap((m) => m.content)
        .some((r) => "toolName" in r && r.toolName === "send_message");
      const content =
        options.tools?.length && !jaEnviou
          ? [
              {
                type: "tool-call" as const,
                toolCallId: randomUUID(),
                toolName: "send_message",
                input: JSON.stringify({ body: "O atendimento começa às nove horas." }),
              },
            ]
          : [
              {
                type: "text" as const,
                text: JSON.stringify({
                  rolling_summary: "Resumo",
                  commitments: [],
                  objections: [],
                  next_action: null,
                }),
              },
            ];
      return {
        content,
        finishReason: {
          unified: content[0]?.type === "tool-call" ? ("tool-calls" as const) : ("stop" as const),
          raw: undefined,
        },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      };
    }),
  };
}

async function rodarOTurno(f: Awaited<ReturnType<typeof replyFixture>>): Promise<Chamada[]> {
  const chamadas: Chamada[] = [];
  const agent = (await loadAgentVersionConfig(pool, f.org, f.agent, f.version))!;
  const preview: TurnPreview = {
    kind: "sandbox",
    organizationId: f.org,
    runId: randomUUID(),
    agent,
    contactId: null,
    channelId: f.channel,
    context: scenarioContext([
      { direction: "inbound", body: "Qual o horário?", sent_at: "2026-09-07T14:00:00Z" },
    ]),
    result: newPreviewResult(),
  };
  await runAgentPreview(deps(chamadas), pool, preview);
  expect(preview.result.candidates, "o turno tem de chegar a uma resposta").toHaveLength(1);
  return chamadas;
}

/**
 * A versão publicada é imutável (trigger da 0051), então o ajuste de conteúdo do
 * cenário passa por rascunho — exatamente o caminho que o produto obriga.
 */
async function ajustarVersao(f: { version: string }, atribuicoes: string) {
  await pool.query(`update ai_agent_versions set status='draft' where id=$1`, [f.version]);
  await pool.query(`update ai_agent_versions set ${atribuicoes} where id=$1`, [f.version]);
  await pool.query(`update ai_agent_versions set status='published' where id=$1`, [f.version]);
}

/** As chamadas do agente (as que levam o prompt dele) — o resto é auxiliar. */
const doTurno = (chamadas: Chamada[]) =>
  chamadas.filter((c) => c.system.includes("Ajude com informações confirmadas."));

describe("perfil guiado e temperatura: da versão publicada até o turno", () => {
  it("perfil preenchido: o modelo recebe a seção do perfil composta com o prompt livre", async () => {
    const f = await replyFixture(pool);
    await ajustarVersao(
      f,
      `profile_persona='Marina, recepcionista da Clínica Sorriso',
       profile_tone='descontraido',
       profile_objective='Marcar a avaliação gratuita',
       profile_welcome='Oi! Eu sou a Marina 😊',
       profile_language='es'`,
    );
    const chamadas = doTurno(await rodarOTurno(f));
    expect(chamadas.length).toBeGreaterThan(0);
    for (const c of chamadas) {
      expect(c.system).toContain("## Perfil do agente");
      expect(c.system).toContain("- Persona: Marina, recepcionista da Clínica Sorriso");
      expect(c.system).toContain("- Tom de voz: descontraído");
      expect(c.system).toContain("- Objetivo: Marcar a avaliação gratuita");
      expect(c.system).toContain("Oi! Eu sou a Marina 😊");
      expect(c.system).toContain("responda sempre em español");
      // E o prompt livre continua lá, depois do perfil.
      expect(c.system.indexOf("## Instruções")).toBeGreaterThan(
        c.system.indexOf("## Perfil do agente"),
      );
      expect(c.system).toContain("Ajude com informações confirmadas.");
    }
  });

  it("agente SEM perfil: recebe o prompt de sempre, sem seção de perfil (controle)", async () => {
    const f = await replyFixture(pool);
    const chamadas = doTurno(await rodarOTurno(f));
    expect(chamadas.length).toBeGreaterThan(0);
    for (const c of chamadas) {
      expect(c.system).toContain("Ajude com informações confirmadas.");
      expect(c.system).not.toContain("## Perfil do agente");
      expect(c.system).not.toContain("## Instruções");
    }
  });

  it("temperatura da versão chega à chamada ao modelo", async () => {
    const f = await replyFixture(pool);
    await ajustarVersao(f, `temperature=0.3`);
    const chamadas = doTurno(await rodarOTurno(f));
    expect(chamadas.length).toBeGreaterThan(0);
    expect(chamadas.map((c) => c.temperature)).toEqual(chamadas.map(() => 0.3));
  });

  it("temperatura em branco: a chamada sai como saía — sem temperatura (controle)", async () => {
    const f = await replyFixture(pool);
    const chamadas = doTurno(await rodarOTurno(f));
    expect(chamadas.length).toBeGreaterThan(0);
    expect(chamadas.map((c) => c.temperature)).toEqual(chamadas.map(() => undefined));
  });

  it("temperatura em branco herda a da organização; a do agente vence a da organização", async () => {
    const f = await replyFixture(pool);
    await pool.query(
      `update organizations set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{llm}', '{"params":{"temperature":0.9}}'::jsonb) where id=$1`,
      [f.org],
    );
    const herdada = doTurno(await rodarOTurno(f));
    expect(herdada.map((c) => c.temperature)).toEqual(herdada.map(() => 0.9));

    await ajustarVersao(f, `temperature=0.2`);
    const propria = doTurno(await rodarOTurno(f));
    expect(propria.map((c) => c.temperature)).toEqual(propria.map(() => 0.2));
  });
});

describe("perfil guiado e temperatura: o banco guarda o que a tela promete", () => {
  const COLUNAS_DO_PERFIL: Array<[string, unknown]> = [
    ["profile_persona", "Outra persona"],
    ["profile_tone", "formal"],
    ["profile_objective", "Outro objetivo"],
    ["profile_welcome", "Outra boas-vindas"],
    ["profile_language", "en"],
    ["temperature", 0.5],
  ];

  it.each(COLUNAS_DO_PERFIL)(
    "%s não muda numa versão PUBLICADA (rascunho novo é o caminho)",
    async (coluna, valor) => {
      const f = await replyFixture(pool);
      await expect(
        pool.query(`update ai_agent_versions set ${coluna} = $2 where id = $1`, [f.version, valor]),
      ).rejects.toThrow(/imutável/);
    },
  );

  it("rascunho aceita o perfil completo; o banco recusa tom, idioma e temperatura fora do vocabulário", async () => {
    const f = await replyFixture(pool);
    await ajustarVersao(f, `profile_tone='normal', profile_language='pt-BR', temperature=1`);
    await pool.query(`update ai_agent_versions set status='draft' where id=$1`, [f.version]);
    for (const [coluna, valor] of [
      ["profile_tone", "irritado"],
      ["profile_language", "fr"],
      ["temperature", 1.5],
      ["temperature", -0.1],
    ] as const) {
      await expect(
        pool.query(`update ai_agent_versions set ${coluna} = $2 where id = $1`, [f.version, valor]),
        `${coluna}=${valor} devia ser recusado`,
      ).rejects.toThrow(/check/i);
    }
  });
});

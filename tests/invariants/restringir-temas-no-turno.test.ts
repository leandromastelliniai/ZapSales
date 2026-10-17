/**
 * PONTO DE TESTE A DA #86 — da VERSÃO PUBLICADA do agente até o TURNO, com modelo
 * falso (issue #92: restringir temas e modelos prontos por ramo).
 *
 * "Restringir temas" é dado da versão (`restrict_topics`, `allowed_topics`,
 * `off_topic_reply`) e vira instrução na COMPOSIÇÃO (`comporInstrucoes`), não uma
 * conferência nova. Esta prova mede o que SAI do outro lado, no turno:
 *
 *   1. restrição ligada → o modelo recebe a seção de assuntos, com a resposta padrão;
 *   2. pergunta FORA do tema → a resposta padrão é a que sai (modelo falso que
 *      obedece à instrução, como o real deve);
 *   3. pergunta DENTRO do tema → resposta normal (o modelo falso só recusa o que é
 *      de fora);
 *   4. chave desligada, ou agente sem restrição → o modelo recebe o prompt de
 *      sempre (controle: "agente existente não muda");
 *   5. as conferências antes do envio são as MESMAS, na mesma ordem, com e sem
 *      restrição — a restrição não cria nem altera nenhuma;
 *   6. a resposta padrão que cada MODELO PRONTO sugere, nos três idiomas, passa
 *      pelas conferências (um modelo cuja recusa o próprio produto veta seria um
 *      defeito de fábrica);
 *   7. a trava de imutabilidade e o banco cobrem as colunas novas.
 *
 * Pedido de atendente humano e opt-out NÃO passam pelo modelo: são detectados em
 * código antes do turno (`detectHumanHandoffRequest`, `lib/opt-out`) e valem com
 * a restrição ligada ou não — a composição os declara exceção em texto, e os
 * testes unitários de `perfil.test.ts` e dos detectores cobrem cada lado.
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
import { IDS_DE_MODELO, aplicarModelo } from "@/lib/ai/agents/modelos";
import { IDIOMAS_DO_AGENTE } from "@/lib/ai/agents/perfil";

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

const RESPOSTA_NORMAL = "O atendimento começa às nove horas.";
const PERGUNTA_DENTRO = "Qual o horário de atendimento?";
const PERGUNTA_FORA = "Quem ganhou o jogo de futebol ontem?";
const MARCA_DA_RESPOSTA_PADRAO = "responda exatamente com esta mensagem: ";

interface Chamada {
  system: string;
}

/**
 * O modelo falso OBEDECE à instrução que recebe, como o real deve: se o `system`
 * traz a seção de assuntos e a pergunta é de fora, responde com a mensagem padrão
 * que a própria instrução manda usar; senão, a resposta normal. `respostaForcada`
 * troca a saída (usada para passar a recusa de cada modelo pronto pelas conferências).
 */
function deps(chamadas: Chamada[], respostaForcada?: string) {
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
      chamadas.push({ system });
      const conversa = JSON.stringify(options.prompt.filter((m) => m.role !== "system"));
      const jaEnviou = options.prompt
        .filter((m) => m.role === "tool")
        .flatMap((m) => m.content)
        .some((r) => "toolName" in r && r.toolName === "send_message");

      let body = RESPOSTA_NORMAL;
      if (respostaForcada !== undefined) body = respostaForcada;
      else if (system.includes("## Assuntos permitidos") && conversa.includes("futebol")) {
        const i = system.indexOf(MARCA_DA_RESPOSTA_PADRAO);
        if (i >= 0) body = system.slice(i + MARCA_DA_RESPOSTA_PADRAO.length).split("\n")[0]!;
      }

      const content =
        options.tools?.length && !jaEnviou
          ? [
              {
                type: "tool-call" as const,
                toolCallId: randomUUID(),
                toolName: "send_message",
                input: JSON.stringify({ body }),
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

interface Turno {
  chamadas: Chamada[];
  preview: TurnPreview;
}

async function rodarOTurno(
  f: Awaited<ReturnType<typeof replyFixture>>,
  pergunta: string,
  respostaForcada?: string,
): Promise<Turno> {
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
      { direction: "inbound", body: pergunta, sent_at: "2026-09-07T14:00:00Z" },
    ]),
    result: newPreviewResult(),
  };
  await runAgentPreview(deps(chamadas, respostaForcada), pool, preview);
  return { chamadas, preview };
}

/** A versão publicada é imutável (0051): o ajuste de conteúdo passa por rascunho. */
async function ajustarVersao(
  f: { version: string },
  atribuicoes: string,
  valores: unknown[] = [],
) {
  await pool.query(`update ai_agent_versions set status='draft' where id=$1`, [f.version]);
  await pool.query(`update ai_agent_versions set ${atribuicoes} where id=$1`, [f.version, ...valores]);
  await pool.query(`update ai_agent_versions set status='published' where id=$1`, [f.version]);
}

const doTurno = (chamadas: Chamada[]) =>
  chamadas.filter((c) => c.system.includes("Ajude com informações confirmadas."));

const RESPOSTA_PADRAO = "Aqui só consigo ajudar com horários e valores da clínica.";

async function restringir(f: { version: string }) {
  await ajustarVersao(
    f,
    `restrict_topics=true, allowed_topics=$2::text[], off_topic_reply=$3`,
    [["Horários de atendimento", "Valores de consulta"], RESPOSTA_PADRAO],
  );
}

describe("restringir temas: da versão publicada até o turno", () => {
  it("restrição ligada: o modelo recebe a seção de assuntos e a resposta padrão, antes das instruções livres", async () => {
    const f = await replyFixture(pool);
    await restringir(f);
    const { chamadas } = await rodarOTurno(f, PERGUNTA_DENTRO);
    const doAgente = doTurno(chamadas);
    expect(doAgente.length).toBeGreaterThan(0);
    for (const c of doAgente) {
      expect(c.system).toContain("## Assuntos permitidos");
      expect(c.system).toContain("- Horários de atendimento");
      expect(c.system).toContain("- Valores de consulta");
      expect(c.system).toContain(RESPOSTA_PADRAO);
      expect(c.system.indexOf("## Assuntos permitidos")).toBeLessThan(c.system.indexOf("## Instruções"));
      expect(c.system).toContain("Ajude com informações confirmadas.");
    }
  });

  it("pergunta FORA do tema: sai a resposta padrão, e passa pelas conferências", async () => {
    const f = await replyFixture(pool);
    await restringir(f);
    const { preview } = await rodarOTurno(f, PERGUNTA_FORA);
    expect(preview.result.impediments).toEqual([]);
    expect(preview.result.candidates).toHaveLength(1);
    expect(preview.result.candidates[0]!.body).toBe(RESPOSTA_PADRAO);
  });

  it("pergunta DENTRO do tema: respondida normalmente", async () => {
    const f = await replyFixture(pool);
    await restringir(f);
    const { preview } = await rodarOTurno(f, PERGUNTA_DENTRO);
    expect(preview.result.candidates).toHaveLength(1);
    expect(preview.result.candidates[0]!.body).toBe(RESPOSTA_NORMAL);
  });

  it("chave DESLIGADA com a lista preenchida: o prompt é o de sempre e a pergunta de fora é respondida como antes (controle)", async () => {
    const f = await replyFixture(pool);
    await ajustarVersao(
      f,
      `restrict_topics=false, allowed_topics=$2::text[], off_topic_reply=$3`,
      [["Horários de atendimento"], RESPOSTA_PADRAO],
    );
    const { chamadas, preview } = await rodarOTurno(f, PERGUNTA_FORA);
    for (const c of doTurno(chamadas)) {
      expect(c.system).not.toContain("## Assuntos permitidos");
      expect(c.system).not.toContain("## Instruções");
    }
    expect(preview.result.candidates[0]!.body).toBe(RESPOSTA_NORMAL);
  });

  it("agente SEM restrição (nunca editado): o modelo recebe o prompt de sempre (controle)", async () => {
    const f = await replyFixture(pool);
    const { chamadas } = await rodarOTurno(f, PERGUNTA_DENTRO);
    expect(doTurno(chamadas).length).toBeGreaterThan(0);
    for (const c of doTurno(chamadas)) {
      expect(c.system).not.toContain("## Assuntos permitidos");
      expect(c.system).not.toContain("## Perfil do agente");
    }
  });

  it("as conferências antes do envio são as MESMAS, na mesma ordem, com e sem restrição", async () => {
    const livre = await replyFixture(pool);
    const sem = await rodarOTurno(livre, PERGUNTA_DENTRO);
    const restrito = await replyFixture(pool);
    await restringir(restrito);
    const com = await rodarOTurno(restrito, PERGUNTA_FORA);

    const gates = (t: Turno) => t.preview.result.candidates[0]!.trace.map((e) => e.gate);
    expect(gates(sem).length).toBeGreaterThan(0);
    expect(gates(com)).toEqual(gates(sem));
    // Nenhuma conferência de assunto foi acrescentada pela restrição.
    expect(gates(com).some((g) => /tema|topic|assunto/i.test(g))).toBe(false);
  });
});

describe("modelos prontos: a recusa que cada um sugere passa pelas conferências", () => {
  const casos = IDS_DE_MODELO.flatMap((id) => IDIOMAS_DO_AGENTE.map((idioma) => [id, idioma] as const));

  it.each(casos)("%s em %s", async (id, idioma) => {
    const campos = aplicarModelo(id, idioma);
    const f = await replyFixture(pool);
    const { preview } = await rodarOTurno(f, PERGUNTA_FORA, campos.off_topic_reply);
    expect(preview.result.impediments, `${id}/${idioma}: recusa vetada`).toEqual([]);
    expect(preview.result.candidates).toHaveLength(1);
    expect(preview.result.candidates[0]!.body).toBe(campos.off_topic_reply);
  });
});

describe("restringir temas: o banco guarda o que a tela promete", () => {
  const COLUNAS: Array<[string, unknown]> = [
    ["restrict_topics", true],
    ["allowed_topics", ["Outro assunto"]],
    ["off_topic_reply", "Outra resposta"],
  ];

  it.each(COLUNAS)(
    "%s não muda numa versão PUBLICADA (rascunho novo é o caminho)",
    async (coluna, valor) => {
      const f = await replyFixture(pool);
      await expect(
        pool.query(`update ai_agent_versions set ${coluna} = $2 where id = $1`, [f.version, valor]),
      ).rejects.toThrow(/imutável/);
    },
  );

  it("versão nova nasce SEM restrição: chave desligada, lista vazia, sem resposta (nada muda em quem já existe)", async () => {
    const f = await replyFixture(pool);
    const r = await pool.query(
      `select restrict_topics, allowed_topics, off_topic_reply from ai_agent_versions where id=$1`,
      [f.version],
    );
    expect(r.rows[0]).toEqual({ restrict_topics: false, allowed_topics: [], off_topic_reply: null });
  });

  it("o banco recusa mais de 20 assuntos e resposta com mais de 500 caracteres", async () => {
    const f = await replyFixture(pool);
    await pool.query(`update ai_agent_versions set status='draft' where id=$1`, [f.version]);
    await expect(
      pool.query(`update ai_agent_versions set allowed_topics = $2::text[] where id = $1`, [
        f.version,
        Array.from({ length: 21 }, (_, i) => `assunto ${i}`),
      ]),
    ).rejects.toThrow(/check/i);
    await expect(
      pool.query(`update ai_agent_versions set off_topic_reply = $2 where id = $1`, [
        f.version,
        "x".repeat(501),
      ]),
    ).rejects.toThrow(/check/i);
  });
});

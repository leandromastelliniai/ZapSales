import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testAgentVersion } from "@/lib/agent-engine/agent/sandbox";
import { turnKnobsFromEnv } from "@/lib/agent-engine/agent/turn-knobs";
import { createFakeRegistry } from "@/lib/agent-engine/edge/llm/providers";
import { LlmBudgetExceededError } from "@/lib/agent-engine/edge/llm/run-model-call";
import { loadEnv } from "@/lib/agent-engine/env";
import { createLogger } from "@/lib/agent-engine/obs/logger";

import { replyFixture } from "../support/autonomia-fixture";
import { seedGov } from "./gov-helpers";

/**
 * A conversa de teste de várias trocas (issue #90, ponto de teste A da #86).
 *
 * Mede pelo PREVIEW do agente com modelo falso e banco real — da versão do
 * agente até o turno —, que é onde as promessas da issue moram:
 *   - o contexto das trocas anteriores chega ao modelo;
 *   - a resposta passa pela cadeia real de conferências e traz tokens,
 *     custo e ferramentas;
 *   - nenhuma mensagem real, job, nota, checkpoint, contato ou conversa é
 *     criado ou alterado, e nada sai pela rede;
 *   - o custo do teste é gasto da organização, e o modo "bloquear" do
 *     orçamento recusa o teste como recusaria um turno.
 */
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 6,
});

beforeAll(async () => {
  await seedGov();
  await pool.query(
    `with v as(insert into playbook_versions(organization_id,layer,content) select null,'platform','## Identidade: Assistente de teste.' where not exists(select 1 from playbook_pointers where organization_id is null and layer='platform') returning id) insert into playbook_pointers(organization_id,layer,version_id) select null,'platform',id from v`,
  );
});
afterAll(() => pool.end());

/** O que o modelo falso viu, em ordem, para cada chamada. */
function deps(prompts: string[], corpoDaResposta: () => string) {
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
  return {
    crmCfg: { supabase: createClient("http://127.0.0.1:1", "test-key") },
    llmCfg: { anthropicApiKey: "fake-local", budgetEnforcement: "on" as const },
    knobs,
    log: createLogger(),
    clock: () => new Date("2026-09-07T15:00:00Z"),
    embed: async () => ({
      embedding: Array(1536).fill(0.1),
      promptTokens: 0,
      model: "text-embedding-3-small",
    }),
    registry: createFakeRegistry(async (options) => {
      prompts.push(JSON.stringify(options.prompt));
      const jaEnviou = options.prompt
        .filter((m) => m.role === "tool")
        .flatMap((m) => m.content)
        .some((r) => "toolName" in r && r.toolName === "send_message");
      // Sem ferramentas: é um dos turnos internos (memória, compactação, fechamento),
      // e o fechamento exige um JSON de checkpoint válido.
      const texto = JSON.stringify(options.prompt);
      const semFerramentas = !options.tools?.length;
      const content = semFerramentas
        ? [
            {
              type: "text" as const,
              text: JSON.stringify(
                texto.includes("Turno interno de memória")
                  ? { notes: [] }
                  : texto.includes("Compacte a conversa")
                    ? { rolling_summary: "Resumo", commitments: [], objections: [], personal_data: [], stage: null }
                    : { rolling_summary: "Fechamento do cenário", commitments: [], objections: [], next_action: null },
              ),
            },
          ]
        : jaEnviou
          ? [{ type: "text" as const, text: "Concluído." }]
          : [
              {
                type: "tool-call" as const,
                toolCallId: randomUUID(),
                toolName: "send_message",
                input: JSON.stringify({ body: corpoDaResposta() }),
              },
            ];
      return {
        content,
        finishReason: {
          unified: content[0]?.type === "tool-call" ? ("tool-calls" as const) : ("stop" as const),
          raw: undefined,
        },
        usage: {
          inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 200, text: 200, reasoning: 0 },
        },
        warnings: [],
      };
    }),
  };
}

async function clientState(org: string) {
  return (
    await pool.query(
      `select jsonb_build_object('messages',(select count(*) from messages where organization_id=$1),'jobs',(select count(*) from job_queue where organization_id=$1),'notes',(select count(*) from lead_notes where organization_id=$1),'checkpoints',(select count(*) from lead_checkpoints where organization_id=$1),'ledger',(select count(*) from send_ledger where organization_id=$1),'contacts',(select jsonb_agg(to_jsonb(c)) from contacts c where organization_id=$1),'conversations',(select jsonb_agg(to_jsonb(c)) from conversations c where organization_id=$1),'leads',(select count(*) from crm_leads where organization_id=$1)) as state`,
      [org],
    )
  ).rows[0].state;
}

/**
 * Um modelo com preço conhecido: com 'test-model' o custo é nulo e a conta não prova
 * nada. A versão publicada é imutável, então o teste roda sobre um RASCUNHO novo — que
 * é, de resto, o que a aba Teste usa.
 */
async function comModeloComPreco(f: Awaited<ReturnType<typeof replyFixture>>): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into ai_agent_versions(id,organization_id,agent_id,version_number,system_prompt,provider,model,channel_session_id,status)
     values($1,$2,$3,2,'Ajude com informações confirmadas.','anthropic','claude-sonnet-4-6',$4,'draft')`,
    [id, f.org, f.agent, f.channel],
  );
  return id;
}

describe("conversa de teste de várias trocas — pelo preview do agente", () => {
  it("o que foi dito nas trocas anteriores chega ao modelo; sem histórico, não chega", async () => {
    const f = await replyFixture(pool);
    const entrada = (history: Array<{ role: "customer" | "agent"; text: string }>) => ({
      organizationId: f.org,
      agentId: f.agent,
      versionId: f.version,
      runId: randomUUID(),
      sampleMessage: "E quanto custa?",
      history,
      channelId: f.channel,
    });

    const comHistorico: string[] = [];
    await testAgentVersion(
      pool,
      deps(comHistorico, () => "O plano Pro custa R$ 99."),
      entrada([
        { role: "customer", text: "Oi, meu nome é Rodrigo e quero o plano Pro" },
        { role: "agent", text: "Olá Rodrigo! Já te explico o plano Pro." },
      ]),
    );
    const visto = comHistorico.join("\n");
    expect(visto).toContain("meu nome é Rodrigo e quero o plano Pro");
    expect(visto).toContain("Olá Rodrigo! Já te explico o plano Pro.");
    expect(visto).toContain("E quanto custa?");

    const semHistorico: string[] = [];
    await testAgentVersion(
      pool,
      deps(semHistorico, () => "O plano Pro custa R$ 99."),
      entrada([]),
    );
    expect(semHistorico.join("\n")).not.toContain("meu nome é Rodrigo");
  });

  it("a resposta passa pela cadeia de conferências e traz tokens, custo e ferramentas", async () => {
    const f = await replyFixture(pool);
    const versaoComPreco = await comModeloComPreco(f);
    const r = await testAgentVersion(
      pool,
      deps([], () => "O plano Pro custa R$ 99."),
      {
        organizationId: f.org,
        agentId: f.agent,
        versionId: versaoComPreco,
        runId: randomUUID(),
        sampleMessage: "Quanto custa o Pro?",
        history: [{ role: "customer", text: "Oi" }, { role: "agent", text: "Olá!" }],
        channelId: f.channel,
      },
    );

    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]!.body).toBe("O plano Pro custa R$ 99.");
    // a cadeia REAL avaliou o candidato (o trace não é vazio)
    expect(r.candidates[0]!.trace.length).toBeGreaterThan(0);
    expect(r.usage).toBeDefined();
    expect(r.usage!.tokensIn).toBeGreaterThanOrEqual(1000);
    expect(r.usage!.tokensOut).toBeGreaterThanOrEqual(200);
    expect(r.usage!.costCents).toBeGreaterThan(0);
    expect(r.toolCalls?.map((c) => c.tool)).toContain("send_message");

    // O gasto mostrado é o de TODAS as chamadas ao modelo do turno (principal, checkpoint,
    // conferências), e a fonte independente é a própria `llm_calls` da organização — a mesma
    // régua do orçamento. Somar só a chamada principal mostrava ~38% disto na produção.
    const { rows } = await pool.query(
      `select count(*)::int as chamadas, sum(cost_cents)::float8 as cents,
              sum(input_tokens)::int as tin, sum(output_tokens)::int as tout
         from llm_calls where organization_id=$1`,
      [f.org],
    );
    expect(rows[0].chamadas).toBeGreaterThanOrEqual(2);
    expect(r.usage!.costCents).toBeCloseTo(rows[0].cents, 6);
    expect(r.usage!.tokensIn).toBe(rows[0].tin);
    expect(r.usage!.tokensOut).toBe(rows[0].tout);
  });

  it("nenhuma mensagem real, job, nota, checkpoint, contato, conversa ou negócio é criado ou alterado, e nada sai pela rede", async () => {
    const f = await replyFixture(pool);
    const antes = await clientState(f.org);
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("preview_network_forbidden"));
    try {
      for (const sampleMessage of ["Oi", "Quanto custa?", "Fechado, quero comprar"]) {
        await testAgentVersion(
          pool,
          deps([], () => "Anotado."),
          {
            organizationId: f.org,
            agentId: f.agent,
            versionId: f.version,
            runId: randomUUID(),
            sampleMessage,
            history: [{ role: "customer", text: "Oi" }, { role: "agent", text: "Olá!" }],
            sampleContact: { name: "Maria do cenário", phone: "+15551234567" },
            channelId: f.channel,
          },
        );
      }
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
    expect(await clientState(f.org)).toEqual(antes);
    // o contato do cenário não virou contato real
    const { rows } = await pool.query(
      "select count(*)::int as n from contacts where organization_id=$1 and name ilike '%cenário%'",
      [f.org],
    );
    expect(rows[0].n).toBe(0);
  });

  it("o custo do teste entra no gasto de IA da organização (a mesma régua do orçamento)", async () => {
    const f = await replyFixture(pool);
    const versaoComPreco = await comModeloComPreco(f);
    const gasto = async () =>
      Number(
        (await pool.query("select public.fn_gasto_de_ia_do_mes($1) as g", [f.org])).rows[0].g,
      );
    const antes = await gasto();
    await testAgentVersion(
      pool,
      deps([], () => "Olá!"),
      {
        organizationId: f.org,
        agentId: f.agent,
        versionId: versaoComPreco,
        runId: randomUUID(),
        sampleMessage: "Oi",
        channelId: f.channel,
      },
    );
    expect(await gasto()).toBeGreaterThan(antes);
    const { rows } = await pool.query(
      "select count(*)::int as n from llm_calls where organization_id=$1 and purpose='agent_preview'",
      [f.org],
    );
    expect(rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it("no modo bloquear, com o teto atingido, o teste é recusado como um turno real seria", async () => {
    const f = await replyFixture(pool);
    const versaoComPreco = await comModeloComPreco(f);
    // O teto: US$ 1,00 (o piso), carência vencida, aviso já dado neste mês e gasto
    // acima do teto — as seis condições de `decidirOrcamento` para bloquear.
    await pool.query(
      `insert into ai_budgets(organization_id,monthly_limit_cents,enforcement_mode,enforcement_effective_at)
       values($1,100,'bloquear',now() - interval '1 day')
       on conflict (organization_id) do update
         set monthly_limit_cents=100, enforcement_mode='bloquear', enforcement_effective_at=now() - interval '1 day'`,
      [f.org],
    );
    await pool.query(
      `insert into agent_inbox_items(organization_id,kind,severity,title,body,ref_kind,ref_id,status)
       values($1,'budget_warning','warn','Aviso','corpo','ai_budget',$1,'resolved')`,
      [f.org],
    );
    await pool.query(
      `insert into llm_calls(organization_id,purpose,provider,model,input_tokens,output_tokens,cost_cents,status)
       values($1,'agent_turn','anthropic','claude-sonnet-4-6',1,1,500,'ok')`,
      [f.org],
    );

    const prompts: string[] = [];
    await expect(
      testAgentVersion(
        pool,
        deps(prompts, () => "Não deveria sair."),
        {
          organizationId: f.org,
          agentId: f.agent,
          versionId: versaoComPreco,
          runId: randomUUID(),
          sampleMessage: "Oi",
          channelId: f.channel,
        },
      ),
    ).rejects.toBeInstanceOf(LlmBudgetExceededError);
    // recusado ANTES do provedor: o modelo falso nem foi chamado
    expect(prompts).toHaveLength(0);
  });
});

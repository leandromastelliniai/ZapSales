import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GOV_MANAGER, GOV_ORG, seedGov } from "./gov-helpers";

/**
 * "Corrigir esta resposta" vira proposta (issue #90, migration 0547).
 *
 * O que o BANCO garante, e que a rota e a tela supõem:
 *   1. o tipo `response_correction` cabe no CHECK de `type` (sem ele, todo
 *      INSERT da rota levaria 23514);
 *   2. a correção de uma organização não aparece para outra (RLS) — duas
 *      organizações, e a da outra EXISTE (sem linha alheia, "não vazou" é
 *      verdade com ou sem RLS);
 *   3. apagar o agente leva as correções dele, e só elas: uma proposta da
 *      organização (`agent_id` nulo) sobrevive.
 */
const pool = new Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 4,
});
const q = (t: string, a: unknown[] = []) => pool.query(t, a);

async function comoUsuario(user: string, text: string, args: unknown[] = []) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("set local row_security = on");
    await c.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: user, aal: "aal1" }),
    ]);
    const r = await c.query(text, args);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

const OUTRA_ORG = randomUUID();
const AGENTE_DA_ORG = randomUUID();
const AGENTE_DA_OUTRA = randomUUID();
const AGENTE_APAGAVEL = randomUUID();
const PROPOSTA_DA_ORG = randomUUID();
const PROPOSTA_DA_OUTRA = randomUUID();
const CORRECAO_APAGAVEL = randomUUID();
const DO_FLYWHEEL = randomUUID();

async function novoAgente(org: string, id: string) {
  await q(
    "insert into ai_agents(id,organization_id,name,system_prompt,operation_mode) values($1,$2,$3,'Ajude.','assisted')",
    [id, org, `Agente ${id}`],
  );
}
async function novaProposta(
  org: string,
  id: string,
  type: string,
  agent: string | null,
) {
  await q(
    `insert into flywheel_distiller_proposals(id,organization_id,agent_id,run_id,dataset,type,target,content,evidence)
     values($1,$2,$3,gen_random_uuid(),'t',$4,'agent','Se o cliente disser algo como “x”, responda “y”.','{}')`,
    [id, org, agent, type],
  );
}

beforeAll(async () => {
  await seedGov();
  await q(
    "insert into organizations(id,legal_name,display_name,slug) values($1,'Outra','Outra',$2)",
    [OUTRA_ORG, `outra-${OUTRA_ORG}`],
  );
  await novoAgente(GOV_ORG, AGENTE_DA_ORG);
  await novoAgente(OUTRA_ORG, AGENTE_DA_OUTRA);
  await novoAgente(GOV_ORG, AGENTE_APAGAVEL);
  await novaProposta(GOV_ORG, PROPOSTA_DA_ORG, "response_correction", AGENTE_DA_ORG);
  await novaProposta(OUTRA_ORG, PROPOSTA_DA_OUTRA, "response_correction", AGENTE_DA_OUTRA);
  await novaProposta(GOV_ORG, CORRECAO_APAGAVEL, "response_correction", AGENTE_APAGAVEL);
  // As do flywheel não têm agente: são da organização, como sempre foram.
  await novaProposta(GOV_ORG, DO_FLYWHEEL, "playbook_bullet", null);
});
afterAll(() => pool.end());

describe("flywheel_distiller_proposals — correção de resposta", () => {
  it("o CHECK de type aceita response_correction e continua aceitando os tipos de antes", async () => {
    const { rows } = await q(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = 'public.flywheel_distiller_proposals'::regclass
          and conname = 'flywheel_distiller_proposals_type_check'`,
    );
    expect(rows).toHaveLength(1);
    for (const tipo of [
      "playbook_bullet",
      "golden_case",
      "reentry_trigger",
      "org_memory_entry",
      "response_correction",
    ]) {
      expect(rows[0].def).toContain(`'${tipo}'`);
    }
  });

  it("agent_id é FK para ai_agents com cascade", async () => {
    const { rows } = await q(
      `select confrelid::regclass::text as alvo, confdeltype as ao_apagar
         from pg_constraint
        where conrelid = 'public.flywheel_distiller_proposals'::regclass
          and contype = 'f'
          and conkey = array[(select attnum from pg_attribute
                               where attrelid = 'public.flywheel_distiller_proposals'::regclass
                                 and attname = 'agent_id')]`,
    );
    expect(rows).toEqual([{ alvo: "ai_agents", ao_apagar: "c" }]);
  });

  it("a correção de uma organização não aparece para a outra (RLS), nos dois sentidos", async () => {
    // GOV_MANAGER é membro de GOV_ORG e de mais nenhuma. A linha da OUTRA existe
    // (setup acima, como superusuário): sem ela, 0 seria verdade com ou sem RLS.
    const existe = await q("select count(*)::int as n from flywheel_distiller_proposals where id=$1", [
      PROPOSTA_DA_OUTRA,
    ]);
    expect(existe.rows[0].n).toBe(1);

    const vistas = await comoUsuario(
      GOV_MANAGER,
      "select id from flywheel_distiller_proposals where type='response_correction' order by id",
    );
    const ids = vistas.rows.map((r) => r.id as string);
    expect(ids).toContain(PROPOSTA_DA_ORG);
    expect(ids).not.toContain(PROPOSTA_DA_OUTRA);

    const dasOutras = await comoUsuario(
      GOV_MANAGER,
      "select count(*)::int as n from flywheel_distiller_proposals where organization_id=$1",
      [OUTRA_ORG],
    );
    expect(dasOutras.rows[0].n).toBe(0);
  });

  it("apagar o agente leva as correções dele e preserva a proposta da organização", async () => {
    await q("delete from ai_agents where id=$1", [AGENTE_APAGAVEL]);
    const { rows } = await q(
      "select id from flywheel_distiller_proposals where id = any($1::uuid[])",
      [[CORRECAO_APAGAVEL, DO_FLYWHEEL, PROPOSTA_DA_ORG]],
    );
    const ids = rows.map((r) => r.id as string).sort();
    expect(ids).toEqual([DO_FLYWHEEL, PROPOSTA_DA_ORG].sort());
  });
});

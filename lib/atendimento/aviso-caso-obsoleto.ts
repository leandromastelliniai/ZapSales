import { resolveCaseFromHuman } from "@/lib/agent-engine/agent/human-cases";
import type pg from "pg";
import { insertInboxItem } from "@/lib/agent-engine/db/repository";
import { idiomaPeloPool } from "@/lib/i18n/aviso-no-idioma";
import { traduzir } from "@/lib/i18n/dicionario";

/** Só respostas humanas a casos; cancelamentos normais não abrem avisos. */
export async function avisarRespostaDeCasoObsoleto(
  db: Pick<pg.Pool, "query">,
  org: string,
  caseId: string,
): Promise<void> {
  const { rows } = await db.query<{ conversation_id: string }>(
    "select conversation_id from agent_cases where organization_id=$1 and id=$2",
    [org, caseId],
  );
  if (!rows[0]) return;
  // No idioma da organização: a Central mostra o aviso como foi gravado.
  const idioma = await idiomaPeloPool(db, org);
  await insertInboxItem(
    db,
    org,
    {
      kind: "job_dead",
      severity: "warn",
      title: traduzir("Resposta registrada; atendimento mudou", idioma),
      body: traduzir("Resposta registrada; não repassada porque o atendimento mudou. Revise a conversa.", idioma),
      refKind: "conversation",
      refId: rows[0].conversation_id,
    },
    "kind_e_ref",
  );
}

/** Resposta humana e aviso são inseparáveis; falha mantém o caso respondível. */
export async function registrarRespostaDeCasoObsoleto(
  pool: pg.Pool,
  org: string,
  caseId: string,
  actorId: string,
  body: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const registered = await resolveCaseFromHuman(client, org, caseId, actorId, body);
    if (registered) {
      await avisarRespostaDeCasoObsoleto(client, org, caseId);
      await client.query("commit");
    } else {
      await client.query("rollback");
    }
    return registered;
  } catch (failure) {
    await client.query("rollback");
    throw failure;
  } finally {
    client.release();
  }
}

/**
 * GET/POST /api/v1/cron/campaign-worker — uma rodada de campanha.
 *
 * A lógica inteira mora em `lib/campanhas/rodada.ts`; esta rota só autentica,
 * chama e audita **quando houve efeito**. Rodada que não enviou, não pulou, não
 * concluiu e não promoveu nada não é mutação e não ocupa linha de auditoria —
 * mesmo critério de `asaas-reconcile` e `attendant-heartbeat`, e o que
 * `tests/unit/cron-audita-so-quando-ha-efeito.test.ts` varre no AST.
 *
 * No modo de texto livre, no máximo uma mensagem por NÚMERO por rodada: o ritmo é o
 * produto, e quem dispara em rajada queima o número. Ver o cabeçalho de
 * `lib/campanhas/rodada.ts`.
 *
 * O modo OFICIAL (issue #8) tem laço contínuo no worker
 * (`workers/agent-worker/main.ts`); esta rota também roda uma rodada dele, como
 * rede de segurança — a reserva em lote é `SKIP LOCKED`, e os dois não disputam
 * o mesmo destinatário. Ver `lib/campanhas/rodada-oficial.ts`.
 *
 * NOTA DE DEPLOY: não há `vercel.json` neste repo (self-host). O agendamento
 * vive no serviço `scheduler` do `docker-compose.prod.yml`
 * (`docker/scheduler/entrypoint.sh`) e em `vercel.ts`.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { rodarUmaRodadaDeCampanha } from "@/lib/campanhas/rodada";
import { resumoDaRodadaOficial, rodadaOficialMexeu, rodarUmaRodadaOficial } from "@/lib/campanhas/rodada-oficial";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const admin = createAdminClient();
  const r = await rodarUmaRodadaDeCampanha(admin);
  const oficial = await rodarUmaRodadaOficial(admin);

  if (
    r.enviadas > 0 ||
    r.pulados > 0 ||
    r.concluidas > 0 ||
    r.promovidas > 0 ||
    rodadaOficialMexeu(oficial)
  ) {
    void audit({
      action: "cron.campaign_worker",
      requestId,
      bypassedRls: true,
      metadata: {
        enviadas: r.enviadas,
        pulados: r.pulados,
        concluidas: r.concluidas,
        promovidas: r.promovidas,
        detalhe: r.detalhe,
        oficial: resumoDaRodadaOficial(oficial),
      },
    });
  }

  return ok({ ...r, oficial }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}

/**
 * As ferramentas externas, vistas pelo MOTOR do agente (pool `pg`, sem PostgREST).
 *
 * O worker fala com o banco pelo pool `pg`; a tabela é server-side only (0549), e o
 * papel do worker pode chamar `fn_decrypt_oauth`. A chave em claro só existe na
 * memória do turno, no instante da chamada.
 *
 * ⚠️ Toda consulta filtra `organization_id`, e o id vem da LINHA do job (fonte
 * confiável), nunca de payload do modelo.
 */
import { z } from "zod";

import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { logger } from "@/lib/logger";

import type { ResultadoDaChamada } from "./chamar";
import { parametroSchema } from "./esquema";
import type { DependenciasDoTurnoExterno, FerramentaDoTurno } from "./turno";

const parametrosLidos = z.array(parametroSchema);

interface LinhaDoTurno {
  id: string;
  slug: string;
  name: string;
  when_to_use: string;
  url: string;
  parameters: unknown;
  effect: string;
}

/** Ativas e de consulta, entre as que a versão do agente cita, desta organização. */
export async function carregarFerramentasDoTurno(
  db: Queryable,
  organizationId: string,
  ids: readonly string[],
): Promise<FerramentaDoTurno[]> {
  const { rows } = await db.query<LinhaDoTurno>(
    `select id, slug, name, when_to_use, url, parameters, effect
       from agent_external_tools
      where organization_id = $1
        and id = any($2::uuid[])
        and active
        and effect = 'consulta'
      order by name`,
    [organizationId, [...ids]],
  );
  return rows.map((r) => {
    const parametros = parametrosLidos.safeParse(r.parameters);
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      whenToUse: r.when_to_use,
      url: r.url,
      parameters: parametros.success ? parametros.data : [],
      effect: "consulta" as const,
    };
  });
}

/** A chave em claro, ou `null` (sem linha, cifra indisponível, leitura falhou). Nunca lança. */
export async function lerChaveNoBanco(db: Queryable, organizationId: string, id: string): Promise<string | null> {
  try {
    const { rows } = await db.query<{ chave: string | null }>(
      `select public.fn_decrypt_oauth(signing_secret_encrypted) as chave
         from agent_external_tools
        where organization_id = $1 and id = $2`,
      [organizationId, id],
    );
    const chave = rows[0]?.chave ?? null;
    return chave && chave.length > 0 ? chave : null;
  } catch (err) {
    logger.warn("[ferramentas-externas] leitura da chave falhou", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Abre o aviso na Central — UM aberto por ferramenta (o título leva o nome). Sem
 * referência: a tabela é só do servidor, e o destino do aviso é a tela das
 * ferramentas (`POLITICAS_DE_AVISO.external_tool_failed`). Nunca lança.
 */
export async function abrirAvisoDeFalha(
  db: Queryable,
  organizationId: string,
  aviso: { titulo: string; corpo: string },
): Promise<void> {
  try {
    await db.query(
      `insert into agent_inbox_items (organization_id, kind, severity, title, body)
       select $1, 'external_tool_failed', 'warn', $2, $3
        where not exists (
          select 1 from agent_inbox_items
           where organization_id = $1 and kind = 'external_tool_failed' and title = $2 and status = 'open'
        )`,
      [organizationId, aviso.titulo, aviso.corpo],
    );
  } catch (err) {
    logger.warn("[ferramentas-externas] aviso da falha não foi gravado", {
      organization_id: organizationId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    });
  }
}

/**
 * O que a auditoria guarda de uma chamada de agente: ferramenta, desfecho, status,
 * motivo, tentativas e duração. Nunca a chave, o corpo enviado nem a resposta.
 */
export function metadadosDaChamada(
  ferramenta: Pick<FerramentaDoTurno, "id" | "slug" | "effect">,
  resultado: ResultadoDaChamada,
  contexto: { agentId: string | null; jobId: string | null },
): Record<string, unknown> {
  return {
    tool_id: ferramenta.id,
    tool_slug: ferramenta.slug,
    effect: ferramenta.effect,
    agent_id: contexto.agentId,
    job_id: contexto.jobId,
    ok: resultado.ok,
    http_status: resultado.httpStatus,
    attempts: resultado.tentativas,
    duration_ms: resultado.duracaoMs,
    ...(resultado.ok ? { truncated: resultado.truncado } : { reason: resultado.motivo }),
  };
}

/** As dependências do turno ligadas ao banco real. O motor passa isto a `montarFerramentasExternas`. */
export function dependenciasDoMotor(args: {
  db: Queryable;
  organizationId: string;
  agentId: string | null;
  jobId: string | null;
  log: DependenciasDoTurnoExterno["log"];
}): DependenciasDoTurnoExterno {
  const { db, organizationId } = args;
  return {
    carregar: (ids) => carregarFerramentasDoTurno(db, organizationId, ids),
    lerChave: (id) => lerChaveNoBanco(db, organizationId, id),
    abrirAviso: (aviso) => abrirAvisoDeFalha(db, organizationId, aviso),
    auditar: async ({ ferramenta, resultado }) => {
      // O motor fala com o banco pelo `pg`, e a auditoria vai pelo mesmo caminho (uma linha
      // em `api_audit_log`). Fire-and-forget por contrato: falha de escrita avisa no log e
      // NUNCA derruba o turno nem muda o que o cliente recebe.
      try {
        await db.query(
          `insert into api_audit_log (organization_id, action, resource_type, resource_id, request_id, metadata)
           values ($1, 'ai.external_tool_called', 'agent_external_tool', $2, $3, $4::jsonb)`,
          [
            organizationId,
            ferramenta.id,
            args.jobId,
            JSON.stringify(metadadosDaChamada(ferramenta, resultado, { agentId: args.agentId, jobId: args.jobId })),
          ],
        );
      } catch (err) {
        logger.warn("[ferramentas-externas] auditoria da chamada não foi gravada", {
          organization_id: organizationId,
          error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
        });
      }
    },
    log: args.log,
  };
}

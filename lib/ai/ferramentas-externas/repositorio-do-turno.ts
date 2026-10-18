/**
 * As ferramentas externas, vistas pelo MOTOR do agente (pool `pg`, sem PostgREST).
 *
 * O worker fala com o banco pelo pool `pg`; a tabela é server-side only (0551), e o
 * papel do worker pode chamar `fn_decrypt_oauth`. A chave em claro só existe na
 * memória do turno, no instante da chamada.
 *
 * ⚠️ Toda consulta filtra `organization_id`, e o id vem da LINHA do job (fonte
 * confiável), nunca de payload do modelo.
 */
import { randomUUID } from "node:crypto";

import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { logger } from "@/lib/logger";

import { resumoDosDados, resumoEmTexto, tituloDoAviso } from "./aprovacao";
import type { ResultadoDaChamada } from "./chamar";
import { parametrosLidos } from "./esquema";
import { hashDosArgumentos } from "./impressao-digital";
import type { AberturaDoPedido, PedidoDoTurno } from "./pedidos-tipos";
import type { PedidoParaOBloco } from "./pedidos-bloco";
import { JANELA_DA_REPETICAO_HORAS, type EstadoDoPedido, type OrigemDoPedido } from "./tipos";
import type { DependenciasDoTurnoExterno, FerramentaDoTurno } from "./turno";

interface LinhaDoTurno {
  id: string;
  slug: string;
  name: string;
  when_to_use: string;
  url: string;
  parameters: unknown;
  effect: string;
  require_approval: boolean | null;
  approval_ttl_hours: number;
}

/** Ativas, entre as que a versão do agente cita, desta organização (consulta e ação que altera). */
export async function carregarFerramentasDoTurno(
  db: Queryable,
  organizationId: string,
  ids: readonly string[],
): Promise<FerramentaDoTurno[]> {
  const { rows } = await db.query<LinhaDoTurno>(
    `select id, slug, name, when_to_use, url, parameters, effect, require_approval, approval_ttl_hours
       from agent_external_tools
      where organization_id = $1
        and id = any($2::uuid[])
        and active
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
      // Vocabulário desconhecido cai em «altera»: falha FECHADA (pede aprovação e não repete).
      effect: r.effect === "consulta" ? ("consulta" as const) : ("altera" as const),
      requireApproval: r.require_approval,
      approvalTtlHours: r.approval_ttl_hours,
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

// ─── O pedido de execução (issue #95) ────────────────────────────────────────


interface LinhaDoPedido {
  id: string;
  status: EstadoDoPedido;
  uncertain: boolean;
  expires_at: Date | string;
  outcome_content?: string | null;
}

function paraPedidoDoTurno(l: LinhaDoPedido): PedidoDoTurno {
  return {
    id: l.id,
    status: l.status,
    incerto: l.uncertain,
    expiresAt: l.expires_at instanceof Date ? l.expires_at.toISOString() : String(l.expires_at),
    conteudo: l.outcome_content ?? null,
  };
}

/** O critério de «a mesma chamada já está registrada» — o mesmo nas duas consultas abaixo. */
const MESMA_CHAMADA_VIVA = `
  r.organization_id = $1 and r.tool_id = $2
  and r.conversation_id is not distinct from $3::uuid
  and r.arguments_hash = $4
  and (
    r.status in ('pending', 'executing')
    or (r.created_at > now() - make_interval(hours => ${JANELA_DA_REPETICAO_HORAS})
        and (r.status = 'executed' or (r.status = 'failed' and r.uncertain)))
  )`;

export interface EntradaDoPedido {
  ferramenta: Pick<FerramentaDoTurno, "id" | "slug" | "name" | "effect" | "approvalTtlHours">;
  argumentos: Record<string, unknown>;
  origem: OrigemDoPedido;
  autoExecutar: boolean;
  agentId: string | null;
  conversationId: string | null;
  jobId: string | null;
}

/**
 * Abre o pedido de execução — ou reencontra o que já existe para a MESMA chamada na mesma
 * conversa (a repetição do modelo, ou dois turnos concorrentes).
 *
 *  - pendente: o pedido e o item da Central nascem no MESMO comando (sem pedido invisível);
 *  - `autoExecutar` (chave desligada): nasce já `executing`, só para registrar e impedir o
 *    segundo efeito — não há o que aprovar, então não há item na Central;
 *  - quem criou recebe `reivindicado: true` e é o ÚNICO que executa; quem encontrou um
 *    pedido vivo recebe `false` e o estado dele;
 *  - um pendente que já passou do prazo vira `expired` aqui mesmo (o cron pode não ter
 *    rodado) e dá lugar a um pedido novo.
 *
 * Lança se não conseguir nem criar nem encontrar: o turno então NÃO executa a ação.
 */
export async function abrirPedidoNoBanco(
  db: Queryable,
  organizationId: string,
  entrada: EntradaDoPedido,
): Promise<AberturaDoPedido> {
  const hash = hashDosArgumentos(entrada.argumentos);
  const chave = [organizationId, entrada.ferramenta.id, entrada.conversationId, hash];

  // 1. O pendente vencido deixa de ocupar o lugar (e o aviso dele sai da Central).
  await db.query(
    `with vencidos as (
       update agent_external_tool_requests r
          set status = 'expired'
        where ${MESMA_CHAMADA_VIVA}
          and r.status = 'pending' and r.expires_at <= now()
        returning r.inbox_item_id
     )
     update agent_inbox_items i set status = 'resolved'
      where i.organization_id = $1 and i.id in (select inbox_item_id from vencidos where inbox_item_id is not null)`,
    chave,
  );

  // 2. Cria — a menos que a mesma chamada já esteja registrada. O índice único parcial
  //    fecha a corrida entre dois turnos: quem perde recebe 0 linhas.
  const id = randomUUID();
  const avisoId = randomUUID();
  const comAviso = !entrada.autoExecutar;
  const titulo = tituloDoAviso(entrada.ferramenta.name, entrada.argumentos, id);
  const corpo =
    `O agente quer executar «${entrada.ferramenta.name}» e espera a sua decisão. ` +
    `Dados: ${resumoEmTexto(entrada.argumentos)}. ` +
    "Nada foi enviado ao outro sistema. Aprovar executa a ação uma única vez; recusar a cancela.";
  const criado = await db.query<LinhaDoPedido>(
    `with novo as (
       insert into agent_external_tool_requests
         (id, organization_id, tool_id, agent_id, conversation_id, origin, status, arguments, arguments_hash,
          inbox_item_id, expires_at, decided_at)
       select $5::uuid, $1, $2, $6::uuid, $3::uuid, $7, $8, $9::jsonb, $4,
              case when $10::boolean then $11::uuid end,
              now() + make_interval(hours => $12::int),
              case when $8 = 'executing' then now() end
        where not exists (select 1 from agent_external_tool_requests r where ${MESMA_CHAMADA_VIVA})
       on conflict do nothing
       returning id, status, uncertain, expires_at
     ), aviso as (
       insert into agent_inbox_items (id, organization_id, kind, severity, title, body, ref_kind, ref_id)
       select $11::uuid, $1, 'external_tool_approval', 'warn', $13, $14, 'external_tool_request', novo.id
         from novo where $10::boolean
     )
     select id, status, uncertain, expires_at from novo`,
    [
      ...chave,
      id,
      entrada.agentId,
      entrada.origem,
      comAviso ? "pending" : "executing",
      JSON.stringify(entrada.argumentos),
      comAviso,
      avisoId,
      entrada.ferramenta.approvalTtlHours,
      titulo,
      corpo,
    ],
  );
  const novo = criado.rows[0];
  if (novo) {
    await auditarPedido(db, organizationId, {
      action: "ai.external_tool_request_created",
      pedidoId: novo.id,
      ferramentaId: entrada.ferramenta.id,
      metadata: {
        tool_slug: entrada.ferramenta.slug,
        effect: entrada.ferramenta.effect,
        origin: entrada.origem,
        auto_execute: entrada.autoExecutar,
        agent_id: entrada.agentId,
        job_id: entrada.jobId,
        // Um resumo, sem segredos: o que a Central também mostra.
        summary: resumoDosDados(entrada.argumentos),
      },
    });
    return { pedido: paraPedidoDoTurno(novo), reivindicado: true };
  }

  // 3. Já existia: devolve o estado dele.
  const existente = await db.query<LinhaDoPedido>(
    `select r.id, r.status, r.uncertain, r.expires_at, r.outcome_content
       from agent_external_tool_requests r
      where ${MESMA_CHAMADA_VIVA}
      order by r.created_at desc
      limit 1`,
    chave,
  );
  const achado = existente.rows[0];
  if (!achado) throw new Error("pedido de ferramenta externa: nem criado nem encontrado");
  return { pedido: paraPedidoDoTurno(achado), reivindicado: false };
}

/**
 * Fecha o pedido que o TURNO executou (`executing → executed | failed`). Só mexe em quem
 * ainda está `executing`: um pedido já fechado por outro caminho não é reescrito. Nunca lança.
 */
export async function concluirPedidoNoBanco(
  db: Queryable,
  organizationId: string,
  c: { pedido: PedidoDoTurno; resultado: ResultadoDaChamada },
): Promise<void> {
  const r = c.resultado;
  try {
    await db.query(
      `update agent_external_tool_requests
          set status = $3,
              uncertain = $4,
              executed_at = case when $3 = 'executed' then now() end,
              outcome_http_status = $5,
              outcome_reason = $6,
              outcome_content = $7
        where organization_id = $1 and id = $2 and status = 'executing'`,
      [
        organizationId,
        c.pedido.id,
        r.ok ? "executed" : "failed",
        r.ok ? false : r.desfechoIncerto,
        r.httpStatus,
        r.ok ? null : r.motivo,
        r.ok ? r.conteudo : null,
      ],
    );
  } catch (err) {
    logger.warn("[ferramentas-externas] o desfecho do pedido não foi gravado", {
      organization_id: organizationId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    });
  }
}

/** Os pedidos desta conversa, para o agente saber o que aconteceu com o que pediu. Nunca lança. */
export async function pedidosDaConversa(
  db: Queryable,
  organizationId: string,
  conversationId: string,
): Promise<PedidoParaOBloco[]> {
  try {
    const { rows } = await db.query<{
      tool_name: string;
      status: EstadoDoPedido;
      uncertain: boolean;
      expires_at: Date | string;
      created_at: Date | string;
      arguments: Record<string, unknown>;
      tem_resultado: boolean;
    }>(
      `select t.name as tool_name, r.status, r.uncertain, r.expires_at, r.created_at, r.arguments,
              (r.outcome_content is not null) as tem_resultado
         from agent_external_tool_requests r
         join agent_external_tools t on t.organization_id = r.organization_id and t.id = r.tool_id
        where r.organization_id = $1 and r.conversation_id = $2
          and r.created_at > now() - interval '7 days'
        order by r.created_at desc
        limit 20`,
      [organizationId, conversationId],
    );
    return rows.map((l) => ({
      tool_name: l.tool_name,
      status: l.status,
      uncertain: l.uncertain,
      expires_at: l.expires_at instanceof Date ? l.expires_at.toISOString() : String(l.expires_at),
      created_at: l.created_at instanceof Date ? l.created_at.toISOString() : String(l.created_at),
      arguments: l.arguments ?? {},
      tem_resultado: l.tem_resultado,
    }));
  } catch (err) {
    logger.warn("[ferramentas-externas] os pedidos da conversa não foram lidos", {
      organization_id: organizationId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    });
    return [];
  }
}

/** Há um pedido VIVO esperando um humano nesta conversa? (sustenta a promessa «depende da equipe») */
export async function temPedidoPendenteNaConversa(
  db: Queryable,
  organizationId: string,
  conversationId: string,
): Promise<boolean> {
  try {
    const { rows } = await db.query<{ existe: boolean }>(
      `select exists (
         select 1 from agent_external_tool_requests
          where organization_id = $1 and conversation_id = $2
            and status = 'pending' and expires_at > now()
       ) as existe`,
      [organizationId, conversationId],
    );
    return rows[0]?.existe === true;
  } catch {
    return false;
  }
}

async function auditarPedido(
  db: Queryable,
  organizationId: string,
  a: { action: string; pedidoId: string; ferramentaId: string; metadata: Record<string, unknown> },
): Promise<void> {
  try {
    await db.query(
      `insert into api_audit_log (organization_id, action, resource_type, resource_id, request_id, metadata)
       values ($1, $2, 'agent_external_tool_request', $3, null, $4::jsonb)`,
      [organizationId, a.action, a.pedidoId, JSON.stringify({ tool_id: a.ferramentaId, ...a.metadata })],
    );
  } catch (err) {
    logger.warn("[ferramentas-externas] auditoria do pedido não foi gravada", {
      organization_id: organizationId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    });
  }
}

/** As dependências do turno ligadas ao banco real. O motor passa isto a `montarFerramentasExternas`. */
export function dependenciasDoMotor(args: {
  db: Queryable;
  organizationId: string;
  agentId: string | null;
  jobId: string | null;
  conversationId?: string | null;
  log: DependenciasDoTurnoExterno["log"];
}): DependenciasDoTurnoExterno {
  const { db, organizationId } = args;
  return {
    carregar: (ids) => carregarFerramentasDoTurno(db, organizationId, ids),
    lerChave: (id) => lerChaveNoBanco(db, organizationId, id),
    abrirAviso: (aviso) => abrirAvisoDeFalha(db, organizationId, aviso),
    abrirPedido: (a) =>
      abrirPedidoNoBanco(db, organizationId, {
        ferramenta: a.ferramenta,
        argumentos: a.argumentos,
        origem: a.origem,
        autoExecutar: a.autoExecutar,
        agentId: args.agentId,
        conversationId: args.conversationId ?? null,
        jobId: args.jobId,
      }),
    concluirPedido: (c) => concluirPedidoNoBanco(db, organizationId, c),
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

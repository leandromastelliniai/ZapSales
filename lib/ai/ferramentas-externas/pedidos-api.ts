/**
 * Os pedidos de execução, vistos pela API (cliente `service_role` do PostgREST) — issue #95.
 *
 * A tabela é server-side only (0552): RLS ligada, zero policies. A cerca entre organizações é
 * o filtro `organization_id` que TODA consulta daqui carrega; o id da organização vem da
 * sessão (ou da linha do pedido, no cron), nunca do corpo.
 *
 * O coração é `reivindicar`: um UPDATE condicional (`where status = 'pending' and expires_at
 * > agora`). Só quem recebe a linha de volta executa — clique duplo, dois gestores e o
 * navegador reenviando a requisição disputam o mesmo UPDATE, e um só vence. É a «execução
 * única por pedido»; o resto das regras (aprovar, recusar, expirar) é transição de estado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import type { ResultadoDaChamada } from "./chamar";
import type { PedidoDeExecucao } from "./pedidos-tipos";
import type { EstadoDoPedido } from "./tipos";

const COLUNAS =
  "id, tool_id, status, origin, arguments, uncertain, expires_at, created_at, decided_at, executed_at, outcome_http_status, outcome_reason, inbox_item_id, conversation_id, agent_id";

interface LinhaDoPedido {
  id: string;
  tool_id: string;
  status: EstadoDoPedido;
  origin: "live" | "assisted";
  arguments: Record<string, unknown> | null;
  uncertain: boolean;
  expires_at: string;
  created_at: string;
  decided_at: string | null;
  executed_at: string | null;
  outcome_http_status: number | null;
  outcome_reason: string | null;
  inbox_item_id: string | null;
  conversation_id: string | null;
  agent_id: string | null;
}

/** O pedido com a ferramenta que ele aciona (o que a decisão precisa para executar). */
export interface PedidoComFerramenta extends PedidoDeExecucao {
  inbox_item_id: string | null;
  conversation_id: string | null;
  agent_id: string | null;
  tool_active: boolean;
  tool_parameters: unknown;
  /** Webhook: o endereço da ferramenta. MCP: `null` (o endereço é o do servidor). */
  tool_url: string | null;
  /** Presente quando a ferramenta vem de um servidor MCP (#96). */
  tool_mcp: { servidor_id: string; nome_no_servidor: string } | null;
}

function paraPedido(l: LinhaDoPedido, ferramenta: { name: string; slug: string; effect: "consulta" | "altera" }): PedidoDeExecucao {
  return {
    id: l.id,
    tool_id: l.tool_id,
    tool_name: ferramenta.name,
    tool_slug: ferramenta.slug,
    effect: ferramenta.effect,
    status: l.status,
    origin: l.origin,
    arguments: l.arguments ?? {},
    uncertain: l.uncertain,
    expires_at: l.expires_at,
    created_at: l.created_at,
    decided_at: l.decided_at,
    executed_at: l.executed_at,
    outcome_http_status: l.outcome_http_status,
    outcome_reason: l.outcome_reason,
  };
}

/** O pedido desta organização com a ferramenta dele, ou `null` (não existe OU é de outra organização). */
export async function buscarPedido(
  admin: SupabaseClient,
  organizationId: string,
  id: string,
): Promise<PedidoComFerramenta | null> {
  const { data, error } = await admin
    .from("agent_external_tool_requests")
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`leitura do pedido falhou: ${error.message}`);
  if (!data) return null;
  const linha = data as unknown as LinhaDoPedido;
  const { data: f, error: erroDaFerramenta } = await admin
    .from("agent_external_tools")
    .select("name, slug, effect, active, parameters, url, kind, mcp_server_id, mcp_tool_name")
    .eq("organization_id", organizationId)
    .eq("id", linha.tool_id)
    .maybeSingle();
  if (erroDaFerramenta) throw new Error(`leitura da ferramenta do pedido falhou: ${erroDaFerramenta.message}`);
  if (!f) return null;
  const ferramenta = f as unknown as {
    name: string;
    slug: string;
    effect: "consulta" | "altera";
    active: boolean;
    parameters: unknown;
    url: string | null;
    kind: string;
    mcp_server_id: string | null;
    mcp_tool_name: string | null;
  };
  return {
    ...paraPedido(linha, ferramenta),
    inbox_item_id: linha.inbox_item_id,
    conversation_id: linha.conversation_id,
    agent_id: linha.agent_id,
    tool_active: ferramenta.active,
    tool_parameters: ferramenta.parameters,
    tool_url: ferramenta.url,
    tool_mcp:
      ferramenta.kind === "mcp" && ferramenta.mcp_server_id && ferramenta.mcp_tool_name
        ? { servidor_id: ferramenta.mcp_server_id, nome_no_servidor: ferramenta.mcp_tool_name }
        : null,
  };
}

/**
 * Os pedidos que os avisos da Central citam, para a tela mostrar o que o agente quer fazer e
 * os botões. Uma consulta por lote, filtrada pela organização da sessão.
 */
export async function pedidosDosAvisos(
  admin: SupabaseClient,
  organizationId: string,
  ids: readonly string[],
): Promise<Map<string, PedidoDeExecucao>> {
  const mapa = new Map<string, PedidoDeExecucao>();
  if (ids.length === 0) return mapa;
  const { data, error } = await admin
    .from("agent_external_tool_requests")
    .select(`${COLUNAS}, agent_external_tools(name, slug, effect)`)
    .eq("organization_id", organizationId)
    .in("id", [...ids]);
  if (error) throw new Error(`leitura dos pedidos da Central falhou: ${error.message}`);
  for (const bruto of (data ?? []) as unknown as Array<
    LinhaDoPedido & { agent_external_tools: { name: string; slug: string; effect: "consulta" | "altera" } | null }
  >) {
    const f = bruto.agent_external_tools;
    if (!f) continue;
    mapa.set(bruto.id, paraPedido(bruto, f));
  }
  return mapa;
}

/**
 * Reivindica o pedido para executar: `pending → executing`, só dentro do prazo. Devolve `true`
 * para QUEM venceu. Perdeu (já decidido, expirado, outro clique) ⇒ `false`, e nada mais se faz.
 */
export async function reivindicar(
  admin: SupabaseClient,
  organizationId: string,
  id: string,
  atorId: string,
  agora: Date = new Date(),
): Promise<boolean> {
  const { data, error } = await admin
    .from("agent_external_tool_requests")
    .update({ status: "executing", decided_by: atorId, decided_at: agora.toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", id)
    .eq("status", "pending")
    .gt("expires_at", agora.toISOString())
    .select("id");
  if (error) throw new Error(`reivindicação do pedido falhou: ${error.message}`);
  return (data ?? []).length > 0;
}

/** Fecha o pedido que ESTE caminho reivindicou (`executing → executed | failed`). */
export async function finalizar(
  admin: SupabaseClient,
  organizationId: string,
  id: string,
  resultado: ResultadoDaChamada,
): Promise<void> {
  const { error } = await admin
    .from("agent_external_tool_requests")
    .update({
      status: resultado.ok ? "executed" : "failed",
      uncertain: resultado.ok ? false : resultado.desfechoIncerto,
      executed_at: resultado.ok ? new Date().toISOString() : null,
      outcome_http_status: resultado.httpStatus,
      outcome_reason: resultado.ok ? null : resultado.motivo,
      outcome_content: resultado.ok ? resultado.conteudo : null,
    })
    .eq("organization_id", organizationId)
    .eq("id", id)
    .eq("status", "executing");
  if (error) {
    // O efeito já aconteceu (ou não): perder o desfecho não pode virar 500 para quem aprovou.
    logger.error("[ferramentas-externas] o desfecho do pedido não foi gravado", {
      organization_id: organizationId,
      request_id: id,
      error: error.message,
    });
  }
}

/** Recusa o pedido pendente. `true` = este caminho o recusou; `false` = já não estava pendente. */
export async function recusar(
  admin: SupabaseClient,
  organizationId: string,
  id: string,
  atorId: string,
  motivo: string | null,
): Promise<boolean> {
  const { data, error } = await admin
    .from("agent_external_tool_requests")
    .update({
      status: "rejected",
      decided_by: atorId,
      decided_at: new Date().toISOString(),
      outcome_reason: motivo,
    })
    .eq("organization_id", organizationId)
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error(`recusa do pedido falhou: ${error.message}`);
  return (data ?? []).length > 0;
}

/** Marca como expirado um pendente que passou do prazo (a decisão tardia encontrou-o vencido). */
export async function marcarExpirado(admin: SupabaseClient, organizationId: string, id: string): Promise<boolean> {
  const { data, error } = await admin
    .from("agent_external_tool_requests")
    .update({ status: "expired" })
    .eq("organization_id", organizationId)
    .eq("id", id)
    .eq("status", "pending")
    .lte("expires_at", new Date().toISOString())
    .select("id");
  if (error) throw new Error(`expiração do pedido falhou: ${error.message}`);
  return (data ?? []).length > 0;
}

/** Resolve o item da Central deste pedido (decidido, vencido ou executado: não há mais o que fazer ali). */
export async function resolverAviso(
  admin: SupabaseClient,
  organizationId: string,
  inboxItemId: string | null,
): Promise<void> {
  if (!inboxItemId) return;
  const { error } = await admin
    .from("agent_inbox_items")
    .update({ status: "resolved" })
    .eq("organization_id", organizationId)
    .eq("id", inboxItemId);
  if (error) {
    logger.warn("[ferramentas-externas] o aviso do pedido não foi resolvido", {
      organization_id: organizationId,
      error: error.message,
    });
  }
}

export interface PedidoExpirado {
  id: string;
  organization_id: string;
  tool_id: string;
  inbox_item_id: string | null;
}

/**
 * A rodada de expiração: todo pendente vencido vira `expired` (UPDATE condicional por linha —
 * se alguém decidiu entre a leitura e a escrita, não é sobrescrito) e o aviso dele sai da
 * Central. Devolve só o que ESTA rodada expirou.
 */
export async function expirarVencidos(admin: SupabaseClient, agora: Date = new Date()): Promise<PedidoExpirado[]> {
  const { data, error } = await admin
    .from("agent_external_tool_requests")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lte("expires_at", agora.toISOString())
    .select("id, organization_id, tool_id, inbox_item_id");
  if (error) throw new Error(`expiração dos pedidos falhou: ${error.message}`);
  const expirados = (data ?? []) as unknown as PedidoExpirado[];
  for (const e of expirados) await resolverAviso(admin, e.organization_id, e.inbox_item_id);
  return expirados;
}

/**
 * Abre o aviso `external_tool_failed` quando a execução aprovada falhou — UM aberto por título.
 * Mesmo aviso do turno ao vivo; a diferença é só quem o abre (aqui, a rota de decisão).
 */
export async function abrirAvisoDeFalhaDoPedido(
  admin: SupabaseClient,
  organizationId: string,
  aviso: { titulo: string; corpo: string },
): Promise<void> {
  try {
    const { data: aberto } = await admin
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("kind", "external_tool_failed")
      .eq("title", aviso.titulo)
      .eq("status", "open")
      .maybeSingle();
    if (aberto) return;
    await admin.from("agent_inbox_items").insert({
      organization_id: organizationId,
      kind: "external_tool_failed",
      severity: "warn",
      title: aviso.titulo,
      body: aviso.corpo,
    });
  } catch (err) {
    logger.warn("[ferramentas-externas] o aviso da falha não foi gravado", {
      organization_id: organizationId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    });
  }
}

/** Quanto tempo um pedido pode ficar «executando» antes de ser dado como travado (o prazo da chamada é de 8 s). */
export const TRAVADO_APOS_MINUTOS = 15;
/** Depois disto, os dados guardados de um pedido CONCLUÍDO são apagados (a linha e o desfecho ficam). */
export const PODA_DOS_DADOS_APOS_DIAS = 90;

export interface PedidoTravado {
  id: string;
  organization_id: string;
  tool_id: string;
  tool_name: string;
}

/**
 * O pedido que ficou em `executing` porque o processo caiu entre reivindicar e fechar. O prazo da
 * chamada é de 8 s: passados 15 minutos, ninguém mais a está fazendo. Não se SABE se o outro sistema
 * recebeu, então fecha como falha INCERTA (nunca é repetida) e o aviso diz isso. Sem esta rodada o
 * pedido bloquearia a mesma chamada para sempre (índice da chamada viva) e o agente leria «em curso».
 */
export async function recuperarTravados(admin: SupabaseClient, agora: Date = new Date()): Promise<PedidoTravado[]> {
  const limite = new Date(agora.getTime() - TRAVADO_APOS_MINUTOS * 60_000).toISOString();
  const { data, error } = await admin
    .from("agent_external_tool_requests")
    .update({ status: "failed", uncertain: true, outcome_reason: "travado" })
    .eq("status", "executing")
    .lte("updated_at", limite)
    .select("id, organization_id, tool_id, agent_external_tools(name)");
  if (error) throw new Error(`recuperação dos pedidos travados falhou: ${error.message}`);
  return ((data ?? []) as unknown as Array<{
    id: string;
    organization_id: string;
    tool_id: string;
    agent_external_tools: { name: string } | null;
  }>).map((l) => ({
    id: l.id,
    organization_id: l.organization_id,
    tool_id: l.tool_id,
    tool_name: l.agent_external_tools?.name ?? "ferramenta externa",
  }));
}

/**
 * Apaga os DADOS (`arguments`, `outcome_content`) de pedido concluído há mais de 90 dias. O pedido, o
 * estado e o desfecho ficam; o que sai é o dado pessoal que o agente preencheu e o que o outro sistema
 * devolveu. Devolve quantos foram podados (a rodada só audita se foi > 0).
 */
export async function podarDadosAntigos(admin: SupabaseClient, agora: Date = new Date()): Promise<number> {
  const limite = new Date(agora.getTime() - PODA_DOS_DADOS_APOS_DIAS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("agent_external_tool_requests")
    .update({ arguments: {}, outcome_content: null, data_pruned_at: agora.toISOString() })
    .in("status", ["executed", "failed", "rejected", "expired"])
    .lte("updated_at", limite)
    .is("data_pruned_at", null)
    .select("id");
  if (error) throw new Error(`poda dos dados dos pedidos falhou: ${error.message}`);
  return (data ?? []).length;
}

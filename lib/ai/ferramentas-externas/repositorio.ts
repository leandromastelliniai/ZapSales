/**
 * O cadastro das ferramentas externas, visto pela API (cliente `service_role` do
 * PostgREST). A tabela é server-side only (migration 0551): RLS ligada, zero
 * policies, grants revogados de anon/authenticated. A cerca entre organizações é
 * o filtro `organization_id` que TODA consulta daqui carrega — o id da organização
 * vem sempre da sessão (quem chama), nunca do corpo do pedido.
 *
 * A chave de assinatura nasce aqui, é cifrada por `fn_encrypt_oauth` e devolvida em
 * claro UMA vez, na criação (e quando a pessoa pede uma nova). Depois só os 4
 * últimos caracteres saem: o receptor precisa dela, o browser não.
 */
import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";

import {
  parametrosLidos,
  nomeNoAgente,
  slugDaFerramenta,
  type CriarFerramentaInput,
  type EditarFerramentaInput,
} from "./esquema";
import { lerConfigDeMcp } from "./mcp/config";
import { lerCredencialDoServidor } from "./mcp/repositorio";
import type { EfeitoDaFerramenta, ParametroDaFerramenta, TipoDaFerramenta } from "./tipos";
import { EFEITOS_DA_FERRAMENTA } from "./tipos";

/** Por que uma ferramenta de servidor MCP não está disponível para os agentes agora. */
export type MotivoDeIndisponibilidade = "mcp_desligado" | "servidor_desativado";

export interface FerramentaExterna {
  id: string;
  /** `webhook` (#94) ou `mcp` (#96, escolhida num servidor MCP). */
  kind: TipoDaFerramenta;
  name: string;
  slug: string;
  /** O nome que o modelo vê (`ext_<slug>`). */
  agent_name: string;
  when_to_use: string;
  /** Webhook: o endereço. MCP: `null` — o endereço é o do servidor (`mcp.server_name` diz qual). */
  url: string | null;
  /** Presente em `kind = 'mcp'`. */
  mcp: {
    server_id: string;
    server_name: string | null;
    /** O nome da ferramenta NO servidor. */
    tool_name: string;
    /** O que o servidor declarou (`readOnlyHint`). Só uma dica. */
    hint_read_only: boolean | null;
  } | null;
  /** Por que a ferramenta não chega aos agentes agora, apesar de ativa (MCP desligado, servidor desativado). */
  unavailable_reason: MotivoDeIndisponibilidade | null;
  parameters: ParametroDaFerramenta[];
  effect: EfeitoDaFerramenta;
  /**
   * A chave «pedir aprovação». `null` = a pessoa nunca mexeu: vale o padrão do efeito (altera
   * pede, consulta não). `true`/`false` é decisão dela.
   */
  require_approval: boolean | null;
  /** Horas que um pedido desta ferramenta espera por um humano (1 a 168; padrão 24). */
  approval_ttl_hours: number;
  active: boolean;
  /** Os 4 últimos caracteres da chave de assinatura — nunca a chave. `null` em ferramenta MCP (sem chave). */
  secret_last4: string | null;
  created_at: string;
  updated_at: string;
}

/** Tudo menos a chave cifrada: a coluna `signing_secret_encrypted` nunca é selecionada para a tela. */
const COLUNAS_PUBLICAS =
  "id, kind, name, slug, when_to_use, url, parameters, effect, require_approval, approval_ttl_hours, active, signing_secret_last4, mcp_server_id, mcp_tool_name, mcp_hint_read_only, created_at, updated_at";

interface LinhaPublica {
  id: string;
  kind: string;
  name: string;
  slug: string;
  when_to_use: string;
  url: string | null;
  parameters: unknown;
  effect: string;
  require_approval: boolean | null;
  approval_ttl_hours: number;
  active: boolean;
  signing_secret_last4: string | null;
  mcp_server_id: string | null;
  mcp_tool_name: string | null;
  mcp_hint_read_only: boolean | null;
  created_at: string;
  updated_at: string;
}

/** O que a lista precisa saber do servidor de uma ferramenta MCP (e do interruptor), lido uma vez. */
export interface ContextoDoMcp {
  ligado: boolean;
  servidores: ReadonlyMap<string, { name: string; active: boolean }>;
}

const SEM_MCP: ContextoDoMcp = { ligado: false, servidores: new Map() };

export function paraFerramenta(l: LinhaPublica, mcp: ContextoDoMcp = SEM_MCP): FerramentaExterna {
  // Leitura DEFENSIVA do jsonb: linha escrita por fora da tela com formato estranho
  // vira "sem campos" (a ferramenta chama sem argumentos), nunca um 500 na lista.
  const parametros = parametrosLidos.safeParse(l.parameters);
  const ehMcp = l.kind === "mcp" && l.mcp_server_id !== null && l.mcp_tool_name !== null;
  const servidor = ehMcp ? mcp.servidores.get(l.mcp_server_id as string) : undefined;
  return {
    id: l.id,
    kind: ehMcp ? "mcp" : "webhook",
    name: l.name,
    slug: l.slug,
    agent_name: nomeNoAgente(l.slug),
    when_to_use: l.when_to_use,
    url: ehMcp ? null : l.url,
    mcp: ehMcp
      ? {
          server_id: l.mcp_server_id as string,
          server_name: servidor?.name ?? null,
          tool_name: l.mcp_tool_name as string,
          hint_read_only: l.mcp_hint_read_only,
        }
      : null,
    unavailable_reason: !ehMcp ? null : !mcp.ligado ? "mcp_desligado" : servidor?.active === false ? "servidor_desativado" : null,
    parameters: parametros.success ? parametros.data : [],
    effect: (EFEITOS_DA_FERRAMENTA as readonly string[]).includes(l.effect) ? (l.effect as EfeitoDaFerramenta) : "altera",
    require_approval: l.require_approval,
    approval_ttl_hours: l.approval_ttl_hours,
    active: l.active,
    secret_last4: l.signing_secret_last4,
    created_at: l.created_at,
    updated_at: l.updated_at,
  };
}

/** `whsec_` + 48 hex: legível como "uma chave de assinatura" e longa o bastante para HMAC. */
export function novaChaveDeAssinatura(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

/**
 * O interruptor da organização e os servidores MCP, lidos só se a lista tem alguma ferramenta MCP
 * (quem não usa o recurso não paga por ele).
 */
async function contextoDoMcp(
  admin: SupabaseClient,
  organizationId: string,
  linhas: readonly LinhaPublica[],
): Promise<ContextoDoMcp> {
  if (!linhas.some((l) => l.kind === "mcp")) return SEM_MCP;
  const [{ data: org, error: erroDaOrg }, { data: servidores, error: erroDosServidores }] = await Promise.all([
    admin.from("organizations").select("settings").eq("id", organizationId).maybeSingle(),
    admin.from("mcp_servers").select("id, name, active").eq("organization_id", organizationId),
  ]);
  if (erroDosServidores) throw new Error(`leitura dos servidores MCP falhou: ${erroDosServidores.message}`);
  return {
    // Falha de leitura do interruptor = desligado (falha fechada).
    ligado: !erroDaOrg && lerConfigDeMcp((org as { settings?: unknown } | null)?.settings ?? {}).ligado,
    servidores: new Map(
      ((servidores ?? []) as Array<{ id: string; name: string; active: boolean }>).map((s) => [
        s.id,
        { name: s.name, active: s.active },
      ]),
    ),
  };
}

export async function listarFerramentas(
  admin: SupabaseClient,
  organizationId: string,
  opcoes: { tipo?: TipoDaFerramenta } = {},
): Promise<FerramentaExterna[]> {
  let consulta = admin.from("agent_external_tools").select(COLUNAS_PUBLICAS).eq("organization_id", organizationId);
  if (opcoes.tipo) consulta = consulta.eq("kind", opcoes.tipo);
  const { data, error } = await consulta.order("created_at", { ascending: true });
  if (error) throw new Error(`leitura das ferramentas externas falhou: ${error.message}`);
  const linhas = (data ?? []) as unknown as LinhaPublica[];
  const mcp = await contextoDoMcp(admin, organizationId, linhas);
  return linhas.map((l) => paraFerramenta(l, mcp));
}

export async function buscarFerramenta(
  admin: SupabaseClient,
  organizationId: string,
  id: string,
): Promise<FerramentaExterna | null> {
  const { data, error } = await admin
    .from("agent_external_tools")
    .select(COLUNAS_PUBLICAS)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`leitura da ferramenta externa falhou: ${error.message}`);
  if (!data) return null;
  const linha = data as unknown as LinhaPublica;
  return paraFerramenta(linha, await contextoDoMcp(admin, organizationId, [linha]));
}

export type ResultadoDaCriacao =
  | { ok: true; ferramenta: FerramentaExterna; chave: string }
  | { ok: false; erro: "cifra_indisponivel" | "erro_ao_gravar"; detalhe?: string };

export async function criarFerramenta(
  admin: SupabaseClient,
  input: { organizationId: string; atorId: string; dados: CriarFerramentaInput },
): Promise<ResultadoDaCriacao> {
  const chave = novaChaveDeAssinatura();
  const cifrada = await encryptWebhookSecret(admin, chave);
  // Sem cifra, não grava: chave em claro no banco não é um "modo degradado".
  if (!cifrada) return { ok: false, erro: "cifra_indisponivel" };

  // O identificador é único por organização. Duas criações simultâneas podem ler a
  // mesma lista e escolher o mesmo slug: o índice único decide, e a perdedora relê.
  let detalhe: string | undefined;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { data: usados, error: erroDeLeitura } = await admin
      .from("agent_external_tools")
      .select("slug")
      .eq("organization_id", input.organizationId);
    if (erroDeLeitura) return { ok: false, erro: "erro_ao_gravar", detalhe: erroDeLeitura.message };
    const slug = slugDaFerramenta(
      input.dados.nome,
      new Set(((usados ?? []) as Array<{ slug: string }>).map((u) => u.slug)),
    );
    const { data, error } = await admin
      .from("agent_external_tools")
      .insert({
        organization_id: input.organizationId,
        name: input.dados.nome,
        slug,
        when_to_use: input.dados.quando_usar,
        url: input.dados.url,
        parameters: input.dados.parametros,
        effect: input.dados.efeito,
        // Ausente = «o padrão do efeito»: a coluna fica NULA e quem decide é `decidirSePedeAprovacao`.
        require_approval: input.dados.pedir_aprovacao ?? null,
        ...(input.dados.validade_horas !== undefined ? { approval_ttl_hours: input.dados.validade_horas } : {}),
        active: true,
        signing_secret_encrypted: cifrada,
        signing_secret_last4: chave.slice(-4),
        created_by: input.atorId,
        updated_by: input.atorId,
      })
      .select(COLUNAS_PUBLICAS)
      .single();
    if (!error && data) return { ok: true, ferramenta: paraFerramenta(data as unknown as LinhaPublica), chave };
    detalhe = error?.message;
    if (error?.code !== "23505") break;
  }
  return { ok: false, erro: "erro_ao_gravar", detalhe };
}

/** Os campos que mudaram, pelo nome — é o que a auditoria registra (nunca os valores). */
export function camposAlterados(patch: EditarFerramentaInput): string[] {
  return Object.keys(patch).sort();
}

export async function editarFerramenta(
  admin: SupabaseClient,
  input: { organizationId: string; id: string; atorId: string; patch: EditarFerramentaInput },
): Promise<FerramentaExterna | null> {
  const { patch } = input;
  const mudanca: Record<string, unknown> = { updated_by: input.atorId };
  if (patch.nome !== undefined) mudanca.name = patch.nome;
  if (patch.quando_usar !== undefined) mudanca.when_to_use = patch.quando_usar;
  if (patch.url !== undefined) mudanca.url = patch.url;
  if (patch.parametros !== undefined) mudanca.parameters = patch.parametros;
  if (patch.efeito !== undefined) mudanca.effect = patch.efeito;
  // Trocar o EFEITO sem decidir a chave devolve a chave ao padrão do efeito. Sem isto, uma consulta
  // que alguém desligou de propósito virava «altera dados» herdando uma decisão que não era para ela.
  if (patch.pedir_aprovacao !== undefined) mudanca.require_approval = patch.pedir_aprovacao;
  else if (patch.efeito !== undefined) mudanca.require_approval = null;
  if (patch.validade_horas !== undefined) mudanca.approval_ttl_hours = patch.validade_horas;
  if (patch.ativa !== undefined) mudanca.active = patch.ativa;
  // O identificador (`slug`) NÃO muda quando o nome muda: versões publicadas e o
  // histórico de chamadas o conhecem, e renomeá-lo trocaria o nome que o modelo vê
  // no meio de uma conversa.
  const { data, error } = await admin
    .from("agent_external_tools")
    .update(mudanca)
    .eq("organization_id", input.organizationId)
    .eq("id", input.id)
    .select(COLUNAS_PUBLICAS)
    .maybeSingle();
  if (error) throw new Error(`edição da ferramenta externa falhou: ${error.message}`);
  if (!data) return null;
  const linha = data as unknown as LinhaPublica;
  return paraFerramenta(linha, await contextoDoMcp(admin, input.organizationId, [linha]));
}

export type ResultadoDaNovaChave =
  | { ok: true; ferramenta: FerramentaExterna; chave: string }
  | { ok: false; erro: "cifra_indisponivel" | "nao_encontrada" };

export async function rotacionarChave(
  admin: SupabaseClient,
  input: { organizationId: string; id: string; atorId: string },
): Promise<ResultadoDaNovaChave> {
  const chave = novaChaveDeAssinatura();
  const cifrada = await encryptWebhookSecret(admin, chave);
  if (!cifrada) return { ok: false, erro: "cifra_indisponivel" };
  const { data, error } = await admin
    .from("agent_external_tools")
    .update({ signing_secret_encrypted: cifrada, signing_secret_last4: chave.slice(-4), updated_by: input.atorId })
    .eq("organization_id", input.organizationId)
    .eq("id", input.id)
    .select(COLUNAS_PUBLICAS)
    .maybeSingle();
  if (error) throw new Error(`troca da chave da ferramenta externa falhou: ${error.message}`);
  if (!data) return { ok: false, erro: "nao_encontrada" };
  return { ok: true, ferramenta: paraFerramenta(data as unknown as LinhaPublica), chave };
}

export type ResultadoDaRemocao = "apagada" | "em_uso" | "nao_encontrada";

/**
 * Apagar só vale para ferramenta que NENHUMA versão de agente cita. Versão publicada
 * é imutável e guarda o id: apagar a ferramenta deixaria o histórico apontando para
 * o vazio. Quem já foi usada se DESATIVA.
 */
export async function apagarFerramenta(
  admin: SupabaseClient,
  organizationId: string,
  id: string,
): Promise<ResultadoDaRemocao> {
  const { data: citada, error: erroDeUso } = await admin
    .from("ai_agent_versions")
    .select("id")
    .eq("organization_id", organizationId)
    .contains("external_tool_ids", [id])
    .limit(1);
  if (erroDeUso) throw new Error(`conferência de uso da ferramenta externa falhou: ${erroDeUso.message}`);
  if ((citada ?? []).length > 0) return "em_uso";
  const { data, error } = await admin
    .from("agent_external_tools")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`remoção da ferramenta externa falhou: ${error.message}`);
  return (data ?? []).length > 0 ? "apagada" : "nao_encontrada";
}

/**
 * O segredo da ferramenta em claro, ou `null` (sem linha, cifra indisponível, leitura falhou). Nunca lança.
 * Webhook: a chave de assinatura. MCP: a credencial do SERVIDOR dela (`null` também quando o servidor
 * não tem credencial — quem chama sabe, pelo servidor, se havia uma a ler).
 */
export async function lerChaveDaFerramenta(
  admin: SupabaseClient,
  organizationId: string,
  id: string,
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("agent_external_tools")
      .select("signing_secret_encrypted, mcp_server_id")
      .eq("organization_id", organizationId)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      logger.warn("[ferramentas-externas] leitura da chave falhou", { organization_id: organizationId, error: error.message });
      return null;
    }
    const linha = data as { signing_secret_encrypted: string | null; mcp_server_id: string | null } | null;
    if (linha?.mcp_server_id) return await lerCredencialDoServidor(admin, organizationId, linha.mcp_server_id);
    return linha?.signing_secret_encrypted ? await decryptWebhookSecret(admin, linha.signing_secret_encrypted) : null;
  } catch (err) {
    logger.warn("[ferramentas-externas] leitura da chave falhou", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export type ConferenciaDaVersao = { ok: true } | { ok: false; motivo: "inexistente"; ausentes: string[] };

/**
 * A conferência que o schema compartilhado com o browser não faz (é consulta
 * cross-row): cada id citado por uma versão do agente existe e é desta organização. Quem
 * escreve a versão (rotas e ações) chama isto antes de gravar. A ferramenta que ALTERA algo
 * pode ser citada: o que a segura é o pedido de aprovação, na hora da chamada.
 */
export async function conferirFerramentasDaVersao(
  admin: SupabaseClient,
  organizationId: string,
  ids: readonly string[],
): Promise<ConferenciaDaVersao> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return { ok: true };
  const { data, error } = await admin
    .from("agent_external_tools")
    .select("id")
    .eq("organization_id", organizationId)
    .in("id", unicos);
  if (error) throw new Error(`conferência das ferramentas externas falhou: ${error.message}`);
  const achadas = new Set(((data ?? []) as Array<{ id: string }>).map((l) => l.id));
  const ausentes = unicos.filter((id) => !achadas.has(id));
  if (ausentes.length > 0) return { ok: false, motivo: "inexistente", ausentes };
  return { ok: true };
}

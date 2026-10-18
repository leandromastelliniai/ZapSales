/**
 * O cadastro dos servidores MCP e das ferramentas que o administrador escolheu neles, visto pela
 * API (cliente `service_role` do PostgREST). A tabela é server-side only (migration 0553): RLS
 * ligada, zero policies, grants revogados de anon/authenticated. A cerca entre organizações é o
 * filtro `organization_id` que TODA consulta daqui carrega — o id da organização vem sempre da
 * sessão (quem chama), nunca do corpo do pedido.
 *
 * A credencial nasce na tela, é cifrada por `fn_encrypt_oauth` e NUNCA volta: depois só os 4
 * últimos caracteres saem. O servidor precisa dela a cada chamada; o browser não.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";

import { slugDaFerramenta } from "../esquema";
import { VALIDADE_DO_PEDIDO_HORAS } from "../tipos";
import type { ServidorMcp } from "./cliente";
import type { CriarServidorInput, EditarServidorInput } from "./esquema-api";
import type { EscolhidaExistente, ItemPreparado } from "./selecao";
import { CABECALHO_PADRAO_DA_CREDENCIAL, type InfoDoServidor } from "./tipos";

export interface ServidorCadastrado {
  id: string;
  name: string;
  url: string;
  auth_header: string;
  active: boolean;
  has_credential: boolean;
  /** Os 4 últimos caracteres da credencial — nunca a credencial. */
  credential_last4: string | null;
  server_name: string | null;
  server_version: string | null;
  last_check_at: string | null;
  last_check_ok: boolean | null;
  last_check_reason: string | null;
  /** Quantas ferramentas deste servidor estão disponíveis para os agentes. */
  tools_enabled: number;
  created_at: string;
  updated_at: string;
}

/** Tudo menos a credencial cifrada: a coluna `credential_encrypted` nunca é selecionada para a tela. */
const COLUNAS_PUBLICAS =
  "id, name, url, auth_header, active, credential_last4, server_name, server_version, last_check_at, last_check_ok, last_check_reason, created_at, updated_at";

interface LinhaPublica {
  id: string;
  name: string;
  url: string;
  auth_header: string;
  active: boolean;
  credential_last4: string | null;
  server_name: string | null;
  server_version: string | null;
  last_check_at: string | null;
  last_check_ok: boolean | null;
  last_check_reason: string | null;
  created_at: string;
  updated_at: string;
}

function paraServidor(l: LinhaPublica, ferramentasLigadas = 0): ServidorCadastrado {
  return {
    id: l.id,
    name: l.name,
    url: l.url,
    auth_header: l.auth_header,
    active: l.active,
    has_credential: l.credential_last4 !== null,
    credential_last4: l.credential_last4,
    server_name: l.server_name,
    server_version: l.server_version,
    last_check_at: l.last_check_at,
    last_check_ok: l.last_check_ok,
    last_check_reason: l.last_check_reason,
    tools_enabled: ferramentasLigadas,
    created_at: l.created_at,
    updated_at: l.updated_at,
  };
}

async function contarFerramentasLigadas(admin: SupabaseClient, organizationId: string): Promise<Map<string, number>> {
  const { data, error } = await admin
    .from("agent_external_tools")
    .select("mcp_server_id")
    .eq("organization_id", organizationId)
    .eq("kind", "mcp")
    .eq("active", true);
  if (error) throw new Error(`contagem das ferramentas MCP falhou: ${error.message}`);
  const contagem = new Map<string, number>();
  for (const l of (data ?? []) as Array<{ mcp_server_id: string | null }>) {
    if (l.mcp_server_id) contagem.set(l.mcp_server_id, (contagem.get(l.mcp_server_id) ?? 0) + 1);
  }
  return contagem;
}

export async function listarServidores(admin: SupabaseClient, organizationId: string): Promise<ServidorCadastrado[]> {
  const { data, error } = await admin
    .from("mcp_servers")
    .select(COLUNAS_PUBLICAS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`leitura dos servidores MCP falhou: ${error.message}`);
  const ligadas = await contarFerramentasLigadas(admin, organizationId);
  return ((data ?? []) as unknown as LinhaPublica[]).map((l) => paraServidor(l, ligadas.get(l.id) ?? 0));
}

export async function buscarServidor(
  admin: SupabaseClient,
  organizationId: string,
  id: string,
): Promise<ServidorCadastrado | null> {
  const { data, error } = await admin
    .from("mcp_servers")
    .select(COLUNAS_PUBLICAS)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`leitura do servidor MCP falhou: ${error.message}`);
  if (!data) return null;
  const ligadas = await contarFerramentasLigadas(admin, organizationId);
  return paraServidor(data as unknown as LinhaPublica, ligadas.get(id) ?? 0);
}

export type ResultadoDaCriacaoDoServidor =
  | { ok: true; servidor: ServidorCadastrado }
  | { ok: false; erro: "cifra_indisponivel" | "nome_em_uso" | "erro_ao_gravar"; detalhe?: string };

export async function criarServidor(
  admin: SupabaseClient,
  input: { organizationId: string; atorId: string; dados: CriarServidorInput },
): Promise<ResultadoDaCriacaoDoServidor> {
  let cifrada: string | null = null;
  if (input.dados.credencial !== undefined) {
    cifrada = await encryptWebhookSecret(admin, input.dados.credencial);
    // Sem cifra, não grava: credencial em claro no banco não é um «modo degradado».
    if (!cifrada) return { ok: false, erro: "cifra_indisponivel" };
  }
  const { data, error } = await admin
    .from("mcp_servers")
    .insert({
      organization_id: input.organizationId,
      name: input.dados.nome,
      url: input.dados.url,
      auth_header: input.dados.cabecalho,
      credential_encrypted: cifrada,
      credential_last4: input.dados.credencial !== undefined ? input.dados.credencial.slice(-4) : null,
      created_by: input.atorId,
      updated_by: input.atorId,
    })
    .select(COLUNAS_PUBLICAS)
    .single();
  if (error || !data) {
    return { ok: false, erro: error?.code === "23505" ? "nome_em_uso" : "erro_ao_gravar", detalhe: error?.message };
  }
  return { ok: true, servidor: paraServidor(data as unknown as LinhaPublica) };
}

/** Os campos que mudaram, pelo nome — é o que a auditoria registra (nunca os valores). */
export function camposAlteradosDoServidor(patch: EditarServidorInput): string[] {
  return Object.keys(patch).sort();
}

export type ResultadoDaEdicaoDoServidor =
  | { ok: true; servidor: ServidorCadastrado }
  | { ok: false; erro: "nao_encontrado" | "cifra_indisponivel" | "nome_em_uso" | "erro_ao_gravar"; detalhe?: string };

export async function editarServidor(
  admin: SupabaseClient,
  input: { organizationId: string; id: string; atorId: string; patch: EditarServidorInput },
): Promise<ResultadoDaEdicaoDoServidor> {
  const { patch } = input;
  const mudanca: Record<string, unknown> = { updated_by: input.atorId };
  if (patch.nome !== undefined) mudanca.name = patch.nome;
  if (patch.url !== undefined) mudanca.url = patch.url;
  if (patch.cabecalho !== undefined) mudanca.auth_header = patch.cabecalho;
  if (patch.ativo !== undefined) mudanca.active = patch.ativo;
  if (patch.credencial === null) {
    mudanca.credential_encrypted = null;
    mudanca.credential_last4 = null;
  } else if (patch.credencial !== undefined) {
    const cifrada = await encryptWebhookSecret(admin, patch.credencial);
    if (!cifrada) return { ok: false, erro: "cifra_indisponivel" };
    mudanca.credential_encrypted = cifrada;
    mudanca.credential_last4 = patch.credencial.slice(-4);
  }
  // Trocar o endereço, o cabeçalho ou a credencial invalida o último teste de conexão: ele falava de
  // OUTRA coisa. A tela volta a dizer «ainda não testado».
  if (patch.url !== undefined || patch.cabecalho !== undefined || patch.credencial !== undefined) {
    mudanca.last_check_at = null;
    mudanca.last_check_ok = null;
    mudanca.last_check_reason = null;
  }
  const { data, error } = await admin
    .from("mcp_servers")
    .update(mudanca)
    .eq("organization_id", input.organizationId)
    .eq("id", input.id)
    .select(COLUNAS_PUBLICAS)
    .maybeSingle();
  if (error) {
    return { ok: false, erro: error.code === "23505" ? "nome_em_uso" : "erro_ao_gravar", detalhe: error.message };
  }
  if (!data) return { ok: false, erro: "nao_encontrado" };
  const ligadas = await contarFerramentasLigadas(admin, input.organizationId);
  return { ok: true, servidor: paraServidor(data as unknown as LinhaPublica, ligadas.get(input.id) ?? 0) };
}

/** Grava o resultado do último teste de conexão. Nunca lança (o teste já aconteceu; a tela não vira 500). */
export async function registrarConexao(
  admin: SupabaseClient,
  organizationId: string,
  id: string,
  resultado: { ok: true; info: InfoDoServidor } | { ok: false; motivo: string },
): Promise<void> {
  try {
    const { error } = await admin
      .from("mcp_servers")
      .update({
        last_check_at: new Date().toISOString(),
        last_check_ok: resultado.ok,
        last_check_reason: resultado.ok ? null : resultado.motivo,
        ...(resultado.ok ? { server_name: resultado.info.nome, server_version: resultado.info.versao } : {}),
      })
      .eq("organization_id", organizationId)
      .eq("id", id);
    if (error) {
      logger.warn("[mcp] o resultado do teste de conexão não foi gravado", {
        organization_id: organizationId,
        error: error.message,
      });
    }
  } catch (err) {
    logger.warn("[mcp] o resultado do teste de conexão não foi gravado", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export type ResultadoDaRemocaoDoServidor = "apagado" | "em_uso" | "nao_encontrado";

/**
 * Apagar só vale para servidor cujas ferramentas NENHUMA versão de agente cita. Versão publicada é
 * imutável e guarda o id da ferramenta: apagar o servidor (que apaga as ferramentas em cascata)
 * deixaria o histórico apontando para o vazio. Quem já foi usado se DESATIVA.
 */
export async function apagarServidor(
  admin: SupabaseClient,
  organizationId: string,
  id: string,
): Promise<ResultadoDaRemocaoDoServidor> {
  const { data: tools, error: erroDasFerramentas } = await admin
    .from("agent_external_tools")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("mcp_server_id", id);
  if (erroDasFerramentas) throw new Error(`leitura das ferramentas do servidor falhou: ${erroDasFerramentas.message}`);
  for (const t of (tools ?? []) as Array<{ id: string }>) {
    const { data: citada, error } = await admin
      .from("ai_agent_versions")
      .select("id")
      .eq("organization_id", organizationId)
      .contains("external_tool_ids", [t.id])
      .limit(1);
    if (error) throw new Error(`conferência de uso do servidor falhou: ${error.message}`);
    if ((citada ?? []).length > 0) return "em_uso";
  }
  const { data, error } = await admin
    .from("mcp_servers")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`remoção do servidor MCP falhou: ${error.message}`);
  return (data ?? []).length > 0 ? "apagado" : "nao_encontrado";
}

export interface ServidorParaChamar {
  nome: string;
  ativo: boolean;
  servidor: ServidorMcp;
  temCredencial: boolean;
  /** `false` = há credencial gravada e ela não pôde ser lida: quem chama NÃO tenta «sem autenticação». */
  credencialLegivel: boolean;
}

/** O servidor com a credencial em claro, para uma chamada. Nunca lança; `null` = sem linha (ou outra organização). */
export async function carregarServidorParaChamar(
  admin: SupabaseClient,
  organizationId: string,
  id: string,
): Promise<ServidorParaChamar | null> {
  try {
    const { data, error } = await admin
      .from("mcp_servers")
      .select("name, url, auth_header, active, credential_encrypted")
      .eq("organization_id", organizationId)
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      if (error) logger.warn("[mcp] leitura do servidor falhou", { organization_id: organizationId, error: error.message });
      return null;
    }
    const linha = data as unknown as {
      name: string;
      url: string;
      auth_header: string;
      active: boolean;
      credential_encrypted: string | null;
    };
    const temCredencial = linha.credential_encrypted !== null;
    const credencial = temCredencial ? await decryptWebhookSecret(admin, linha.credential_encrypted as string) : null;
    return {
      nome: linha.name,
      ativo: linha.active,
      servidor: { url: linha.url, credencial, cabecalho: linha.auth_header || CABECALHO_PADRAO_DA_CREDENCIAL },
      temCredencial,
      credencialLegivel: !temCredencial || credencial !== null,
    };
  } catch (err) {
    logger.warn("[mcp] leitura do servidor falhou", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** A credencial em claro de um servidor, ou `null` (sem credencial, cifra indisponível, leitura falhou). Nunca lança. */
export async function lerCredencialDoServidor(
  admin: SupabaseClient,
  organizationId: string,
  id: string,
): Promise<string | null> {
  return (await carregarServidorParaChamar(admin, organizationId, id))?.servidor.credencial ?? null;
}

// ─── As ferramentas que o administrador escolheu ─────────────────────────────

interface LinhaDeFerramenta {
  id: string;
  mcp_tool_name: string;
  effect: string;
  require_approval: boolean | null;
  approval_ttl_hours: number;
  active: boolean;
  when_to_use: string;
  mcp_definition_hash: string | null;
}

export async function ferramentasEscolhidasDoServidor(
  admin: SupabaseClient,
  organizationId: string,
  servidorId: string,
): Promise<EscolhidaExistente[]> {
  const { data, error } = await admin
    .from("agent_external_tools")
    .select("id, mcp_tool_name, effect, require_approval, approval_ttl_hours, active, when_to_use, mcp_definition_hash")
    .eq("organization_id", organizationId)
    .eq("mcp_server_id", servidorId)
    .eq("kind", "mcp");
  if (error) throw new Error(`leitura das ferramentas do servidor falhou: ${error.message}`);
  return ((data ?? []) as unknown as LinhaDeFerramenta[]).map((l) => ({
    id: l.id,
    nomeNoServidor: l.mcp_tool_name,
    // Vocabulário desconhecido cai em «altera»: falha FECHADA.
    efeito: l.effect === "consulta" ? ("consulta" as const) : ("altera" as const),
    pedirAprovacao: l.require_approval,
    validadeHoras: l.approval_ttl_hours,
    ativa: l.active,
    quandoUsar: l.when_to_use,
    impressao: l.mcp_definition_hash,
  }));
}

export interface ResumoDaSelecaoGravada {
  criadas: number;
  atualizadas: number;
  /** Tiradas da seleção mas citadas por alguma versão de agente: ficam, desativadas. */
  desativadas: number;
  removidas: number;
}

/**
 * Faz a seleção valer: as ferramentas dos `itens` ficam disponíveis (criadas ou atualizadas, ativas)
 * e TODAS as outras deste servidor saem. Quem já foi citada por uma versão publicada de agente não é
 * apagada (a versão é imutável e guarda o id): é desativada. Itens já vêm validados por
 * `prepararSelecao`; aqui só se grava.
 *
 * O servidor só pode alterar a organização da sessão: tudo filtra `organization_id`.
 */
export async function aplicarSelecao(
  admin: SupabaseClient,
  input: { organizationId: string; atorId: string; servidorId: string; itens: readonly ItemPreparado[] },
): Promise<ResumoDaSelecaoGravada> {
  const { organizationId, servidorId } = input;
  const existentes = await ferramentasEscolhidasDoServidor(admin, organizationId, servidorId);
  const porNome = new Map(existentes.map((e) => [e.nomeNoServidor, e]));
  const resumo: ResumoDaSelecaoGravada = { criadas: 0, atualizadas: 0, desativadas: 0, removidas: 0 };

  const { data: usados, error: erroDeSlugs } = await admin
    .from("agent_external_tools")
    .select("slug")
    .eq("organization_id", organizationId);
  if (erroDeSlugs) throw new Error(`leitura dos identificadores falhou: ${erroDeSlugs.message}`);
  const slugsEmUso = new Set(((usados ?? []) as Array<{ slug: string }>).map((u) => u.slug));

  for (const item of input.itens) {
    const campos = {
      name: item.nome,
      when_to_use: item.quandoUsar,
      parameters: item.parametros,
      effect: item.efeito,
      require_approval: item.pedirAprovacao,
      ...(item.validadeHoras !== null ? { approval_ttl_hours: item.validadeHoras } : { approval_ttl_hours: VALIDADE_DO_PEDIDO_HORAS.padrao }),
      active: true,
      mcp_definition_hash: item.impressao,
      mcp_hint_read_only: item.dicaSomenteLeitura,
      updated_by: input.atorId,
    };
    const existente = porNome.get(item.nomeNoServidor);
    if (existente) {
      const { error } = await admin
        .from("agent_external_tools")
        .update(campos)
        .eq("organization_id", organizationId)
        .eq("id", existente.id);
      if (error) throw new Error(`atualização da ferramenta MCP falhou: ${error.message}`);
      resumo.atualizadas++;
      continue;
    }
    // O identificador é único por organização: duas seleções simultâneas podem ler a mesma lista e
    // escolher o mesmo slug. O índice único decide, e a perdedora relê.
    let gravou = false;
    let detalhe: string | undefined;
    for (let tentativa = 0; tentativa < 3 && !gravou; tentativa++) {
      const slug = slugDaFerramenta(item.nome, slugsEmUso);
      const { error } = await admin.from("agent_external_tools").insert({
        organization_id: organizationId,
        slug,
        kind: "mcp",
        mcp_server_id: servidorId,
        mcp_tool_name: item.nomeNoServidor,
        url: null,
        signing_secret_encrypted: null,
        signing_secret_last4: null,
        created_by: input.atorId,
        ...campos,
      });
      if (!error) {
        slugsEmUso.add(slug);
        gravou = true;
        break;
      }
      detalhe = error.message;
      if (error.code !== "23505") break;
      slugsEmUso.add(slug);
    }
    if (!gravou) throw new Error(`cadastro da ferramenta MCP falhou: ${detalhe ?? "erro desconhecido"}`);
    resumo.criadas++;
  }

  const escolhidas = new Set(input.itens.map((i) => i.nomeNoServidor));
  for (const e of existentes) {
    if (escolhidas.has(e.nomeNoServidor)) continue;
    const { data: citada, error: erroDeUso } = await admin
      .from("ai_agent_versions")
      .select("id")
      .eq("organization_id", organizationId)
      .contains("external_tool_ids", [e.id])
      .limit(1);
    if (erroDeUso) throw new Error(`conferência de uso da ferramenta MCP falhou: ${erroDeUso.message}`);
    if ((citada ?? []).length > 0) {
      if (e.ativa) {
        const { error } = await admin
          .from("agent_external_tools")
          .update({ active: false, updated_by: input.atorId })
          .eq("organization_id", organizationId)
          .eq("id", e.id);
        if (error) throw new Error(`desativação da ferramenta MCP falhou: ${error.message}`);
        resumo.desativadas++;
      }
      continue;
    }
    const { error } = await admin
      .from("agent_external_tools")
      .delete()
      .eq("organization_id", organizationId)
      .eq("id", e.id);
    if (error) throw new Error(`remoção da ferramenta MCP falhou: ${error.message}`);
    resumo.removidas++;
  }
  return resumo;
}

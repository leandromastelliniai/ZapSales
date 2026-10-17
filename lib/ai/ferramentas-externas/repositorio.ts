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
import type { EfeitoDaFerramenta, ParametroDaFerramenta } from "./tipos";
import { EFEITOS_DA_FERRAMENTA } from "./tipos";

export interface FerramentaExterna {
  id: string;
  name: string;
  slug: string;
  /** O nome que o modelo vê (`ext_<slug>`). */
  agent_name: string;
  when_to_use: string;
  url: string;
  parameters: ParametroDaFerramenta[];
  effect: EfeitoDaFerramenta;
  active: boolean;
  /** Os 4 últimos caracteres da chave de assinatura — nunca a chave. */
  secret_last4: string;
  created_at: string;
  updated_at: string;
}

/** Tudo menos a chave cifrada: a coluna `signing_secret_encrypted` nunca é selecionada para a tela. */
const COLUNAS_PUBLICAS =
  "id, name, slug, when_to_use, url, parameters, effect, active, signing_secret_last4, created_at, updated_at";

interface LinhaPublica {
  id: string;
  name: string;
  slug: string;
  when_to_use: string;
  url: string;
  parameters: unknown;
  effect: string;
  active: boolean;
  signing_secret_last4: string;
  created_at: string;
  updated_at: string;
}

export function paraFerramenta(l: LinhaPublica): FerramentaExterna {
  // Leitura DEFENSIVA do jsonb: linha escrita por fora da tela com formato estranho
  // vira "sem campos" (a ferramenta chama sem argumentos), nunca um 500 na lista.
  const parametros = parametrosLidos.safeParse(l.parameters);
  return {
    id: l.id,
    name: l.name,
    slug: l.slug,
    agent_name: nomeNoAgente(l.slug),
    when_to_use: l.when_to_use,
    url: l.url,
    parameters: parametros.success ? parametros.data : [],
    effect: (EFEITOS_DA_FERRAMENTA as readonly string[]).includes(l.effect) ? (l.effect as EfeitoDaFerramenta) : "altera",
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

export async function listarFerramentas(admin: SupabaseClient, organizationId: string): Promise<FerramentaExterna[]> {
  const { data, error } = await admin
    .from("agent_external_tools")
    .select(COLUNAS_PUBLICAS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`leitura das ferramentas externas falhou: ${error.message}`);
  return ((data ?? []) as unknown as LinhaPublica[]).map(paraFerramenta);
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
  return data ? paraFerramenta(data as unknown as LinhaPublica) : null;
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
  return data ? paraFerramenta(data as unknown as LinhaPublica) : null;
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

/** A chave de assinatura em claro, ou `null` (sem linha, cifra indisponível, leitura falhou). Nunca lança. */
export async function lerChaveDaFerramenta(
  admin: SupabaseClient,
  organizationId: string,
  id: string,
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("agent_external_tools")
      .select("signing_secret_encrypted")
      .eq("organization_id", organizationId)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      logger.warn("[ferramentas-externas] leitura da chave falhou", { organization_id: organizationId, error: error.message });
      return null;
    }
    const cifrada = (data as { signing_secret_encrypted: string | null } | null)?.signing_secret_encrypted;
    return cifrada ? await decryptWebhookSecret(admin, cifrada) : null;
  } catch (err) {
    logger.warn("[ferramentas-externas] leitura da chave falhou", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export type ConferenciaDaVersao =
  | { ok: true }
  | { ok: false; motivo: "inexistente"; ausentes: string[] }
  | { ok: false; motivo: "altera_bloqueada"; ids: string[] };

/**
 * A conferência que o schema compartilhado com o browser não faz (é consulta
 * cross-row): cada id citado por uma versão do agente existe, é desta organização e
 * é uma CONSULTA. Quem escreve a versão (rotas e ações) chama isto antes de gravar.
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
    .select("id, effect")
    .eq("organization_id", organizationId)
    .in("id", unicos);
  if (error) throw new Error(`conferência das ferramentas externas falhou: ${error.message}`);
  const achadas = new Map(((data ?? []) as Array<{ id: string; effect: string }>).map((l) => [l.id, l.effect]));
  const ausentes = unicos.filter((id) => !achadas.has(id));
  if (ausentes.length > 0) return { ok: false, motivo: "inexistente", ausentes };
  const altera = unicos.filter((id) => achadas.get(id) !== "consulta");
  if (altera.length > 0) return { ok: false, motivo: "altera_bloqueada", ids: altera };
  return { ok: true };
}

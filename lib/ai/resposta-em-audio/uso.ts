/**
 * O USO da voz, no mesmo lugar do uso de IA: `llm_calls`, a ÚNICA tabela de
 * telemetria de IA (migration 0130). É por isso que o custo de voz aparece em
 * Uso de IA e soma no gasto do mês que o teto de orçamento vigia
 * (`fn_gasto_de_ia_do_mes`) — uma segunda tabela seria uma segunda régua, e a
 * segunda régua sempre diverge.
 *
 * Mapa de colunas, para quem ler a linha depois:
 *   purpose        'voice_reply'
 *   provider       o provedor de voz (`openai_compativel` | `elevenlabs`)
 *   model          o modelo de voz
 *   input_tokens   CARACTERES convertidos (voz cobra por caractere, não por token)
 *   output_tokens  0
 *   cost_cents     centavos de dólar; `null` = preço desconhecido, nunca 0
 *
 * ⚠️ Service role: toda consulta filtra `organization_id` à mão, e o id vem de
 * fonte confiável (a linha do job ou a sessão).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { logger } from "@/lib/logger";

import type { MotivoDeFalhaDeVoz, ProvedorDeVozId } from "./tipos";

export const PURPOSE_DA_VOZ = "voice_reply";

export interface UsoDaVoz {
  organizationId: string;
  contactId: string | null;
  jobId: string | null;
  agentId: string | null;
  provedor: ProvedorDeVozId;
  modelo: string;
  caracteres: number;
  custoCents: number | null;
  latenciaMs: number;
  /** Presente = a síntese falhou (e a resposta saiu em texto). */
  falha?: MotivoDeFalhaDeVoz | "armazenamento_falhou";
}

/**
 * Grava a linha de uso pelo pool do worker (o mesmo `pg` do resto do motor).
 * NUNCA lança: telemetria não derruba a resposta ao cliente.
 */
export async function registrarUsoDaVoz(db: Queryable, u: UsoDaVoz): Promise<void> {
  try {
    await db.query(
      `insert into llm_calls
         (organization_id, contact_id, job_id, agent_id, purpose, provider, model,
          input_tokens, output_tokens, cost_cents, latency_ms, status, error_code)
       values ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11,$12)`,
      [
        u.organizationId,
        u.contactId,
        u.jobId,
        u.agentId,
        PURPOSE_DA_VOZ,
        u.provedor,
        u.modelo,
        u.caracteres,
        u.falha ? null : u.custoCents,
        u.latenciaMs,
        u.falha ? "erro" : "ok",
        u.falha ?? null,
      ],
    );
  } catch (err) {
    logger.warn("[resposta-em-audio] uso não gravado", {
      organization_id: u.organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface ResumoDoUsoDaVoz {
  /** Primeiro dia do mês (UTC) a que o resumo se refere. */
  desde: string;
  respostasEmAudio: number;
  falhas: number;
  caracteres: number;
  /** Soma dos custos CONHECIDOS, em centavos de dólar. */
  custoCents: number;
  /** Quantas respostas ficaram sem preço (provedor/modelo sem preço declarado). */
  semPreco: number;
  /**
   * A falha mais recente do mês, em conversa real — é como a tela de configuração
   * conta que a chave parou de valer ou que a conta ficou sem créditos, sem
   * esperar o dono perceber que as respostas voltaram a sair em texto.
   */
  ultimaFalha: { motivo: string; em: string } | null;
}

/** O mês corrente (UTC) da organização — o mesmo recorte do gasto de IA. */
export async function resumoDoUsoDaVoz(
  admin: SupabaseClient,
  organizationId: string,
  agora: Date = new Date(),
): Promise<ResumoDoUsoDaVoz> {
  const desde = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)).toISOString();
  const { data, error } = await admin
    .from("llm_calls")
    .select("input_tokens, cost_cents, status, error_code, created_at")
    .eq("organization_id", organizationId)
    .eq("purpose", PURPOSE_DA_VOZ)
    .gte("created_at", desde)
    .limit(50_000);
  if (error) throw new Error(`leitura do uso da voz falhou: ${error.message}`);
  const linhas = (data ?? []) as Array<{
    input_tokens: number | null;
    cost_cents: number | string | null;
    status: string | null;
    error_code: string | null;
    created_at: string;
  }>;
  const resumo: ResumoDoUsoDaVoz = {
    desde,
    respostasEmAudio: 0,
    falhas: 0,
    caracteres: 0,
    custoCents: 0,
    semPreco: 0,
    ultimaFalha: null,
  };
  for (const l of linhas) {
    if (l.status === "erro") {
      resumo.falhas += 1;
      if (resumo.ultimaFalha === null || l.created_at > resumo.ultimaFalha.em) {
        resumo.ultimaFalha = { motivo: l.error_code ?? "desconhecido", em: l.created_at };
      }
      continue;
    }
    resumo.respostasEmAudio += 1;
    resumo.caracteres += l.input_tokens ?? 0;
    if (l.cost_cents === null) resumo.semPreco += 1;
    else resumo.custoCents += Number(l.cost_cents);
  }
  return resumo;
}

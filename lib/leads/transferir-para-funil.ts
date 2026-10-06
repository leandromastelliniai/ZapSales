/**
 * LEVAR O NEGÓCIO PARA OUTRO FUNIL — clonar no destino e encerrar a origem.
 *
 * Um negócio não muda de funil por `update`: o histórico de etapas e as métricas
 * de cada funil dependem de o card ter nascido nele. O caminho do produto é o da
 * rota `POST /api/v1/leads/[id]/clone`: o clone nasce no funil de destino (o que
 * se copia e a etapa que o recebe são de `clonar-para-funil.ts`) e a origem fecha
 * como perdida com o motivo canônico da transferência, que não conta como perda
 * comercial (`fn_attendant_metrics`, migration 0266).
 *
 * Mora aqui, e não dentro de um chamador, porque hoje são dois — a automação
 * (`create_or_move_lead`) e a resposta da campanha (issue #11). Duas cópias de
 * "trocar de funil" divergiriam na primeira mudança de uma delas.
 *
 * Devolve o erro em vez de lançar: cada chamador decide o que a falha vira (a
 * aba Atividade da automação, o log da ingestão).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { HandlerCtx } from "@/lib/api/handlers/types";
import { createLeadHandler } from "@/app/api/v1/leads/_handler";
import {
  escolheEtapaDeDestino,
  montaPayloadDoClone,
  recusaTrocaDeFunil,
  type EtapaDoFunil,
  type OrigemParaClonar,
} from "@/lib/leads/clonar-para-funil";
import { encerraDemanda } from "@/lib/leads/encerramento";
import { motivoDaPerdaDaOrigem } from "@/lib/leads/motivo-da-perda";

/** As colunas que o clone precisa copiar da origem. */
export const COLUNAS_DA_ORIGEM =
  "id, pipeline_id, status, title, description, contact_id, value_cents, currency, " +
  "owner_user_id, owner_agent_id, expected_close_date, tags, source, custom_fields, source_metadata";

export async function transferirParaFunil(
  admin: SupabaseClient,
  handlerCtx: HandlerCtx,
  origem: OrigemParaClonar,
  destino: { pipelineId: string; stageId: string; razaoNaTimeline: string },
): Promise<{ ok: true; clone: Record<string, unknown> } | { ok: false; error: string }> {
  const { pipelineId, stageId } = destino;
  const recusa = recusaTrocaDeFunil(origem, pipelineId);
  if (recusa) return { ok: false, error: recusa.code };

  const { data: etapas, error: etapasErr } = await admin
    .from("crm_stages")
    .select("id, pipeline_id, position, is_won, is_lost, is_archived")
    .eq("organization_id", handlerCtx.organization_id)
    .eq("pipeline_id", pipelineId)
    .eq("is_archived", false)
    .order("position", { ascending: true });
  if (etapasErr) return { ok: false, error: etapasErr.message };

  const alvo = escolheEtapaDeDestino((etapas ?? []) as EtapaDoFunil[], stageId);
  if (!alvo.ok) return { ok: false, error: alvo.code };

  // A origem precisa ter onde fechar — sem isso o clone nasceria com a origem
  // aberta, e o contato ficaria com dois negócios.
  const { data: etapaDePerda, error: perdaErr } = await admin
    .from("crm_stages")
    .select("id")
    .eq("organization_id", handlerCtx.organization_id)
    .eq("pipeline_id", origem.pipeline_id)
    .eq("is_lost", true)
    .eq("is_archived", false)
    .limit(1)
    .maybeSingle();
  if (perdaErr) return { ok: false, error: perdaErr.message };
  if (!etapaDePerda) return { ok: false, error: "origem_sem_etapa_de_perda" };

  const clone = await createLeadHandler(admin, handlerCtx, montaPayloadDoClone(origem, alvo.etapa));

  await encerraDemanda(admin, handlerCtx, {
    leadId: origem.id,
    desfecho: "lost",
    motivo: motivoDaPerdaDaOrigem(null),
    razaoNaTimeline: destino.razaoNaTimeline,
    payloadNaTimeline: { to_pipeline_id: pipelineId, to_lead_id: clone.id },
  });

  return { ok: true, clone: clone as unknown as Record<string, unknown> };
}

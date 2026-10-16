/**
 * O que a tela precisa saber de uma correção de resposta — e NADA além disso.
 *
 * Este módulo existe separado de `correcao-de-resposta.ts` de propósito: aquele
 * importa o anonimizador (lista de nomes, perfis legais por país), que é código de
 * servidor e pesado. A tela (formulário "Corrigir esta resposta" e a aba
 * Propostas) só precisa do limite do texto e do schema da evidência, e importar
 * do módulo grande levaria o anonimizador inteiro para o navegador.
 */
import { z } from "zod";

import { MENSAGEM_DO_TESTE_MAX, turnoDoTesteSchema } from "@/lib/ai/agents/teste-em-varias-trocas";

export const CORRECAO_MAX = 1500;

/**
 * O que `flywheel_distiller_proposals.evidence` guarda numa correção. É lido
 * SÓ por este schema — a tela não lê caminho de jsonb à mão.
 */
export const evidenciaDeCorrecaoSchema = z.object({
  origem: z.enum(["teste", "execucao"]),
  conversa: z.array(turnoDoTesteSchema),
  texto_original: z.string().max(MENSAGEM_DO_TESTE_MAX),
  texto_corrigido: z.string().max(CORRECAO_MAX),
  /** Mesma chave de `crm_lead_activities.evidence`: aponta para `llm_calls`. */
  llm_call_ids: z.array(z.string().uuid()).optional(),
});

export type EvidenciaDeCorrecao = z.infer<typeof evidenciaDeCorrecaoSchema>;

/** Lê a evidência de uma proposta; `null` quando não é de correção (ou está malformada). */
export function lerEvidenciaDeCorrecao(evidence: unknown): EvidenciaDeCorrecao | null {
  const r = evidenciaDeCorrecaoSchema.safeParse(evidence);
  return r.success ? r.data : null;
}

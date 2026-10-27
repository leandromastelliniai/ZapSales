"use client";

import { ResumoDoFunilFaixa } from "@/components/funil/ResumoDoFunil";
import { useAgentMapping } from "@/hooks/pipelines/useAgentMapping";
import { resumoDoFunil, vocabularioLido } from "@/lib/funil/resumo-do-funil";

/**
 * A faixa "Seu funil" ligada aos dados: lê a MESMA consulta que a seção de mapeamento (mesma chave
 * de cache, uma requisição só) e some enquanto ela carrega ou falha — quem avisa do erro é a seção
 * de baixo, e duas mensagens para a mesma falha só confundem.
 *
 * Lê o que está GRAVADO, não o rascunho da seção de mapeamento: a faixa é o retrato do funil, e
 * muda quando o dono salva.
 */
export function ResumoDoFunil({
  pipelineId,
  vocabulario,
}: {
  pipelineId: string;
  vocabulario: Record<string, string> | null;
}) {
  const { data } = useAgentMapping(pipelineId);
  if (!data) return null;
  return (
    <ResumoDoFunilFaixa
      pipelineId={pipelineId}
      resumo={resumoDoFunil(data.etapas, data.mapeamento)}
      vocabulario={vocabularioLido(vocabulario)}
    />
  );
}

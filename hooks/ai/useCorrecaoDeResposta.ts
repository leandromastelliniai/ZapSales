"use client";
/**
 * "Corrigir esta resposta" (issue #90): enviar a correção e, nas execuções reais,
 * ler a resposta que o agente enviou.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { TurnoDoTeste } from "@/lib/ai/agents/teste-em-varias-trocas";

/** De onde vem a resposta que se corrige. */
export type OrigemDaCorrecao =
  | { origem: "teste"; conversa: TurnoDoTeste[] }
  | { origem: "execucao"; chamadaId: string };

export function useEnviarCorrecao(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      origem,
      textoCorrigido,
      chave,
    }: {
      origem: OrigemDaCorrecao;
      textoCorrigido: string;
      /** Mesma chave enquanto o formulário não for enviado com sucesso: clique duplo = uma proposta. */
      chave: string;
    }) =>
      apiClient.post<{ data: { proposal_id: string; status: "pending" } }>(
        `/api/v1/ai/agents/${agentId}/corrections`,
        origem.origem === "teste"
          ? { origem: "teste", conversa: origem.conversa, texto_corrigido: textoCorrigido }
          : { origem: "execucao", chamada_id: origem.chamadaId, texto_corrigido: textoCorrigido },
        { idempotencyKey: chave },
      ),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["agent-proposals", agentId] });
    },
  });
}

/** A conversa até a resposta que uma execução real enviou (só turno de atendimento tem). */
export function useRespostaDaExecucao(agentId: string, chamadaId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["agent-run-reply", agentId, chamadaId],
    enabled: enabled && chamadaId !== null,
    retry: false,
    queryFn: () =>
      apiClient
        .get<{ data: { conversa: TurnoDoTeste[] } }>(
          `/api/v1/ai/agents/${agentId}/runs/${chamadaId}/reply`,
        )
        .then((r) => r.data),
  });
}

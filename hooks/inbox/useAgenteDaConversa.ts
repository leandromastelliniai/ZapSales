"use client";
/**
 * O agente de IA que está respondendo a conversa aberta, para o chip dizer
 * "Sofia (IA) atendendo". `null` = o chip diz só "IA atendendo".
 *
 * Só pergunta com a IA no comando (`ativo`). A chave inclui o instante da
 * última saída: uma resposta nova pode ser de outro agente (roteador), e é ela
 * que troca o nome — sem realtime próprio, só a conversa que já se atualiza.
 */
import { useQuery } from "@tanstack/react-query";

import { usePermission } from "@/hooks/auth/AuthProvider";
import { apiClient } from "@/lib/api/client";
import type { AgenteDaConversa } from "@/lib/inbox/agente-da-conversa";

export function useAgenteDaConversa(
  conversationId: string | null,
  ativo: boolean,
  ultimaSaida: string | null,
): AgenteDaConversa | null {
  const podeVer = usePermission("inbox.view");
  const query = useQuery({
    queryKey: ["agente-da-conversa", conversationId, ultimaSaida] as const,
    enabled: !!conversationId && ativo && podeVer,
    staleTime: 5 * 60_000,
    // Enfeite de contexto: uma falha aqui não merece toast — o chip segue "IA".
    queryFn: async () =>
      (
        await apiClient.get<{ data: AgenteDaConversa | null }>(
          `/api/v1/conversations/${conversationId}/agente-atual`,
        )
      ).data,
  });
  return query.data ?? null;
}

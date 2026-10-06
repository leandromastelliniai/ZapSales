"use client";
/**
 * A campanha e o modelo de origem da conversa aberta (issue #11). `null` quando
 * a conversa não nasceu de campanha — o caso comum, que não desenha nada.
 *
 * Sem realtime: a origem de uma conversa não muda depois que ela existe. O
 * cache por conversa basta.
 */
import { useQuery } from "@tanstack/react-query";

import { usePermission } from "@/hooks/auth/AuthProvider";
import type { CampanhaDaConversa } from "@/lib/campanhas/origem-do-lead";
import { apiClient } from "@/lib/api/client";

export function useCampanhaDaConversa(conversationId: string | null): CampanhaDaConversa | null {
  const podeVer = usePermission("inbox.view");
  const query = useQuery({
    queryKey: ["campanha-da-conversa", conversationId] as const,
    enabled: !!conversationId && podeVer,
    staleTime: 5 * 60_000,
    // A origem é enfeite de contexto: uma falha aqui não merece toast na cara
    // de quem está atendendo — a conversa continua inteira sem ela.
    queryFn: async () =>
      (
        await apiClient.get<{ data: CampanhaDaConversa | null }>(
          `/api/v1/conversations/${conversationId}/campanha`,
        )
      ).data,
  });
  return query.data ?? null;
}

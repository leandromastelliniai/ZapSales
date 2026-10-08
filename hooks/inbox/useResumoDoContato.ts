"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { formatCents } from "@/lib/money";
import type { FunilDaFaixa } from "@/components/inbox/visual/FaixaDaJornada";

/**
 * O que a FAIXA DA JORNADA precisa saber do contato: o funil do lead mais
 * recente (etapas na ordem e a atual), o valor e o próximo passo.
 *
 * Lê a MESMA rota da ficha (`GET /api/v1/contacts/{id}/crm-summary`), que já
 * resolve organização, permissão e etapas ativas no servidor. A ficha continua
 * buscando por conta própria; aqui é React Query para a faixa trocar de contato
 * sem piscar e reaproveitar a resposta enquanto ela vale.
 */
interface LeadDoResumo {
  id: string;
  value_cents: number | null;
  currency: string | null;
  stage_id: string | null;
  funil_nome: string | null;
  etapas_do_funil?: Array<{ id: string; name: string; is_won?: boolean; is_lost?: boolean }>;
}

interface DemandaDoResumo {
  proximo_passo: string | null;
  estado: string | null;
}

interface RespostaDoResumo {
  data: { leads: LeadDoResumo[]; demandas?: DemandaDoResumo[] };
}

export interface ResumoDaJornada {
  funil: FunilDaFaixa | null;
  valor: string | null;
  proximoPasso: string | null;
}

/** Função pura: a resposta da rota vira o que a faixa mostra. Testável sem rede. */
export function resumoDaJornada(resposta: RespostaDoResumo["data"]): ResumoDaJornada {
  // A rota devolve os leads do mais recente para o mais antigo: o primeiro é o
  // negócio em andamento, que é o que a faixa conta.
  const lead = resposta.leads[0] ?? null;
  const etapas = lead?.etapas_do_funil ?? [];
  const funil: FunilDaFaixa | null =
    lead && etapas.length > 0
      ? {
          nome: lead.funil_nome ?? "",
          etapas: etapas.map((e) => ({ id: e.id, nome: e.name, perdida: Boolean(e.is_lost) })),
          atualId: lead.stage_id,
        }
      : null;
  const valor =
    lead?.value_cents != null && lead.value_cents > 0
      ? formatCents(lead.value_cents, lead.currency ?? "BRL")
      : null;
  const proximoPasso =
    (resposta.demandas ?? []).find((d) => d.proximo_passo && d.estado !== "encerrada")?.proximo_passo ??
    null;
  return { funil, valor, proximoPasso };
}

export function useResumoDoContato(contactId: string | null | undefined) {
  return useQuery({
    queryKey: ["resumo-da-jornada", contactId],
    enabled: Boolean(contactId),
    staleTime: 30_000,
    queryFn: async () => {
      const r = await apiClient.get<RespostaDoResumo>(`/api/v1/contacts/${contactId}/crm-summary`);
      return resumoDaJornada(r.data);
    },
  });
}

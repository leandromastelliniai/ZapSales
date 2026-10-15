/**
 * Em que ponto do funil está o contato de cada conversa da LISTA da Inbox.
 *
 * A faixa da jornada (topo da conversa aberta) já mostrava o funil, lendo
 * `GET /contacts/{id}/crm-summary` contato a contato. A lista não pode fazer o
 * mesmo — seriam N requisições por página —, então o handler da lista chama
 * `buscarFunisDosContatos` UMA vez para a página inteira e pendura o resultado
 * em `funil_do_contato`.
 *
 * A regra é a MESMA da ficha, e é isso que este módulo protege: o lead mais
 * recente (`updated_at`) de um funil NÃO arquivado, com as etapas ATIVAS na
 * ordem do quadro. Se a lista escolhesse outro lead, a linha e a faixa da mesma
 * conversa contariam etapas diferentes, sem sintoma de erro em nenhuma das duas.
 *
 * Calculado na leitura, sem coluna nova (DIRC: Calcular) — a etapa muda no
 * quadro a qualquer momento, e uma cópia na conversa seria mais um campo para
 * sincronizar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

export interface EtapaDoFunilDaConversa {
  id: string;
  nome: string;
  perdida: boolean;
}

export interface FunilDaConversa {
  nome: string;
  etapas: EtapaDoFunilDaConversa[];
  etapa_atual_id: string | null;
}

interface EtapaBruta {
  id: string;
  name: string;
  position: number | string;
  is_lost?: boolean | null;
  is_archived?: boolean | null;
}

interface FunilBruto {
  name?: string | null;
  etapas?: EtapaBruta[] | null;
}

export interface LinhaDeLeadComFunil {
  contact_id: string;
  stage_id: string | null;
  updated_at: string;
  crm_pipelines: FunilBruto | FunilBruto[] | null;
}

/** Mesmo embed de `crm-summary/route.ts`, sem os campos que a linha não usa. */
const COLUNAS =
  "contact_id, stage_id, updated_at, crm_pipelines!inner(name, is_archived, etapas:crm_stages!crm_stages_pipeline_id_fkey(id, name, position, is_lost, is_archived))";

/** Função pura: linhas de `crm_leads` viram o funil de cada contato. */
export function funisPorContato(linhas: readonly LinhaDeLeadComFunil[]): Map<string, FunilDaConversa> {
  const maisRecente = new Map<string, LinhaDeLeadComFunil>();
  for (const linha of linhas) {
    const atual = maisRecente.get(linha.contact_id);
    if (!atual || linha.updated_at > atual.updated_at) maisRecente.set(linha.contact_id, linha);
  }

  const resultado = new Map<string, FunilDaConversa>();
  for (const [contato, linha] of maisRecente) {
    const funil = Array.isArray(linha.crm_pipelines) ? linha.crm_pipelines[0] : linha.crm_pipelines;
    const etapas = (funil?.etapas ?? [])
      .filter((e) => !e.is_archived)
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((e) => ({ id: e.id, nome: e.name, perdida: Boolean(e.is_lost) }));
    if (etapas.length === 0) continue;
    resultado.set(contato, { nome: funil?.name ?? "", etapas, etapa_atual_id: linha.stage_id });
  }
  return resultado;
}

/**
 * Uma consulta para a página inteira. Falha DEGRADA para mapa vazio: a linha do
 * funil é um enfeite da lista, e a lista de conversas não pode cair por ela.
 */
export async function buscarFunisDosContatos(
  supabase: SupabaseClient,
  organizationId: string,
  contactIds: readonly string[],
): Promise<Map<string, FunilDaConversa>> {
  const ids = [...new Set(contactIds)];
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("crm_leads")
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .in("contact_id", ids)
    // Arquivar o funil não fecha os leads; sem isto eles seguiam na linha.
    .eq("crm_pipelines.is_archived", false)
    .order("updated_at", { ascending: false });

  if (error) {
    logger.warn("[inbox.lista] funil dos contatos não carregou; a lista segue sem ele", {
      organization_id: organizationId,
      erro: error.message,
    });
    return new Map();
  }
  return funisPorContato((data ?? []) as unknown as LinhaDeLeadComFunil[]);
}

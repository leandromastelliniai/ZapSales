/**
 * As capacidades com que o agente de cada MODELO nasce.
 *
 * O dono decidiu (24/10/2026) que quem cria um agente pelo assistente não escolhe
 * capacidade nenhuma: o modelo escolhido já liga o que ele precisa, e a tela só diz, em
 * uma frase, o que o agente vai fazer. Quem quiser mexer abre o editor completo, que
 * continua mostrando todas.
 *
 * ⚠️ SÓ SERVIDOR. A lista sai do catálogo restrito às ferramentas que têm handler
 * (`catalogoComHandler` → `allTools`), e os handlers são código de servidor: importar
 * este módulo num componente de cliente arrasta o servidor para o pacote do navegador.
 * A página calcula `capacidadesPorModelo()` e entrega o resultado PRONTO às telas; o que o
 * navegador pode importar (a frase e o mapa de pacotes) mora em `o-que-o-modelo-faz.ts`.
 * `tests/unit/assistente-de-agente-sem-servidor-no-cliente.test.ts` cerca isso.
 *
 * Derivadas do catálogo em tempo de execução, como `capacidadesPadraoDoOnboarding`: uma
 * lista de ids copiada aqui envelheceria em silêncio na primeira capacidade nova.
 * `ligarPacote` já recusa a capacidade de risco crítico.
 */
import { ligarPacote } from "@/lib/mcp/tools/selecao-por-pacote";

import { catalogoComHandler } from "./capacidades-padrao";
import { IDS_DE_MODELO, type IdDoModelo } from "./modelos";
import { PACOTE_DO_MODELO } from "./o-que-o-modelo-faz";

export { PACOTE_DO_MODELO, fraseDoQueFaz } from "./o-que-o-modelo-faz";

/** Os ids das capacidades que o modelo liga, na ordem do catálogo. */
export function capacidadesDoModelo(id: IdDoModelo): string[] {
  return ligarPacote([], catalogoComHandler(), PACOTE_DO_MODELO[id]);
}

/** O modelo deixa o agente criar lead ou mover o card no funil? */
export function modeloMexeNoFunil(id: IdDoModelo): boolean {
  return capacidadesDoModelo(id).includes("crm_move_lead_stage");
}

/** O que a página entrega pronto às telas: as capacidades de cada modelo e se ele usa o funil. */
export type CapacidadesPorModelo = Record<IdDoModelo, { tool_ids: string[]; usa_funil: boolean }>;

export function capacidadesPorModelo(): CapacidadesPorModelo {
  const entradas = IDS_DE_MODELO.map((id) => {
    const tool_ids = capacidadesDoModelo(id);
    return [id, { tool_ids, usa_funil: tool_ids.includes("crm_move_lead_stage") }] as const;
  });
  return Object.fromEntries(entradas) as CapacidadesPorModelo;
}

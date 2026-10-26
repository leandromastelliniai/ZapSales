/**
 * "O QUE ESTE FLUXO FAZ" e "ELE VAI DISPARAR?", lidos do próprio fluxo.
 *
 * Quem abre o construtor via um grafo e nenhuma frase do que ele faz; e a regra mais
 * importante (o gatilho automático só dispara se um agente publicado usa o fluxo, quando o
 * fluxo pede IA) só aparecia escrita num diálogo da galeria de modelos. Aqui as duas
 * respostas saem de funções PURAS sobre o grafo e o gatilho, com as regras que o motor já usa:
 *  - mensagens e horizonte: `toquesDoModelo` / `horizonteDoModeloMs` (as da galeria);
 *  - quem exige agente: `exigeAgente` / `fluxoPedeAgente` (as do gate do motor);
 *  - conferência de publicar: `validateFlowForPublish`, a mesma que o botão Publicar roda.
 * Sem texto de tela: o componente traduz.
 */
import { exigeAgente, fluxoPedeAgente } from "./agent-followup-gate";
import type { FlowGraph } from "./graph-schema";
import { horizonteDoModeloMs, toquesDoModelo } from "./modelos/tipos";
import { validateFlowForPublish, type PublishValidationError } from "./validate-publish";

export type PoliticaDeHandoff = "pause" | "cancel" | "allow";

export interface GatilhoDoFluxo {
  kind?: string;
  params?: { threshold_minutes?: number; max_silence_minutes?: number } & Record<string, unknown>;
  cancel_on_reply?: boolean;
}

export interface ResumoDoFluxo {
  /** O gatilho, já lido do `trigger_config`. */
  gatilho: { kind: string; minutos: number | null };
  /** Quantas mensagens o cliente recebe no pior caso (ninguém respondeu). */
  mensagens: number;
  /**
   * Por quanto tempo o fluxo acompanha o cliente, em ms; `null` quando não dá para dizer: o
   * grafo tem ciclo (uma repetição), e então o tempo depende de quantas voltas acontecerem.
   */
  horizonteMs: number | null;
  /** O que faz o fluxo parar antes do fim. */
  para: { clienteResponde: boolean; handoff: PoliticaDeHandoff };
}

/** Há ciclo no grafo? Um nó de repetição volta a uma etapa anterior, e o tempo total deixa de ser uma soma. */
export function temCiclo(grafo: FlowGraph): boolean {
  const saidas = new Map<string, string[]>();
  for (const e of grafo.edges) saidas.set(e.source, [...(saidas.get(e.source) ?? []), e.target]);
  const estado = new Map<string, 1 | 2>(); // 1 = em visita, 2 = concluído
  const visita = (id: string): boolean => {
    const s = estado.get(id);
    if (s === 1) return true;
    if (s === 2) return false;
    estado.set(id, 1);
    for (const alvo of saidas.get(id) ?? []) if (visita(alvo)) return true;
    estado.set(id, 2);
    return false;
  };
  return grafo.nodes.some((n) => visita(n.id));
}

export function resumoDoFluxo(
  grafo: FlowGraph,
  gatilho: GatilhoDoFluxo,
  handoff: PoliticaDeHandoff,
): ResumoDoFluxo {
  const kind = gatilho.kind ?? "manual";
  return {
    gatilho: { kind, minutos: gatilho.params?.threshold_minutes ?? null },
    mensagens: toquesDoModelo(grafo),
    horizonteMs: temCiclo(grafo) ? null : horizonteDoModeloMs(grafo),
    para: {
      // O no-show sempre cancela ao responder (a regra está no próprio controle do gatilho).
      clienteResponde: kind === "appointment_no_show" || gatilho.cancel_on_reply === true,
      handoff,
    },
  };
}

/** `ok`: confere. `atencao`: o fluxo não vai funcionar como parece. `info`: só informa. */
export type EstadoDaConferencia = "ok" | "atencao" | "info";

export type IdDaConferencia = "validacao" | "agente" | "publicado";

export interface Conferencia {
  id: IdDaConferencia;
  estado: EstadoDaConferencia;
  /** Detalhes que a tela mostra: as mensagens da validação, ou nada. */
  detalhes: string[];
  /** Só em `validacao`: quantos problemas. */
  quantidade?: number;
  /** Só em `agente`: por que o resultado é este. */
  motivo?: "nao_precisa" | "agente_arma" | "sem_agente";
  /** Só em `publicado`: o status do fluxo. */
  status?: string;
}

export interface EntradaDaProntidao {
  grafo: FlowGraph;
  gatilho: GatilhoDoFluxo;
  status: string;
  /** Quantos agentes PUBLICADOS da organização armam este fluxo (`followup.flow_pointer_ids`). */
  agentesQueArmam: number;
}

/**
 * As conferências de "vai disparar?". Só roda a de agente quando o gatilho é automático E o
 * fluxo pede IA: fluxo de texto fixo dispara sem agente, e avisar nele seria alarme falso.
 */
export function prontidaoDoFluxo(e: EntradaDaProntidao): Conferencia[] {
  const kind = e.gatilho.kind ?? "manual";

  const v = validateFlowForPublish(e.grafo);
  const erros: PublishValidationError[] = v.ok ? [] : v.errors;
  const validacao: Conferencia = {
    id: "validacao",
    estado: erros.length === 0 ? "ok" : "atencao",
    quantidade: erros.length,
    detalhes: erros.map((x) => x.message),
  };

  const itens: Conferencia[] = [validacao];

  if (exigeAgente(kind)) {
    const pede = fluxoPedeAgente(e.grafo);
    itens.push(
      !pede
        ? { id: "agente", estado: "ok", motivo: "nao_precisa", detalhes: [] }
        : e.agentesQueArmam > 0
          ? { id: "agente", estado: "ok", motivo: "agente_arma", detalhes: [] }
          : { id: "agente", estado: "atencao", motivo: "sem_agente", detalhes: [] },
    );
  }

  itens.push({
    id: "publicado",
    estado: e.status === "active" ? "ok" : "info",
    status: e.status,
    detalhes: [],
  });

  return itens;
}

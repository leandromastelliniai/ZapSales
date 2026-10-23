"use client";
import { Selo, type SignificadoDoSelo } from "@/components/ui/selo";
import { estadoDoAgente } from "@/lib/ai/agents/no-ar";
import type { AgentRow } from "@/hooks/ai/useAgent";
import { useT } from "@/hooks/i18n/useT";

export type AgentStatus = "published" | "draft" | "paused" | "archived" | "invalid";

/**
 * "Publicado" tem que significar "está no ar", e quem decide isso é o runtime.
 *
 * A régua mora em `lib/ai/agents/no-ar.ts` e é a MESMA que os workers e as
 * rotas de picker importam. Ela morava aqui, e enquanto morou aqui foi copiada
 * errado três vezes — a cópia do `ai-response-worker` (`.eq("is_active", true)`
 * e nada mais) chegou a responder ao cliente por um agente que esta função
 * rotulava "Rascunho".
 *
 * Duas coisas que este badge já afirmou e que foram MEDIDAS como falsas:
 *
 *   1. "o agente ativo sem versão é invisível para os dois runtimes" — ele é
 *      visível para um terceiro, `workers/ai-response-worker.ts`, que responde
 *      ao cliente por ele. Um `rag_bot` legado ativo e sem versão está NO AR, e
 *      chamá-lo de "Rascunho" era a tela escondendo quem atende. O caso que
 *      motivou aquele texto — o agente do onboarding — não regride: hoje
 *      `createDefaultAgent.ts` grava `kind: "mcp_agent"`, e `mcp_agent` sem
 *      ponteiro continua "Rascunho", porque a config dele vive na versão.
 *   2. "com versão publicada e inativo é Pausado" — nem o agent-engine
 *      (`loadPublishedAgentConfig`) nem o dispatcher leem `is_active`. Com
 *      versão publicada o agente responde, e o rótulo honesto é "Publicado".
 *
 * `paused` voltou a ter emissor: o agente PUBLICADO que alguém pausou ("Pausar
 * automático") não é rascunho — tem versão no ar e volta com um clique. Chamá-lo
 * de "Rascunho" mandava o dono procurar um trabalho por terminar que não existe.
 * Pausado SEM versão publicada continua "Rascunho": não há o que retomar.
 */
export function deriveAgentStatus(agent: AgentRow): AgentStatus {
  // `AgentRow` traz `paused_at` como opcional (o tipo vem da linha do banco),
  // e `FatosDoAgente` o exige justamente para que consulta sem a coluna não
  // compile. Aqui a página SELECIONA a coluna, então normalizar é honesto.
  switch (estadoDoAgente({ ...agent, paused_at: agent.paused_at ?? null })) {
    case "arquivado":
      return "archived";
    case "no_ar":
    case "no_ar_legado":
      return "published";
    case "parado":
      return agent.paused_at != null && agent.published_version_id != null ? "paused" : "draft";
  }
}

const LABEL: Record<AgentStatus, string> = {
  published: "Publicado",
  draft: "Rascunho",
  paused: "Pausado",
  archived: "Arquivado",
  invalid: "Inválido",
};

/** A cor diz o estado, pela regra do `Selo`: verde = no ar, âmbar = esperando alguém. */
const SIGNIFICADO: Record<AgentStatus, SignificadoDoSelo> = {
  published: "concluido",
  draft: "neutro",
  paused: "funil",
  archived: "neutro",
  invalid: "falha",
};

/** O que o estado quer dizer para quem opera, numa frase. */
export const EXPLICACAO_DO_ESTADO: Record<AgentStatus, string> = {
  published: "Está no ar: responde os clientes pelo número escolhido.",
  draft: "Ainda não atende ninguém. Publique para colocá-lo no ar.",
  paused: "Pausado: não responde sozinho até alguém retomar.",
  archived: "Arquivado: não atende mais ninguém.",
  invalid: "A configuração tem um problema que impede o atendimento.",
};

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const t = useT();
  return (
    <Selo
      significado={SIGNIFICADO[status]}
      aria-label={`status: ${t(LABEL[status])}`}
      title={t(EXPLICACAO_DO_ESTADO[status])}
    >
      {status === "published" ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {t(LABEL[status])}
    </Selo>
  );
}

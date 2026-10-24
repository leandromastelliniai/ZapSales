"use client";
/**
 * O editor completo de criação (`AgentForm`), com a ponte do assistente: quando a pessoa
 * chega por "Prefiro o editor completo" (`?de=assistente`) e já tinha respondido alguma
 * coisa, o formulário abre com o agente que o assistente montaria, em vez de vazio.
 *
 * O HTML do servidor é o do editor de sempre (sem prefill): o estado do assistente mora no
 * `sessionStorage`, que só existe no navegador. Depois da montagem, se há o que levar, o
 * formulário é REMONTADO com o estado inicial novo — quem não vem do assistente nunca vê
 * piscar nada, e o assistente continua sem consumir o que guardou (dá para voltar a ele).
 */
import * as React from "react";

import { AgentForm, type InicialDoEditor } from "../../[id]/_components/AgentForm";
import { comporAgente } from "@/lib/ai/agents/assistente/compor";
import {
  idiomaDoAgenteDaTela,
  lerEstado,
  temAlgoRespondido,
} from "@/lib/ai/agents/assistente/estado";
import type { IdDoModelo } from "@/lib/ai/agents/modelos";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";

type PropsDoForm = Omit<
  Extract<React.ComponentProps<typeof AgentForm>, { mode: "create" }>,
  "mode" | "inicial"
>;

interface Props extends PropsDoForm {
  capacidadesPorModelo: Record<IdDoModelo, { tool_ids: string[]; usa_funil: boolean }>;
}

export function EditorComEstadoDoAssistente(props: Props) {
  const idioma = idiomaDoAgenteDaTela(useIdioma());
  const [inicial, setInicial] = React.useState<InicialDoEditor | undefined>(undefined);

  React.useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("de") !== "assistente") return;
      const estado = lerEstado(window.sessionStorage, idioma);
      if (!temAlgoRespondido(estado)) return;
      const agente = comporAgente(estado.respostas);
      const capacidades = props.capacidadesPorModelo[estado.respostas.modeloId];
      // Ler o `sessionStorage` só é possível no cliente, depois da montagem (o HTML do servidor
      // é o editor sem prefill): decidir antes divergiria da hidratação.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInicial({
        name: estado.nome.trim() || agente.name,
        system_prompt: agente.system_prompt,
        profile_persona: agente.profile_persona,
        profile_tone: agente.profile_tone,
        profile_objective: agente.profile_objective,
        profile_welcome: agente.profile_welcome,
        profile_language: agente.profile_language,
        restrict_topics: false,
        allowed_topics: agente.allowed_topics,
        off_topic_reply: agente.off_topic_reply,
        tool_ids: capacidades.tool_ids,
        pipeline_ids: capacidades.usa_funil && props.funilPadraoId ? [props.funilPadraoId] : [],
      });
    } catch {
      // Sem `sessionStorage` o editor abre vazio, como sempre abriu.
    }
    // Só na montagem: o estado inicial de um formulário não se reescreve depois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AgentForm
      key={inicial ? "do-assistente" : "vazio"}
      mode="create"
      {...props}
      inicial={inicial}
    />
  );
}

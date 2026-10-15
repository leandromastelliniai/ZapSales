import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão, contador e frase aqui são os que a tela mostra em cada idioma (`Assumir` / `Asumir` /
 * `Take over`; contadores `crítico`, `em risco`, `em voo` / `crítico`, `en riesgo`, `en seguimiento` /
 * `critical`, `at risk`, `in follow-up`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui ficam as demandas abertas que esfriaram e precisam de você. Se o assistente já agendou um retorno, a demanda aparece como em voo; sem próximo passo, é risco de perder o cliente.",
    passos: [
      "No alto, caixas de aviso aparecem quando existem demandas abertas sem próximo passo, propostas vencidas sem retomada ou propostas esperando revisão. Cada uma explica o que fazer.",
      "Os três contadores (crítico, em risco e em voo) mostram quantas demandas há em cada situação. A lista vem ordenada com as mais graves primeiro.",
      "Em cada linha você vê o título, o contato, há quanto tempo está parada, quem cuida dela e o próximo passo: Assistente retorna em um prazo, ou Sem próximo passo agendado.",
      "Clique na linha para abrir a conversa na Inbox. Se não houver conversa, abre o funil da demanda.",
      "Use Assumir quando a demanda ainda não tem atendente. O botão só aparece se há conversa e nenhuma pessoa cuida dela.",
    ],
    termos: [
      { termo: "Crítico / Em risco / Em voo", significa: "Crítico: parada há muito tempo e sem retorno combinado. Em risco: esfriou e está sem retorno. Em voo: esfriou, mas o assistente já agendou um retorno." },
      { termo: "Demanda", significa: "Um atendimento ou negócio aberto de um cliente que ainda não foi concluído." },
      { termo: "Sem dono", significa: "Nenhuma pessoa nem agente de IA é responsável pela demanda." },
      { termo: "Assumir", significa: "Tira a demanda da IA e traz para você, para que você mesmo continue a conversa." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí están las demandas abiertas que se enfriaron y te necesitan. Si el asistente ya programó un seguimiento, aparece como en seguimiento; sin siguiente paso, hay riesgo de perder al cliente.",
    passos: [
      "Arriba aparecen cuadros de aviso cuando hay casos abiertos sin siguiente paso, propuestas vencidas sin retomar o propuestas esperando revisión. Cada uno explica qué hacer.",
      "Los tres contadores (crítico, en riesgo y en seguimiento) muestran cuántos casos hay en cada situación. La lista viene ordenada con los más graves primero.",
      "En cada fila ves el título, el contacto, hace cuánto está detenida, quién se ocupa de ella y el siguiente paso: El asistente dará seguimiento en un plazo, o Sin próximo paso programado.",
      "Haz clic en la fila para abrir la conversación en la Inbox. Si no hay conversación, abre el embudo del caso.",
      "Usa Asumir cuando el caso aún no tiene asesor. El botón solo aparece si hay conversación y ninguna persona se ocupa de ella.",
    ],
    termos: [
      { termo: "Crítico / En riesgo / En seguimiento", significa: "Crítico: detenido hace mucho tiempo y sin seguimiento acordado. En riesgo: se enfrió y no tiene seguimiento. En seguimiento: se enfrió, pero el asistente ya programó un seguimiento." },
      { termo: "Caso", significa: "Una atención o negocio abierto de un cliente que todavía no se concluyó." },
      { termo: "Sin responsable", significa: "Ninguna persona ni agente de IA es responsable del caso." },
      { termo: "Asumir", significa: "Saca el caso de la IA y lo trae a ti, para que continúes tú mismo la conversación." },
    ],
  },
  en: {
    oQueMostra:
      "This is where open cases that went cold and need you live. If the assistant has already scheduled a follow-up, the case shows as in follow-up; with no next step, there is a risk of losing the customer.",
    passos: [
      "At the top, notice boxes appear when there are open cases with no next step, expired proposals not followed up, or proposals awaiting review. Each one explains what to do.",
      "The three counters (critical, at risk and in follow-up) show how many cases are in each situation. The list is sorted with the most severe first.",
      "On each row you see the title, the contact, how long it has been stalled, who is handling it and the next step: Assistant follows up in a given time, or No next step scheduled.",
      "Click the row to open the conversation in the Inbox. If there is no conversation, it opens the case's pipeline.",
      "Use Take over when the case has no agent yet. The button only appears if there is a conversation and no person is handling it.",
    ],
    termos: [
      { termo: "Critical / At risk / In follow-up", significa: "Critical: stalled for a long time with no follow-up arranged. At risk: went cold with no follow-up. In follow-up: went cold, but the assistant has already scheduled a follow-up." },
      { termo: "Case", significa: "An open conversation or deal of a customer that has not been concluded yet." },
      { termo: "No owner", significa: "No person or AI agent is responsible for the case." },
      { termo: "Take over", significa: "Takes the case away from the AI and brings it to you, so you continue the conversation yourself." },
    ],
  },
};

export default ajuda;

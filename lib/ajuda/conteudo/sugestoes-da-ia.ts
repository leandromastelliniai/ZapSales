import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de aba, botão e selo aqui são os que a tela mostra em cada idioma (`Aguardando decisão` /
 * `Esperando decisión` / `Awaiting decision`, `Aprovar` / `Aprobar` / `Approve`, `Ignorar` / `Ignorar` /
 * `Ignore`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui ficam os próximos passos que o assistente sugeriu para os seus negócios e que esperam a sua decisão. Aprovar e Ignorar ficam registrados, os dois: ignorar também é uma decisão.",
    passos: [
      "Em Aguardando decisão, cada linha mostra o negócio, o contato, a etapa e há quanto tempo a sugestão foi feita. O texto abaixo é o passo que o assistente propõe.",
      "Leia o passo e use Aprovar se concorda ou Ignorar se não. A sugestão sai da lista assim que você decide.",
      "Se o assistente reescrever a sugestão enquanto a tela está aberta, a lista é recarregada e você decide sobre o texto novo.",
      "Em Já decididas você confere o que foi Aprovada ou Ignorada, por quem e quando.",
      "Se os botões Aprovar e Ignorar aparecerem apagados, o seu acesso é Somente leitura: você vê as sugestões, mas não decide.",
    ],
    termos: [
      { termo: "Sugestão (proposta)", significa: "Um próximo passo para um negócio, como retomar contato, escrito pelo assistente. Nada é decidido até uma pessoa aprovar ou ignorar." },
      { termo: "Etapa", significa: "O degrau do funil em que o negócio está agora, mostrado ao lado do nome do contato." },
      { termo: "Aprovada / Ignorada", significa: "As duas respostas possíveis. Ignorada não é esquecida: fica registrada como uma decisão sua." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí están los próximos pasos que el asistente sugirió para tus negocios y que esperan tu decisión. Aprobar e Ignorar quedan registrados, ambos: ignorar también es una decisión.",
    passos: [
      "En Esperando decisión, cada fila muestra el negocio, el contacto, la etapa y hace cuánto se hizo la sugerencia. El texto de abajo es el paso que propone el asistente.",
      "Lee el paso y usa Aprobar si estás de acuerdo o Ignorar si no. La sugerencia sale de la lista en cuanto decides.",
      "Si el asistente reescribe la sugerencia mientras la pantalla está abierta, la lista se recarga y decides sobre el texto nuevo.",
      "En Ya decididas ves lo que fue Aprobada o Ignorada, por quién y cuándo.",
      "Si los botones Aprobar e Ignorar aparecen apagados, tu acceso es Solo lectura: ves las sugerencias, pero no decides.",
    ],
    termos: [
      { termo: "Sugerencia (propuesta)", significa: "Un próximo paso para un negocio, como retomar el contacto, escrito por el asistente. No se decide nada hasta que una persona apruebe o ignore." },
      { termo: "Etapa", significa: "El peldaño del embudo en que está el negocio ahora, mostrado junto al nombre del contacto." },
      { termo: "Aprobada / Ignorada", significa: "Las dos respuestas posibles. Ignorada no se olvida: queda registrada como una decisión tuya." },
    ],
  },
  en: {
    oQueMostra:
      "This is where the next steps the assistant suggested for your deals wait for your decision. Approve and Ignore are both recorded: ignoring is a decision too.",
    passos: [
      "Under Awaiting decision, each row shows the deal, the contact, the stage and how long ago the suggestion was made. The text below is the step the assistant proposes.",
      "Read the step and use Approve if you agree or Ignore if you do not. The suggestion leaves the list as soon as you decide.",
      "If the assistant rewrites the suggestion while the screen is open, the list reloads and you decide on the new text.",
      "Under Already decided you check what was Approved or Ignored, by whom and when.",
      "If the Approve and Ignore buttons look grayed out, your access is Read only: you see the suggestions but cannot decide.",
    ],
    termos: [
      { termo: "Suggestion (proposal)", significa: "A next step for a deal, such as getting back in touch, written by the assistant. Nothing is decided until a person approves or ignores it." },
      { termo: "Stage", significa: "The step of the pipeline the deal is in right now, shown next to the contact's name." },
      { termo: "Approved / Ignored", significa: "The two possible answers. Ignored is not forgotten: it is recorded as a decision of yours." },
    ],
  },
};

export default ajuda;

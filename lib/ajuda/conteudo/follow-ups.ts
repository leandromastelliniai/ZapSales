import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de coluna aqui são os que a tela mostra em cada idioma (`Começar de um modelo` /
 * `Empezar desde un modelo` / `Start from a template`, `Próximo disparo` / `Next send`). A segunda aba se chama
 * `Fila` em português; nos outros idiomas ela é descrita sem o nome. Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Follow-ups são mensagens automáticas para retomar a conversa com quem sumiu, sem ninguém precisar lembrar de mandar. Aqui você vê os fluxos que existem e a fila de quem está sendo acompanhado agora.",
    passos: [
      "Para começar mais fácil, use Começar de um modelo: são fluxos com os textos já escritos. Instalar não manda mensagem para ninguém, o fluxo nasce como rascunho.",
      "Novo fluxo cria um fluxo do zero, também como rascunho. Os dois botões só aparecem para gestores e administradores.",
      "Clique num cartão para abrir o editor, revisar os textos e usar Publicar. No topo do editor, a faixa O que este fluxo faz resume quando ele começa, o que envia, por quanto tempo acompanha e quando para, e Vai disparar? confere se ele vai funcionar (por exemplo, se um agente publicado o usa).",
      "Depois de publicar, ligue o fluxo no seu agente (Agentes › Follow-up). Sem um agente publicado ligando o fluxo, o disparo automático não acontece.",
      "Na aba Fila, cada linha mostra o contato, o fluxo, o Próximo disparo e o status. Gestores e administradores podem Cancelar um item.",
    ],
    termos: [
      { termo: "Gatilho", significa: "O que faz o fluxo começar: silêncio do cliente, mudança de etapa do funil, uma regra em Webhooks ou a resposta do contato." },
      { termo: "Handoff", significa: "Quando uma pessoa assume a conversa. Cada fluxo tem uma política: pausar, cancelar ou permitir que o follow-up continue nesse período." },
      { termo: "Promessa", significa: "Um retorno que a IA agendou com a pessoa para um horário combinado. Aparece na fila junto com os follow-ups." },
      { termo: "Rascunho", significa: "Fluxo criado, mas ainda não publicado." },
    ],
  },
  es: {
    oQueMostra:
      "Los seguimientos (follow-ups) son mensajes automáticos para retomar la conversación con quien desapareció, sin que nadie tenga que acordarse de escribir. Aquí ves los flujos que existen y la cola de quienes están siendo acompañados ahora.",
    passos: [
      "Para empezar más fácil, usa Empezar desde un modelo: son flujos con los textos ya escritos. Instalar no envía mensajes a nadie, el flujo nace como borrador.",
      "Nuevo flujo crea un flujo desde cero, también como borrador. Los dos botones solo aparecen para gestores y administradores.",
      "Haz clic en una tarjeta para abrir el editor, revisar los textos y usar Publicar. Arriba del editor, la franja Qué hace este flujo resume cuándo empieza, qué envía, por cuánto tiempo acompaña y cuándo se detiene, y ¿Se va a disparar? verifica si va a funcionar (por ejemplo, si un agente publicado lo usa).",
      "Después de publicar, conecta el flujo a tu agente (Agentes › Follow-up). Sin un agente publicado que arme el flujo, el envío automático no ocurre.",
      "En la segunda pestaña (la cola), cada fila muestra el contacto, el flujo, el Próximo disparo y el estado. Gestores y administradores pueden Cancelar un elemento.",
    ],
    termos: [
      { termo: "Disparador", significa: "Lo que hace que el flujo empiece: silencio del cliente, cambio de etapa del embudo, una regla en Webhooks o la respuesta del contacto." },
      { termo: "Handoff (transferencia)", significa: "Cuando una persona toma la conversación. Cada flujo tiene una política: pausar, cancelar o permitir que el seguimiento continúe en ese período." },
      { termo: "Promesa", significa: "Un retorno que la IA agendó con la persona para una hora acordada. Aparece en la cola junto con los seguimientos." },
      { termo: "Borrador", significa: "Flujo creado, pero todavía no publicado." },
    ],
  },
  en: {
    oQueMostra:
      "Follow-ups are automatic messages that pick the conversation back up with someone who went quiet, so nobody has to remember to write. Here you see the flows that exist and the queue of who is being followed up right now.",
    passos: [
      "To start easier, use Start from a template: these are flows with the texts already written. Installing does not send a message to anyone, the flow starts as a draft.",
      "New flow creates a flow from scratch, also as a draft. Both buttons only appear for managers and administrators.",
      "Click a card to open the editor, review the texts and use Publish. At the top of the editor, the What this flow does strip sums up when it starts, what it sends, how long it follows up and when it stops, and Will it fire? checks that it will work (for example, whether a published agent uses it).",
      "After publishing, turn the flow on in your agent (Agents › Follow-up). Without a published agent arming the flow, the automatic send does not happen.",
      "On the second tab (the queue), each row shows the contact, the flow, the Next send and the status. Managers and administrators can Cancel an item.",
    ],
    termos: [
      { termo: "Trigger", significa: "What makes the flow start: customer silence, a pipeline stage change, a rule in Webhooks or the contact's reply." },
      { termo: "Handoff", significa: "When a person takes over the conversation. Each flow has a policy: pause, cancel or allow the follow-up to continue during that time." },
      { termo: "Promise", significa: "A return that the AI scheduled with the person for an agreed time. It shows in the queue next to the follow-ups." },
      { termo: "Draft", significa: "A flow that was created but is not published yet." },
    ],
  },
};

export default ajuda;

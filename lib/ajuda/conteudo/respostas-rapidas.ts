import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão aqui são os que a tela mostra em cada idioma (`Novo template` / `Nueva plantilla` /
 * `New template`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Respostas rápidas são textos prontos que quem atende usa na conversa, sem digitar tudo de novo: o horário de funcionamento, o endereço, a forma de pagamento.",
    passos: [
      "Use Novo template para escrever uma resposta e dar a ela um nome fácil de achar.",
      "Escolha se ela é só sua ou se vale Compartilhar com a equipe.",
      "Na Inbox, comece a mensagem com / e escolha a resposta pelo nome: o texto entra no campo para você ajustar antes de enviar.",
    ],
    termos: [
      { termo: "{{nome}} e {{primeiro_nome}}", significa: "Entram no texto como o nome do cliente da conversa. Sem nome conhecido, o texto fica como está, para você corrigir antes de enviar." },
      { termo: "Compartilhar com a equipe", significa: "Toda a equipe vê e usa a resposta. Só gestores podem compartilhar." },
    ],
  },
  es: {
    oQueMostra:
      "Las respuestas rápidas son textos listos que quien atiende usa en la conversación, sin volver a escribir todo: el horario de atención, la dirección, la forma de pago.",
    passos: [
      "Usa Nueva plantilla para escribir una respuesta y darle un nombre fácil de encontrar.",
      "Elige si es solo tuya o si conviene Compartir con el equipo.",
      "En la Inbox, empieza el mensaje con / y elige la respuesta por su nombre: el texto entra en el campo para que lo ajustes antes de enviar.",
    ],
    termos: [
      { termo: "{{nome}} y {{primeiro_nome}}", significa: "Entran en el texto como el nombre del cliente de la conversación. Si no se conoce el nombre, el texto queda como está, para que lo corrijas antes de enviar." },
      { termo: "Compartir con el equipo", significa: "Todo el equipo ve y usa la respuesta. Solo los gestores pueden compartir." },
    ],
  },
  en: {
    oQueMostra:
      "Quick replies are ready-made texts that whoever is answering uses in a conversation, without typing everything again: opening hours, the address, payment options.",
    passos: [
      "Use New template to write a reply and give it a name that is easy to find.",
      "Choose whether it is just yours or whether to Share with the team.",
      "In the Inbox, start the message with / and pick the reply by name: the text drops into the box so you can adjust it before sending.",
    ],
    termos: [
      { termo: "{{nome}} and {{primeiro_nome}}", significa: "They become the name of the customer in the conversation. If the name is unknown, the text stays as written so you can fix it before sending." },
      { termo: "Share with the team", significa: "The whole team sees and uses the reply. Only managers can share." },
    ],
  },
};

export default ajuda;

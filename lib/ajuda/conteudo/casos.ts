import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de aba, botão e selo aqui são os que a tela mostra em cada idioma (`Abertos` / `Abiertos` /
 * `Open`, `Concluí` / `Concluí` / `Complete`, `Preciso de info do cliente` / `Necesito info del cliente` /
 * `I need info from the customer`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui ficam os casos que o assistente abriu quando travou em algo que só uma pessoa resolve. Ele continua conversando com o cliente enquanto espera a sua resposta. A tela é para quem é Atendente ou tem papel acima.",
    passos: [
      "À esquerda, escolha um caso. Em Abertos estão os que esperam alguém; em Concluídos ficam os encerrados, cancelados ou repassados.",
      "À direita, leia O que o cliente precisa e Por que a IA travou.",
      "Em dúvida, escreva em Conversar sobre o caso e use Perguntar. As perguntas prontas só preenchem o campo, não enviam sozinhas. Cada pergunta é uma chamada de IA, paga na sua conta do provedor.",
      "Em O que você quer fazer?, marque uma opção: Concluí, Preciso de info do cliente ou Não consigo — passar pra humano. Nenhuma vem marcada. Escreva sua resposta e use Enviar. Isso só funciona com o caso em Aguardando você.",
      "No fim da tela, a Linha do tempo conta o que aconteceu no caso, em ordem.",
    ],
    termos: [
      { termo: "Caso", significa: "Um pedido pontual em que a IA parou e precisa de uma pessoa. A conversa com o cliente segue; só aquele ponto espera por você." },
      { termo: "Aguardando você / Aguardando o cliente", significa: "No primeiro, a bola está com a sua equipe. No segundo, a IA já perguntou algo ao cliente e o caso volta para você quando ele responder." },
      { termo: "Virou atendimento humano", significa: "Você escolheu passar o caso para uma pessoa. Ele sai das mãos da IA e a conversa passa a ser atendida por gente." },
      { termo: "Aberto automaticamente", significa: "A IA disse ao cliente que chamaria uma pessoa mas não abriu o caso. Então o próprio sistema abriu por ela." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí están los casos que el asistente abrió cuando se trabó en algo que solo una persona resuelve. Sigue conversando con el cliente mientras espera tu respuesta. La pantalla es para quien es Asesor o tiene un rol superior.",
    passos: [
      "A la izquierda, elige un caso. En Abiertos están los que esperan a alguien; en Concluidos quedan los cerrados, cancelados o derivados.",
      "A la derecha, lee Qué necesita el cliente y Por qué se atoró la IA.",
      "Si tienes dudas, escribe en Conversar sobre el caso y usa Preguntar. Las preguntas listas solo llenan el campo, no se envían solas. Cada pregunta es una llamada de IA, que se paga en tu cuenta del proveedor.",
      "En ¿Qué quieres hacer?, marca una opción: Concluí, Necesito info del cliente o No puedo: pasar a una persona. Ninguna viene marcada. Escribe tu respuesta y usa Enviar. Esto solo funciona con el caso en Esperando tu respuesta.",
      "Al final de la pantalla, la Línea de tiempo cuenta lo que pasó en el caso, en orden.",
    ],
    termos: [
      { termo: "Caso", significa: "Un pedido puntual en que la IA se detuvo y necesita a una persona. La conversación con el cliente sigue; solo ese punto te espera a ti." },
      { termo: "Esperando tu respuesta / Esperando al cliente", significa: "En el primero, la pelota está con tu equipo. En el segundo, la IA ya le preguntó algo al cliente y el caso vuelve a ti cuando responda." },
      { termo: "Pasó a atención humana", significa: "Elegiste pasar el caso a una persona. Sale de las manos de la IA y la conversación pasa a ser atendida por gente." },
      { termo: "Abierto automáticamente", significa: "La IA le dijo al cliente que llamaría a una persona pero no abrió el caso. Entonces el propio sistema lo abrió por ella." },
    ],
  },
  en: {
    oQueMostra:
      "This is where the cases the assistant opened live, when it got stuck on something only a person can solve. It keeps talking to the customer while it waits for your answer. The screen is for people with the Agent role or higher.",
    passos: [
      "On the left, pick a case. Open holds the ones waiting on someone; Completed holds the ones that were closed, canceled or handed off.",
      "On the right, read What the customer needs and Why the AI got stuck.",
      "If you are unsure, write in Discuss the case and use Ask. The ready-made questions only fill in the field; they do not send by themselves. Each question is an AI call, paid on your own provider account.",
      "Under What do you want to do?, mark one option: Complete, I need info from the customer or I can't — hand off to a human. None comes marked. Write your answer and use Send. This only works while the case is Waiting for you.",
      "At the bottom, the Timeline tells what happened in the case, in order.",
    ],
    termos: [
      { termo: "Case", significa: "A specific request where the AI stopped and needs a person. The conversation with the customer goes on; only that point waits for you." },
      { termo: "Waiting for you / Waiting for the client", significa: "In the first, the ball is with your team. In the second, the AI has already asked the customer something and the case comes back to you once they answer." },
      { termo: "Switched to human support", significa: "You chose to hand the case to a person. It leaves the AI's hands and the conversation is served by people." },
      { termo: "Opened automatically", significa: "The AI told the customer it would call a person but did not open the case. So the system opened it for it." },
    ],
  },
};

export default ajuda;

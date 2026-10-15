import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de campo aqui são os que a tela mostra em cada idioma (`Novo roteador` / `Nuevo enrutador` /
 * `New router`, `Número de WhatsApp` / `Número de WhatsApp` / `WhatsApp number`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Um roteador entende o que o cliente quer e entrega a conversa para o agente certo. Cada roteador é ligado a um número de WhatsApp.",
    passos: [
      "Novo roteador (só para administradores): dê um nome e escolha o Número de WhatsApp que ele vai atender. Só pode haver um roteador ativo por número.",
      "Na tela do roteador, crie as intenções com o botão Intenção. Para cada uma, dê um Nome da intenção, escolha o Agente que atende e explique Quando escolher esta intenção. Frases de exemplo são opcionais.",
      "Em Se nenhuma intenção casar, escolha o Agente de fallback. Se escolher Nenhum, a conversa recebe o atendimento padrão.",
      "Ligue o interruptor para o roteador ficar Ativo e clique em Salvar.",
      "Use Testar classificação para escrever uma mensagem de cliente e ver qual intenção e qual agente seriam escolhidos. O teste só funciona com o roteador ativo.",
    ],
    termos: [
      { termo: "Intenção", significa: "O que o cliente quer naquela conversa, como 'quer comprar'. Cada intenção leva a um agente." },
      { termo: "Agente de fallback", significa: "O agente que atende quando nenhuma intenção combina com a mensagem do cliente." },
      { termo: "Modelo do classificador", significa: "O modelo de IA que lê a mensagem do cliente e decide qual intenção ela é." },
    ],
  },
  es: {
    oQueMostra:
      "Un enrutador entiende lo que quiere el cliente y entrega la conversación al agente correcto. Cada enrutador está conectado a un número de WhatsApp.",
    passos: [
      "Nuevo enrutador (solo para administradores): ponle un nombre y elige el Número de WhatsApp que va a atender. Solo puede haber un enrutador activo por número.",
      "En la pantalla del enrutador, crea las intenciones con el botón Intención. Para cada una, escribe un Nombre de la intención, elige el Agente que atiende y explica Cuándo elegir esta intención. Las frases de ejemplo son opcionales.",
      "En Si ninguna intención coincide, elige el Agente de fallback. Si eliges Ninguno, la conversación recibe la atención estándar.",
      "Activa el interruptor para que el enrutador quede Activo y haz clic en Guardar.",
      "Usa Probar clasificación para escribir un mensaje de cliente y ver qué intención y qué agente se elegirían. La prueba solo funciona con el enrutador activo.",
    ],
    termos: [
      { termo: "Intención", significa: "Lo que quiere el cliente en esa conversación, como 'quiere comprar'. Cada intención lleva a un agente." },
      { termo: "Agente de fallback", significa: "El agente que atiende cuando ninguna intención coincide con el mensaje del cliente." },
      { termo: "Modelo del clasificador", significa: "El modelo de IA que lee el mensaje del cliente y decide a qué intención corresponde." },
    ],
  },
  en: {
    oQueMostra:
      "A router understands what the customer wants and hands the conversation to the right agent. Each router is tied to one WhatsApp number.",
    passos: [
      "New router (administrators only): give it a name and choose the WhatsApp number it will serve. There can be only one active router per number.",
      "On the router's screen, create the intents with the Intent button. For each one, enter an Intent name, choose the Agent that handles it and explain When to choose this intent. Example phrases are optional.",
      "Under If no intent matches, choose the Fallback agent. If you choose None, the conversation gets the default support.",
      "Turn on the switch so the router is Active, then click Save.",
      "Use Test classification to type a customer message and see which intent and which agent would be chosen. The test only works with the router active.",
    ],
    termos: [
      { termo: "Intent", significa: "What the customer wants in that conversation, such as 'wants to buy'. Each intent leads to an agent." },
      { termo: "Fallback agent", significa: "The agent that answers when no intent matches the customer's message." },
      { termo: "Classifier model", significa: "The AI model that reads the customer's message and decides which intent it is." },
    ],
  },
};

export default ajuda;

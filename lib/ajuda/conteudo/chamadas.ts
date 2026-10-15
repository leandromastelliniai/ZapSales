import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de coluna aqui são os que a tela mostra em cada idioma (`Nova ligação` /
 * `Nueva llamada` / `New call`, `Ligar com IA` / `Llamar con IA` / `Call with AI`). Os valores da
 * coluna Direção (`Saída` / `Entrada`) NÃO são citados no inglês: na tabela de tradução a mesma chave
 * serve ao financeiro e sai como `Expense` / `Income` numa tela de ligações. Mudou o rótulo, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui fica o histórico das ligações de voz feitas e recebidas pela IA, cada uma com a transcrição do que foi dito. Esta tela é para gestores e administradores.",
    passos: [
      "Para ligar, use Nova ligação, digite o Número com + e o código do país e use Ligar com IA. A IA liga e conduz a chamada; falar você mesmo ainda não está disponível.",
      "A lista mostra Data, Direção, Quem é, Status, Atendido por e Duração (em minutos e segundos). A mais recente vem primeiro.",
      "Clique numa linha para abrir a chamada e ler a transcrição, com a fala da IA de um lado e a do cliente do outro.",
      "Se a chamada não tiver texto, a tela avisa que não há transcrição para ela.",
      "A ligação sai pela linha telefônica da empresa, que o administrador cadastra em Linha telefônica (SIP), nas configurações.",
    ],
    termos: [
      { termo: "Direção", significa: "Se a ligação foi feita por vocês (Saída) ou recebida (Entrada)." },
      { termo: "Quem é", significa: "O cliente do outro lado da linha, pelo nome do contato ou, se não houver, pelo número." },
      { termo: "Atendido por", significa: "Quem conduziu a chamada: a IA ou um Humano." },
      { termo: "Linha telefônica (SIP)", significa: "Os dados da operadora de telefonia da empresa, usados para a IA fazer e receber chamadas." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí está el historial de las llamadas de voz hechas y recibidas por la IA, cada una con la transcripción de lo que se dijo. Esta pantalla es para gestores y administradores.",
    passos: [
      "Para llamar, usa Nueva llamada, escribe el Número con + y el código del país y usa Llamar con IA. La IA llama y conduce la llamada; hablar tú mismo todavía no está disponible.",
      "La lista muestra Fecha, Dirección, Quién es, Estado, Atendido por y Duración (en minutos y segundos). La más reciente va primero.",
      "Haz clic en una fila para abrir la llamada y leer la transcripción, con lo que dice la IA de un lado y lo que dice el cliente del otro.",
      "Si la llamada no tiene texto, la pantalla avisa que no hay transcripción para ella.",
      "La llamada sale por la línea telefónica de la empresa, que el administrador registra en Línea telefónica (SIP), en la configuración.",
    ],
    termos: [
      { termo: "Dirección", significa: "Si la llamada la hicieron ustedes (Salida) o la recibieron (Entrada)." },
      { termo: "Quién es", significa: "El cliente del otro lado de la línea, por el nombre del contacto o, si no hay, por el número." },
      { termo: "Atendido por", significa: "Quién condujo la llamada: la IA o un Humano." },
      { termo: "Línea telefónica (SIP)", significa: "Los datos del operador de telefonía de la empresa, que usa la IA para hacer y recibir llamadas." },
    ],
  },
  en: {
    oQueMostra:
      "This is the history of the voice calls made and received by the AI, each with a transcript of what was said. This screen is for managers and administrators.",
    passos: [
      "To place a call, use New call, type the Number with + and the country code, and use Call with AI. The AI places the call and runs it; speaking yourself is not available yet.",
      "The list shows Date, Direction, Who it is, Status, Answered by and Duration (in minutes and seconds). The most recent comes first.",
      "Click a row to open the call and read the transcript, with what the AI said on one side and what the customer said on the other.",
      "If a call has no text, the screen says there is no transcript for it.",
      "The call goes out through the company's phone line, which the administrator sets up under Phone line (SIP), in the settings.",
    ],
    termos: [
      { termo: "Direction", significa: "Whether the call was one you made or one you received." },
      { termo: "Who it is", significa: "The customer on the other end of the line, shown by the contact's name or, if there is none, by the number." },
      { termo: "Answered by", significa: "Who ran the call: the AI or a Human." },
      { termo: "Phone line (SIP)", significa: "The company's phone carrier details, used by the AI to place and receive calls." },
    ],
  },
};

export default ajuda;

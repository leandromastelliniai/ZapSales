import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de bloco e de quadro aqui são os que a tela mostra em cada idioma (`O que seu agente aprendeu` /
 * `Lo que tu agente aprendió` / `What your agent learned`, `Período analisado` / `Período analizado` /
 * `Period analyzed`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui você vê o que o seu agente aprendeu no período, o que ele fez com isso, o que mudou no seu resultado e o que ainda está travando. A tela é para Gerente ou acima.",
    passos: [
      "Em Período analisado, escolha as datas De e Até. Todos os números da página são só desse intervalo.",
      "Em O que seu agente aprendeu, veja as regras, as melhorias e as habilidades novas, e a linha do tempo de cada uma.",
      "Em O que ele fez, veja quantas vezes o agente usou cada recurso, em gráficos por dia.",
      "Em O que mudou no resultado, veja os negócios que o agente fechou ou perdeu e o custo da IA. Para saber se melhorou, mude as datas e compare com o mês anterior.",
      "Em O que está travando, leia o que limita o agente e o que fazer. Os botões levam à tela onde cada coisa se resolve.",
    ],
    termos: [
      { termo: "Habilidades instaladas", significa: "Conhecimentos especializados que o agente passa a usar quando a conversa pede, como fechar um agendamento." },
      { termo: "Conversas encaminhadas", significa: "Quantas vezes o sistema leu o que o cliente queria e escolheu qual atendimento devia responder." },
      { termo: "Mudanças de passo no atendimento", significa: "Quantas vezes o agente registrou que um cliente mudou de passo. Inclui fechado e perdido. Cartão movido à mão no quadro não entra." },
      { termo: "Casos que precisaram de uma pessoa", significa: "Conversas que o agente passou para um atendente humano, a cada 100 mensagens recebidas. Leia como estimativa." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí ves lo que tu agente aprendió en el período, lo que hizo con eso, lo que cambió en tu resultado y lo que todavía lo está frenando. La pantalla es para Gerente o superior.",
    passos: [
      "En Período analizado, elige las fechas De y Hasta. Todos los números de la página son solo de ese intervalo.",
      "En Lo que tu agente aprendió, ve las reglas, las mejoras y las habilidades nuevas, y la línea de tiempo de cada una.",
      "En Lo que hizo, ve cuántas veces el agente usó cada recurso, en gráficos por día.",
      "En Lo que cambió en el resultado, ve los negocios que el agente cerró o perdió y el costo de la IA. Para saber si mejoró, cambia las fechas y compara con el mes anterior.",
      "En Lo que está frenando, lee lo que limita al agente y qué hacer. Los botones llevan a la pantalla donde se resuelve cada cosa.",
    ],
    termos: [
      { termo: "Habilidades instaladas", significa: "Conocimientos especializados que el agente pasa a usar cuando la conversación lo pide, como cerrar una cita." },
      { termo: "Conversaciones derivadas", significa: "Cuántas veces el sistema leyó lo que el cliente quería y eligió qué atención debía responder." },
      { termo: "Cambios de paso en la atención", significa: "Cuántas veces el agente registró que un cliente cambió de paso. Incluye cerrado y perdido. Una tarjeta movida a mano en el tablero no entra." },
      { termo: "Casos que necesitaron a una persona", significa: "Conversaciones que el agente pasó a un asesor humano, por cada 100 mensajes recibidos. Léelo como una estimación." },
    ],
  },
  en: {
    oQueMostra:
      "Here you see what your agent learned in the period, what it did with that, what changed in your results and what is still holding it back. The screen is for Manager or higher.",
    passos: [
      "Under Period analyzed, choose the dates Of and Until. Every number on the page covers only that interval.",
      "Under What your agent learned, see the new rules, improvements and skills, and the timeline of each.",
      "Under What it did, see how many times the agent used each resource, in charts by day.",
      "Under What changed in the outcome, see the deals the agent closed or lost and the AI cost. To know whether it improved, change the dates and compare with the previous month.",
      "Under What's holding it back, read what limits the agent and what to do. The buttons lead to the screen where each thing gets fixed.",
    ],
    termos: [
      { termo: "Installed skills", significa: "Specialized know-how the agent starts using when the conversation calls for it, such as closing an appointment." },
      { termo: "Routed conversations", significa: "How many times the system read what the customer wanted and chose which service should answer." },
      { termo: "Support step changes", significa: "How many times the agent recorded that a customer moved to another step. It includes closed and lost. A card moved by hand on the board does not count." },
      { termo: "Cases that needed a person", significa: "Conversations the agent passed to a human agent, per 100 messages received. Read it as an estimate." },
    ],
  },
};

export default ajuda;

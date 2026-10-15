import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de quadro e de seletor aqui são os que a tela mostra em cada idioma (`Quem fez` / `Quién lo hizo` /
 * `Who did it`, `O que foi feito` / `Qué se hizo` / `What was done`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui você vê tudo o que aconteceu na operação no período, e quanto disso foi feito pela equipe, pelos agentes de IA ou por regras automáticas.",
    passos: [
      "No seletor Período, escolha Últimos 7, 30 ou 90 dias. O total de acontecimentos aparece ao lado.",
      "Os três quadros do topo dividem o trabalho em A equipe, Os agentes e Automático, cada um com a sua parte do total.",
      "Quando traz uma barra por dia, para você ver os dias de mais movimento. Quem fez e O que foi feito mostram quem agiu mais e quais tipos de ação foram mais comuns.",
      "Em Linha do tempo da operação, cada linha diz o que foi feito, por quem e quando. Quando há um negócio ligado, o nome dele é um link para abrir o negócio.",
      "Se o período estiver movimentado, a lista mostra só os acontecimentos mais recentes, e a tela avisa quando isso acontece.",
    ],
    termos: [
      { termo: "A equipe", significa: "Ações feitas por uma pessoa do seu time." },
      { termo: "Os agentes", significa: "Ações feitas por um agente de IA." },
      { termo: "Automático", significa: "Ações que nem a equipe nem um agente fez: regras do sistema, o próprio produto ou a pessoa atendida." },
      { termo: "Acontecimento", significa: "Cada registro de algo que foi feito na operação, como mudar um negócio de etapa ou registrar uma anotação." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí ves todo lo que pasó en la operación en el período, y cuánto de eso lo hizo el equipo, los agentes de IA o reglas automáticas.",
    passos: [
      "En el selector Período, elige Últimos 7, 30 o 90 días. El total de eventos aparece al lado.",
      "Los tres cuadros de arriba dividen el trabajo en El equipo, Los agentes y Automático, cada uno con su parte del total.",
      "Cuándo trae una barra por día, para que veas los días de más movimiento. Quién lo hizo y Qué se hizo muestran quién actuó más y qué tipos de acción fueron más comunes.",
      "En Línea de tiempo de la operación, cada fila dice qué se hizo, quién y cuándo. Cuando hay un negocio vinculado, su nombre es un enlace para abrirlo.",
      "Si el período tiene mucho movimiento, la lista muestra solo los eventos más recientes, y la pantalla avisa cuando eso pasa.",
    ],
    termos: [
      { termo: "El equipo", significa: "Acciones hechas por una persona de tu equipo." },
      { termo: "Los agentes", significa: "Acciones hechas por un agente de IA." },
      { termo: "Automático", significa: "Acciones que no hizo ni el equipo ni un agente: reglas del sistema, el propio producto o la persona atendida." },
      { termo: "Evento", significa: "Cada registro de algo que se hizo en la operación, como cambiar un negocio de etapa o registrar una nota." },
    ],
  },
  en: {
    oQueMostra:
      "Here you see everything that happened in the operation during the period, and how much of it was done by the team, by AI agents or by automatic rules.",
    passos: [
      "In the Period selector, choose Latest 7, 30 or 90 days. The total number of events shows next to it.",
      "The three boxes at the top split the work into The team, The agents and Automatic, each with its share of the total.",
      "When has one bar per day, so you can see the busiest days. Who did it and What was done show who acted the most and which kinds of action were most common.",
      "In Operation timeline, each row says what was done, by whom and when. When a deal is linked, its name is a link that opens it.",
      "If the period is busy, the list shows only the most recent events, and the screen tells you when that happens.",
    ],
    termos: [
      { termo: "The team", significa: "Actions done by a person on your team." },
      { termo: "The agents", significa: "Actions done by an AI agent." },
      { termo: "Automatic", significa: "Actions done by neither the team nor an agent: system rules, the product itself or the person being served." },
      { termo: "Event", significa: "Each record of something that was done in the operation, such as moving a deal to another stage or adding a note." },
    ],
  },
};

export default ajuda;

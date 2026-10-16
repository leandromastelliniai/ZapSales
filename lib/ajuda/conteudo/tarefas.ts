import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de situação são os da tela em cada idioma (`Nova tarefa` / `Nueva tarea` /
 * `New task`; `Em aberto` / `Abiertas` / `Open`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Tarefas guardam o que ficou combinado, com prazo: ligar de volta na terça, mandar a proposta, confirmar um horário. Assim o combinado não fica só na memória de alguém.",
    passos: [
      "Use Nova tarefa para registrar o que precisa ser feito e até quando.",
      "Escolha em Lista ou Calendário como prefere enxergar: a lista traz uma tarefa por linha, o calendário mostra cada uma no seu dia.",
      "O filtro de situação começa em Em aberto, que junta o que está pendente e em andamento. Troque para ver o que já foi concluído ou cancelado.",
      "Quando a tarefa é ligada a um negócio, ela aparece também na linha do tempo desse negócio.",
    ],
    termos: [
      { termo: "Pendente", significa: "Combinada, mas ainda ninguém começou." },
      { termo: "Em andamento", significa: "Alguém já está cuidando." },
      { termo: "Em aberto", significa: "Tudo o que ainda não foi concluído nem cancelado: pendente mais em andamento." },
    ],
  },
  es: {
    oQueMostra:
      "Las tareas guardan lo que quedó acordado, con plazo: devolver una llamada el martes, enviar la propuesta, confirmar un horario. Así lo acordado no queda solo en la memoria de alguien.",
    passos: [
      "Usa Nueva tarea para registrar lo que hay que hacer y hasta cuándo.",
      "Elige en Lista o Calendario cómo prefieres verlo: la lista trae una tarea por fila, el calendario muestra cada una en su día.",
      "El filtro de situación empieza en Abiertas, que junta lo pendiente y lo en curso. Cámbialo para ver lo ya concluido o cancelado.",
      "Cuando la tarea está ligada a un negocio, aparece también en la línea de tiempo de ese negocio.",
    ],
    termos: [
      { termo: "Pendiente", significa: "Acordada, pero todavía nadie empezó." },
      { termo: "En curso", significa: "Alguien ya se está ocupando." },
      { termo: "Abiertas", significa: "Todo lo que aún no se concluyó ni canceló: pendientes más en curso." },
    ],
  },
  en: {
    oQueMostra:
      "Tasks hold what was agreed, with a deadline: call back on Tuesday, send the proposal, confirm a time. That way what was agreed doesn't live only in someone's memory.",
    passos: [
      "Use New task to record what needs doing and by when.",
      "Pick List or Calendar for how you prefer to see it: the list has one task per row, the calendar shows each on its day.",
      "The status filter starts on Open, which combines pending and in progress. Change it to see what is already done or canceled.",
      "When a task is linked to a deal, it also shows up on that deal's timeline.",
    ],
    termos: [
      { termo: "Pending", significa: "Agreed, but nobody has started yet." },
      { termo: "In progress", significa: "Someone is already on it." },
      { termo: "Open", significa: "Everything not yet done or canceled: pending plus in progress." },
    ],
  },
};

export default ajuda;

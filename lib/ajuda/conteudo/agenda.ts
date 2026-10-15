import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de aba são os da tela em cada idioma (`Novo agendamento` / `Nueva cita` /
 * `New appointment`; `Próximos` / `Próximas` / `Upcoming`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "A Agenda mostra tudo o que está marcado com os seus clientes: quando, com quem, e quem da equipe atende. Dá para ver por dia, semana ou mês, e filtrar por pessoa.",
    passos: [
      "Use Dia, Semana ou Mês para escolher o tamanho da janela, e as setas para andar no tempo. Hoje volta para a data de agora.",
      "Para marcar um horário, use Novo agendamento. Antes disso, é preciso ter pelo menos um tipo de agendamento cadastrado em Configurações.",
      "Acima da grade ficam as abas Próximos, Aguardando confirmação, Passados e Cancelados, para ver só o que interessa agora.",
      "Se a sua empresa usa o Google Agenda, conecte a conta no aviso abaixo do título: o que você marca aqui vai para lá, e o que já está lá aparece aqui.",
    ],
    termos: [
      { termo: "Tipo de agendamento", significa: "O modelo do compromisso: nome, duração e onde acontece (por exemplo, Consulta de 30 minutos no consultório)." },
      { termo: "Aguardando confirmação", significa: "Horário marcado que o cliente ainda não confirmou." },
      { termo: "Janela de trabalho", significa: "Os dias e horas em que cada pessoa da equipe atende. Fora dela, ninguém consegue marcar com ela." },
    ],
  },
  es: {
    oQueMostra:
      "La Agenda muestra todo lo que está agendado con tus clientes: cuándo, con quién y quién del equipo atiende. Puedes verla por día, semana o mes, y filtrar por persona.",
    passos: [
      "Usa Día, Semana o Mes para elegir el tamaño de la ventana, y las flechas para moverte en el tiempo. Hoy vuelve a la fecha actual.",
      "Para agendar un horario, usa Nueva cita. Antes necesitas tener al menos un tipo de cita registrado en Configuración.",
      "Sobre la grilla están las pestañas Próximas, Esperando confirmación, Pasadas y Canceladas, para ver solo lo que importa ahora.",
      "Si tu empresa usa Google Calendar, conecta la cuenta en el aviso bajo el título: lo que agendas aquí va allá, y lo que ya está allá aparece aquí.",
    ],
    termos: [
      { termo: "Tipo de cita", significa: "El modelo del compromiso: nombre, duración y dónde ocurre (por ejemplo, Consulta de 30 minutos en el consultorio)." },
      { termo: "Esperando confirmación", significa: "Horario agendado que el cliente todavía no confirmó." },
      { termo: "Ventana de trabajo", significa: "Los días y horas en que cada persona del equipo atiende. Fuera de ella, nadie puede agendar con esa persona." },
    ],
  },
  en: {
    oQueMostra:
      "The calendar shows everything scheduled with your customers: when, with whom, and which team member is handling it. You can view it by day, week or month, and filter by person.",
    passos: [
      "Use Day, Week or Month to pick the size of the window, and the arrows to move through time. Today jumps back to the current date.",
      "To book a time, use New appointment. Before that, you need at least one appointment type set up in Settings.",
      "Above the grid are the tabs Upcoming, Awaiting confirmation, Past and Canceled, so you see only what matters now.",
      "If your company uses Google Calendar, connect the account in the notice under the title: what you book here goes there, and what is already there shows up here.",
    ],
    termos: [
      { termo: "Appointment type", significa: "The template for the booking: name, length and where it takes place (for example, a 30-minute consultation at the office)." },
      { termo: "Awaiting confirmation", significa: "A booked time the customer has not confirmed yet." },
      { termo: "Working window", significa: "The days and hours each team member takes appointments. Outside it, nobody can book with that person." },
    ],
  },
};

export default ajuda;

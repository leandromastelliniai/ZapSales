import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão, campo e seção aqui são os que a tela mostra em cada idioma
 * (`Novo tipo de agendamento` / `Nuevo tipo de cita` / `New appointment type`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui você define o que as pessoas podem marcar com a sua empresa, quanto tempo dura cada coisa e quem atende. É esta lista que a tela de marcar e o agente de IA oferecem ao cliente.",
    passos: [
      "Para criar um tipo, use Novo tipo de agendamento: dê um nome, escolha a Categoria, a duração e Onde acontece.",
      "Escolha em Quem atende a pessoa responsável. Sem responsável, o tipo não tem horário para oferecer e a lista mostra um aviso.",
      "Em cada linha, Editar abre a duração, o responsável, o Preço padrão e o aviso por WhatsApp que o cliente recebe antes do compromisso.",
      "Desativar tira o tipo da lista de quem marca sem apagar nada; Reativar traz de volta. Criar, editar e desativar são para gestores.",
      "Mais acima ficam as regras gerais da agenda, como Dias fora da rotina (feriado, férias) e Confirmação de presença.",
    ],
    termos: [
      { termo: "Tipo de agendamento", significa: "Um modelo de compromisso, como Consulta ou Retorno, com duração, local e responsável já definidos." },
      { termo: "Quem atende", significa: "A pessoa dona da agenda daquele tipo. É a agenda dela que decide quais horários aparecem." },
      { termo: "Confirmação de presença", significa: "Depois do compromisso, o sistema pede à equipe que diga se o cliente veio. Sem resposta, a presença fica desconhecida e ninguém é tratado como faltoso." },
      { termo: "Clientes pela agenda", significa: "Regra que, quando ligada, dá a etiqueta cliente a quem tem horário marcado. Só administradores ligam ou desligam." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí defines qué pueden agendar las personas con tu empresa, cuánto dura cada cosa y quién atiende. Esta es la lista que la pantalla de agendar y el agente de IA le ofrecen al cliente.",
    passos: [
      "Para crear un tipo, usa Nuevo tipo de cita: pon un nombre, elige la Categoría, la duración y Dónde se realiza.",
      "Elige en Quién atiende a la persona responsable. Sin responsable, el tipo no tiene horarios para ofrecer y la lista muestra un aviso.",
      "En cada fila, Editar abre la duración, el responsable, el Precio estándar y el aviso por WhatsApp que el cliente recibe antes de la cita.",
      "Desactivar saca el tipo de la lista de quienes agendan sin borrar nada; Reactivar lo trae de vuelta. Crear, editar y desactivar son para gestores.",
      "Más arriba están las reglas generales de la agenda, como Días fuera de la rutina (festivo, vacaciones) y Confirmación de asistencia.",
    ],
    termos: [
      { termo: "Tipo de cita", significa: "Un modelo de compromiso, como Consulta o Seguimiento, con duración, lugar y responsable ya definidos." },
      { termo: "Quién atiende", significa: "La persona dueña de la agenda de ese tipo. Su agenda decide qué horarios aparecen." },
      { termo: "Confirmación de asistencia", significa: "Después de la cita, el sistema le pide al equipo que diga si el cliente vino. Sin respuesta, la asistencia queda desconocida y nadie es tratado como ausente." },
      { termo: "Clientes por la agenda", significa: "Regla que, cuando está activada, da la etiqueta cliente a quien tiene una cita. Solo los administradores la activan o desactivan." },
    ],
  },
  en: {
    oQueMostra:
      "This is where you define what people can book with your company, how long each thing lasts and who handles it. This is the list the booking screen and the AI agent offer to the customer.",
    passos: [
      "To create a type, use New appointment type: give it a name, then choose the Category, the duration and Where it happens.",
      "Pick the person in charge under Who attends. Without one, the type has no times to offer and the list shows a warning.",
      "On each row, Edit opens the duration, the owner, the Standard price and the WhatsApp reminder the customer gets before the appointment.",
      "Disable takes the type off the booking list without deleting anything; Reactivate brings it back. Creating, editing and disabling are for managers.",
      "Higher up are the general calendar rules, such as Days outside the routine (holiday, vacation) and Attendance confirmation.",
    ],
    termos: [
      { termo: "Appointment type", significa: "A template for an appointment, such as Consultation or Follow-up, with duration, place and owner already set." },
      { termo: "Who attends", significa: "The person who owns the calendar for that type. Their calendar decides which times appear." },
      { termo: "Attendance confirmation", significa: "After the appointment, the system asks the team to say whether the customer showed up. With no answer, attendance stays unknown and nobody is treated as a no-show." },
      { termo: "Clients by calendar", significa: "A rule that, when turned on, gives the client tag to anyone with a booked appointment. Only administrators can turn it on or off." },
    ],
  },
};

export default ajuda;

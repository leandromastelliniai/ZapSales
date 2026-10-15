import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes dos papéis (`admin`, `manager`, `agent`, `viewer`) são os que a tela mostra, nos três
 * idiomas: eles não são traduzidos na lista, então a ajuda também os cita como aparecem.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui você vê quem trabalha na sua empresa, o que cada pessoa pode fazer e quem está disponível para receber conversas. Só administradores convidam pessoas ou mudam o papel de alguém.",
    passos: [
      "Para trazer alguém, use Convidar membros: a pessoa recebe um e-mail e, ao aceitar, aparece aqui como Aceito.",
      "Na coluna Papel, escolha o que a pessoa pode fazer. O papel dela vale em todas as telas e em tudo o que o sistema recusa ou permite.",
      "Em Interface você escolhe quantas telas aparecem no menu dessa pessoa: Completa, Simplificada ou Personalizada.",
      "Para tirar o acesso de alguém, abra o menu de três pontos da linha e escolha Revogar acesso. Dá para devolver depois, em Devolver acesso.",
      "Na aba Atendimento, gestores definem o horário de cada atendente e como as conversas novas são distribuídas.",
    ],
    termos: [
      { termo: "viewer", significa: "Só consulta: vê conversas, contatos e funis, mas não altera nada." },
      { termo: "agent", significa: "Atendente: responde conversas e cria ou edita contatos, negócios e tarefas." },
      { termo: "manager", significa: "Gestor: faz o que o atendente faz e também configura funis, vê a Auditoria e os horários da equipe." },
      { termo: "admin", significa: "Administrador: tudo o que o gestor faz, mais convidar pessoas e mudar papéis." },
      { termo: "Pendente / Aceito / Revogado", significa: "Convite ainda não aceito / pessoa que já entrou / acesso retirado, que pode ser devolvido." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí ves quién trabaja en tu empresa, qué puede hacer cada persona y quién está disponible para recibir conversaciones. Solo los administradores invitan personas o cambian el rol de alguien.",
    passos: [
      "Para traer a alguien, usa Invitar miembros: la persona recibe un correo y, al aceptar, aparece aquí como Aceptado.",
      "En la columna Rol, elige qué puede hacer la persona. Su rol vale en todas las pantallas y en todo lo que el sistema permite o rechaza.",
      "En Interfaz eliges cuántas pantallas aparecen en el menú de esa persona: Completa, Simplificada o Personalizada.",
      "Para quitar el acceso a alguien, abre el menú de tres puntos de la fila y elige Revocar acceso. Puedes devolverlo después, en Devolver el acceso.",
      "En la pestaña Atención, los gestores definen el horario de cada agente y cómo se reparten las conversaciones nuevas.",
    ],
    termos: [
      { termo: "viewer", significa: "Solo consulta: ve conversaciones, contactos y embudos, pero no cambia nada." },
      { termo: "agent", significa: "Agente: responde conversaciones y crea o edita contactos, negocios y tareas." },
      { termo: "manager", significa: "Gestor: hace lo que hace el agente y además configura embudos, ve la Auditoría y los horarios del equipo." },
      { termo: "admin", significa: "Administrador: todo lo que hace el gestor, más invitar personas y cambiar roles." },
      { termo: "Pendiente / Aceptado / Revocado", significa: "Invitación aún no aceptada / persona que ya entró / acceso retirado, que se puede devolver." },
    ],
  },
  en: {
    oQueMostra:
      "Here you see who works at your company, what each person can do, and who is available to take conversations. Only admins invite people or change someone's role.",
    passos: [
      "To bring someone in, use Invite members: the person gets an email and, once they accept, shows up here as Accepted.",
      "In the Role column, choose what the person can do. Their role applies on every screen and to everything the system allows or refuses.",
      "In Interface you choose how many screens appear in that person's menu: Full, Simplified or Custom.",
      "To remove someone's access, open the three-dot menu on their row and choose Revoke access. You can give it back later with Restore access.",
      "On the Support tab, managers set each agent's hours and how new conversations are shared out.",
    ],
    termos: [
      { termo: "viewer", significa: "Read-only: sees conversations, contacts and pipelines, but changes nothing." },
      { termo: "agent", significa: "Answers conversations and creates or edits contacts, deals and tasks." },
      { termo: "manager", significa: "Does what an agent does and also configures pipelines and sees the Audit log and team hours." },
      { termo: "admin", significa: "Everything a manager does, plus inviting people and changing roles." },
      { termo: "Pending / Accepted / Revoked", significa: "Invitation not yet accepted / person who has joined / access removed, which can be given back." },
    ],
  },
};

export default ajuda;

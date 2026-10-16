import type { AjudaDaPagina } from "../tipos";

const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "A Auditoria é o diário de tudo o que foi mudado no sistema: quem fez, o quê e quando. O histórico não se apaga nem se altera, e só gestores e administradores o veem.",
    passos: [
      "Para achar algo específico, escreva parte do nome da ação em Ação contém. Por exemplo, lead.created mostra os negócios criados.",
      "Use Tipo de recurso para olhar só um tipo de coisa, como contact (contato) ou lead (negócio).",
      "Os campos de data limitam o período. Exportar CSV baixa o que está filtrado, para guardar ou mandar a quem precisa.",
      "Cada linha mostra quando foi, quem fez (o nome da pessoa, uma chave de acesso ou o próprio sistema), a ação e o item atingido.",
    ],
    termos: [
      { termo: "Ação", significa: "O que aconteceu, em uma frase (como Uniu contatos duplicados), com o código técnico logo abaixo, como contact.merged. É o código que o campo Ação contém entende." },
      { termo: "Recurso", significa: "O item que sofreu a ação, com o começo do código dele ao lado." },
      { termo: "Ator", significa: "Quem fez: o nome da pessoa da equipe, uma chave de acesso, o Suporte da plataforma ou o Sistema, que age sozinho, como no envio de uma mensagem programada." },
      { termo: "ID da requisição", significa: "O código da chamada que originou a mudança. Serve para o suporte achar o rastro técnico." },
    ],
  },
  es: {
    oQueMostra:
      "La Auditoría es el diario de todo lo que se cambió en el sistema: quién lo hizo, qué y cuándo. El historial no se borra ni se altera, y solo lo ven gestores y administradores.",
    passos: [
      "Para encontrar algo específico, escribe parte del nombre de la acción en La acción contiene. Por ejemplo, lead.created muestra los negocios creados.",
      "Usa Tipo de recurso para mirar un solo tipo de cosa, como contact (contacto) o lead (negocio).",
      "Los campos de fecha limitan el período. Exportar CSV descarga lo que está filtrado, para guardarlo o enviarlo a quien lo necesite.",
      "Cada fila muestra cuándo fue, quién lo hizo (el nombre de la persona, una llave de acceso o el propio sistema), la acción y el elemento afectado.",
    ],
    termos: [
      { termo: "Acción", significa: "Lo que pasó, en una frase (como Unió contactos duplicados), con el código técnico justo debajo, como contact.merged. Es el código que entiende el campo La acción contiene." },
      { termo: "Recurso", significa: "El elemento que sufrió la acción, con el comienzo de su código al lado." },
      { termo: "Actor", significa: "Quién lo hizo: el nombre de la persona del equipo, una llave de acceso, el Soporte de la plataforma o el Sistema, que actúa solo, como al enviar un mensaje programado." },
      { termo: "ID de la solicitud", significa: "El código de la llamada que originó el cambio. Sirve para que soporte encuentre el rastro técnico." },
    ],
  },
  en: {
    oQueMostra:
      "The Audit log is the diary of everything changed in the system: who did it, what and when. The history is never erased or altered, and only managers and admins can see it.",
    passos: [
      "To find something specific, type part of the action name under Action contains. For example, lead.created shows the deals that were created.",
      "Use Resource type to look at one kind of thing only, such as contact or lead (deal).",
      "The date fields limit the period. Export CSV downloads what is filtered, to keep or send to whoever needs it.",
      "Each row shows when it happened, who did it (the person's name, an access key or the system itself), the action and the item affected.",
    ],
    termos: [
      { termo: "Action", significa: "What happened, in a sentence (like Merged duplicate contacts), with the technical code right below it, like contact.merged. The code is what the Action contains field understands." },
      { termo: "Resource", significa: "The item the action hit, with the start of its code beside it." },
      { termo: "Actor", significa: "Who did it: the team member's name, an access key, Platform support or the System, which acts by itself, like when sending a scheduled message." },
      { termo: "Request ID", significa: "The code of the call that caused the change. Support uses it to find the technical trail." },
    ],
  },
};

export default ajuda;

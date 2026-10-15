import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de aba e de botão aqui são os que a tela mostra em cada idioma (`Abertos` / `Abiertos` / `Open`,
 * `Marcar resolvido` / `Marcar resuelto` / `Mark resolved`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui chegam os avisos do assistente para a equipe: conexão que caiu, tarefa que falhou, atendimento passado para uma pessoa e outras coisas que pedem a sua atenção.",
    passos: [
      "Em Abertos, leia a lista. Os mais graves vêm primeiro e, entre iguais, os mais recentes. O selo de cada aviso diz se ele é crítico, de atenção ou só informativo.",
      "Quando o aviso tiver um link embaixo do texto, clique nele para ir direto ao lugar onde se resolve.",
      "Depois de cuidar do assunto, use Marcar resolvido na linha. Para limpar a lista de uma vez, use Marcar todos resolvidos. Esses botões só aparecem para Atendente ou acima; quem tem acesso Somente leitura apenas lê.",
      "Em Resolvidos ficam os que você já fechou. Se fechou sem querer, use Reabrir.",
    ],
    termos: [
      { termo: "Crítico / atenção / informativo", significa: "A gravidade do aviso. Crítico pede ação logo; atenção merece um olhar; informativo só conta o que aconteceu." },
      { termo: "Marcar resolvido", significa: "Diz ao sistema que você já cuidou do assunto. O aviso sai de Abertos, mas continua guardado em Resolvidos." },
      { termo: "Assistente", significa: "A inteligência artificial que atende seus clientes. Quando ela não consegue seguir sozinha, o aviso cai aqui." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí llegan los avisos del asistente para el equipo: conexión que se cayó, tarea que falló, atención pasada a una persona y otras cosas que piden tu atención.",
    passos: [
      "En Abiertos, lee la lista. Los más graves van primero y, entre iguales, los más recientes. La etiqueta de cada aviso dice si es crítico, de atención o solo informativo.",
      "Cuando el aviso tenga un enlace debajo del texto, haz clic para ir directo al lugar donde se resuelve.",
      "Después de ocuparte del asunto, usa Marcar resuelto en la fila. Para limpiar la lista de una vez, usa Marcar todos como resueltos. Estos botones solo aparecen para Asesor o superior; quien tiene acceso Solo lectura solo puede leer.",
      "En Resueltos quedan los que ya cerraste. Si cerraste uno sin querer, usa Reabrir.",
    ],
    termos: [
      { termo: "Crítico / atención / informativo", significa: "La gravedad del aviso. Crítico pide acción pronto; atención merece una mirada; informativo solo cuenta lo que pasó." },
      { termo: "Marcar resuelto", significa: "Le dice al sistema que ya te ocupaste del asunto. El aviso sale de Abiertos, pero sigue guardado en Resueltos." },
      { termo: "Asistente", significa: "La inteligencia artificial que atiende a tus clientes. Cuando no puede seguir sola, el aviso llega aquí." },
    ],
  },
  en: {
    oQueMostra:
      "This is where the assistant's notices to the team arrive: a connection that dropped, a task that failed, a conversation passed to a person, and other things that need your attention.",
    passos: [
      "Under Open, read the list. The most severe come first and, among equals, the most recent. Each notice's tag says whether it is critical, a warning or just informational.",
      "When a notice has a link under its text, click it to go straight to the place where it gets fixed.",
      "After you handle the matter, use Mark resolved on the row. To clear the list at once, use Mark all resolved. These buttons only appear for Agent or higher; people with Read only access can just read.",
      "Under Resolved are the ones you already closed. If you closed one by mistake, use Reopen.",
    ],
    termos: [
      { termo: "Critical / attention / informational", significa: "How serious the notice is. Critical asks for action soon; attention deserves a look; informational just tells what happened." },
      { termo: "Mark resolved", significa: "Tells the system you have dealt with the matter. The notice leaves Open but stays saved under Resolved." },
      { termo: "Assistant", significa: "The artificial intelligence that serves your customers. When it cannot go on by itself, the notice lands here." },
    ],
  },
};

export default ajuda;

import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de selo aqui são os que a tela mostra em cada idioma (`Novo fluxo de atendimento` /
 * `Nuevo flujo de atención` / `New support flow`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui ficam os roteiros de perguntas que a IA segue durante a conversa. Ela pergunta uma coisa por vez e guarda cada resposta no cadastro do cliente.",
    passos: [
      "Novo fluxo de atendimento cria um roteiro novo. Dê um nome: ele nasce como rascunho. O botão só aparece para gestores e administradores.",
      "O editor abre em seguida. Nele você cadastra as perguntas e escolhe o que acontece quando o roteiro termina.",
      "Defina também quando o roteiro começa: por palavras-gatilho na mensagem do cliente, ou por uma intenção de um roteador (em IA › Roteadores).",
      "Clique em Publicar, dentro do editor, para o roteiro passar a valer. Na lista, cada cartão mostra o nome, o status e a data da última alteração.",
      "Renomear, Duplicar e Excluir ficam no pé do cartão. Excluir apaga também as versões e as inscrições do fluxo, e não dá para desfazer.",
    ],
    termos: [
      { termo: "Rascunho / Ativo / Desativado", significa: "Rascunho é o fluxo ainda em montagem, Ativo é o que já foi publicado e Desativado é o que foi desligado." },
      { termo: "Palavras-gatilho", significa: "Palavras que, quando aparecem na mensagem do cliente, fazem o roteiro começar sozinho." },
      { termo: "Skill", significa: "Um procedimento da loja que a IA usa em um passo do roteiro, se você quiser." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí están los guiones de preguntas que la IA sigue durante la conversación. Pregunta una cosa a la vez y guarda cada respuesta en el registro del cliente.",
    passos: [
      "Nuevo flujo de atención crea un guion nuevo. Ponle un nombre: nace como borrador. El botón solo aparece para gestores y administradores.",
      "El editor se abre enseguida. Ahí registras las preguntas y eliges qué pasa cuando el guion termina.",
      "Define también cuándo empieza el guion: por palabras clave en el mensaje del cliente, o por una intención de un enrutador (en IA › Enrutadores).",
      "Haz clic en Publicar, dentro del editor, para que el guion empiece a valer. En la lista, cada tarjeta muestra el nombre, el estado y la fecha del último cambio.",
      "Renombrar, Duplicar y Eliminar están al pie de la tarjeta. Eliminar borra también las versiones y las inscripciones del flujo, y no se puede deshacer.",
    ],
    termos: [
      { termo: "Borrador / Activo / Desactivado", significa: "Borrador es el flujo todavía en construcción, Activo es el que ya se publicó y Desactivado es el que se apagó." },
      { termo: "Palabras clave de inicio", significa: "Palabras que, cuando aparecen en el mensaje del cliente, hacen que el guion empiece solo." },
      { termo: "Skill", significa: "Un procedimiento de la tienda que la IA usa en un paso del guion, si quieres." },
    ],
  },
  en: {
    oQueMostra:
      "This is where the question scripts the AI follows during a conversation live. It asks one thing at a time and saves each answer on the customer's record.",
    passos: [
      "New support flow creates a new script. Give it a name: it starts as a draft. The button only appears for managers and administrators.",
      "The editor opens next. There you add the questions and choose what happens when the script ends.",
      "Also set when the script starts: by trigger words in the customer's message, or by an intent from a router (in AI › Routers).",
      "Click Publish, inside the editor, so the script takes effect. In the list, each card shows the name, the status and the date of the last change.",
      "Rename, Duplicate and Delete are at the bottom of the card. Delete also removes the flow's versions and enrollments, and it cannot be undone.",
    ],
    termos: [
      { termo: "Draft / Active / Disabled", significa: "Draft is a flow still being built, Active is one that has been published and Disabled is one that was turned off." },
      { termo: "Trigger words", significa: "Words that, when they show up in the customer's message, make the script start on its own." },
      { termo: "Skill", significa: "A store procedure the AI uses at one step of the script, if you want." },
    ],
  },
};

export default ajuda;

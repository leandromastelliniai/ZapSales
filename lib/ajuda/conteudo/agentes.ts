import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão, filtro e selo aqui são os que a tela mostra em cada idioma (`Novo agente` / `Nuevo agente` /
 * `New agent`, `Incluir arquivados` / `Incluir archivados` / `Include archived`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui ficam os agentes de IA que respondem no WhatsApp da sua empresa. Cada cartão mostra o nome do agente, o modelo de IA que ele usa e se ele está no ar.",
    passos: [
      "Use a busca por nome, o filtro Status e a caixa Incluir arquivados para achar um agente.",
      "Clique em Editar (ou em Visualizar, para quem não pode alterar) para abrir o agente e ajustar o jeito de atender.",
      "Novo agente abre um assistente que guia a criação em cinco perguntas (quem você é, o que o agente faz, como fala, quando chamar uma pessoa e o teste); quem prefere pode ir ao editor completo a qualquer momento. Esse botão e o menu dos três pontinhos de cada cartão só aparecem para administradores.",
      "No menu estão Duplicar, Renomear, Pausar (ou Despausar) e Arquivar. Arquivar não se desfaz pela tela, e o agente padrão não pode ser arquivado.",
    ],
    termos: [
      { termo: "Publicado", significa: "O agente está no ar: tem uma versão publicada e responde aos clientes." },
      { termo: "Rascunho", significa: "O agente ainda não foi publicado, ou está pausado. Enquanto isso, ele não responde." },
      { termo: "default", significa: "Selo do agente padrão da organização. Ele não pode ser arquivado." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí están los agentes de IA que responden en el WhatsApp de tu empresa. Cada tarjeta muestra el nombre del agente, el modelo de IA que usa y si está en línea.",
    passos: [
      "Usa la búsqueda por nombre, el filtro Estado y la casilla Incluir archivados para encontrar un agente.",
      "Haz clic en Editar (o en Ver, si no puedes modificar) para abrir el agente y ajustar su forma de atender.",
      "Nuevo agente abre un asistente que guía la creación en cinco preguntas (tu negocio, qué hace el agente, cómo habla, cuándo llamar a una persona y la prueba); quien prefiera puede ir al editor completo en cualquier momento. Ese botón y el menú de los tres puntitos de cada tarjeta solo aparecen para los administradores.",
      "En el menú están Duplicar, Renombrar, Pausar (o Reanudar) y Archivar. Archivar no se deshace desde la pantalla, y el agente predeterminado no se puede archivar.",
    ],
    termos: [
      { termo: "Publicado", significa: "El agente está en línea: tiene una versión publicada y responde a los clientes." },
      { termo: "Borrador", significa: "El agente todavía no fue publicado, o está pausado. Mientras tanto, no responde." },
      { termo: "predeterminado", significa: "Sello del agente predeterminado de la organización. No se puede archivar." },
    ],
  },
  en: {
    oQueMostra:
      "This is where the AI agents that answer on your company's WhatsApp live. Each card shows the agent's name, the AI model it uses and whether it is live.",
    passos: [
      "Use the search by name, the Status filter and the Include archived box to find an agent.",
      "Click Edit (or View, if you cannot make changes) to open the agent and adjust how it handles customers.",
      "New agent opens an assistant that guides the creation in five questions (your business, what the agent does, how it speaks, when to bring in a person and the test); if you prefer, you can go to the full editor at any time. That button and the three-dot menu on each card only appear for administrators.",
      "The menu has Duplicate, Rename, Pause (or Resume) and Archive. Archiving cannot be undone from the screen, and the default agent cannot be archived.",
    ],
    termos: [
      { termo: "Published", significa: "The agent is live: it has a published version and answers customers." },
      { termo: "Draft", significa: "The agent has not been published yet, or it is paused. Meanwhile, it does not answer." },
      { termo: "default", significa: "Badge of the organization's default agent. It cannot be archived." },
    ],
  },
};

export default ajuda;

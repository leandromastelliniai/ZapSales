import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de selo aqui são os que a tela mostra em cada idioma (`Enviar skill (.zip)` /
 * `Subir skill (.zip)` / `Upload skill (.zip)`, `Adotar versão nova` / `Adoptar versión nueva` / `Adopt new version`).
 * Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Skills são habilidades especializadas que os agentes carregam só quando a conversa pede. Aqui você instala as prontas do catálogo ou envia a sua.",
    passos: [
      "Em Catálogo estão as skills prontas, mantidas pela plataforma. Clique em Instalar e a skill passa a valer para os agentes da organização.",
      "Para usar uma skill sua, clique em Enviar skill (.zip). Se o .zip tiver o mesmo nome de uma skill instalada, a sua versão passa a valer no lugar da do catálogo.",
      "Em Skills instaladas, Editar ajusta o texto da skill. Cada salvamento cria uma versão nova, e a anterior fica no Histórico de versões.",
      "Quando o catálogo ganha uma versão nova de uma skill, aparece um aviso com o que muda e o botão Adotar versão nova. Se você tinha editado a skill, suas alterações ficam só no histórico.",
      "Desinstalar tira a skill da lista de instaladas. Os botões desta tela só aparecem para gestores e administradores.",
    ],
    termos: [
      { termo: "Skill", significa: "Um procedimento especializado que o agente segue, e que ele só carrega quando o assunto pede." },
      { termo: "do catálogo / manual", significa: "Do catálogo é a skill instalada da lista pronta da plataforma. Manual é a que não veio do catálogo, como uma enviada por você." },
      { termo: "Palavras-chave de ativação", significa: "As palavras que, escritas pelo cliente, fazem a skill ser carregada. Você as vê ao editar a skill." },
    ],
  },
  es: {
    oQueMostra:
      "Las skills son habilidades especializadas que los agentes cargan solo cuando la conversación lo pide. Aquí instalas las que ya vienen listas en el catálogo o subes la tuya.",
    passos: [
      "En Catálogo están las skills listas, mantenidas por la plataforma. Haz clic en Instalar y la skill pasa a valer para los agentes de la organización.",
      "Para usar una skill tuya, haz clic en Subir skill (.zip). Si el .zip tiene el mismo nombre de una skill instalada, tu versión pasa a valer en lugar de la del catálogo.",
      "En Skills instaladas, Editar ajusta el texto de la skill. Cada guardado crea una versión nueva, y la anterior queda en el Historial de versiones.",
      "Cuando el catálogo tiene una versión nueva de una skill, aparece un aviso con lo que cambia y el botón Adoptar versión nueva. Si habías editado la skill, tus cambios quedan solo en el historial.",
      "Desinstalar saca la skill de la lista de instaladas. Los botones de esta pantalla solo aparecen para gestores y administradores.",
    ],
    termos: [
      { termo: "Skill", significa: "Un procedimiento especializado que el agente sigue, y que solo carga cuando el tema lo pide." },
      { termo: "del catálogo / manual", significa: "Del catálogo es la skill instalada desde la lista preparada de la plataforma. Manual es la que no vino del catálogo, como una que subiste tú." },
      { termo: "Palabras clave de activación", significa: "Las palabras que, escritas por el cliente, hacen que se cargue la skill. Las ves al editar la skill." },
    ],
  },
  en: {
    oQueMostra:
      "Skills are specialized abilities that agents load only when the conversation calls for them. Here you install ready-made ones from the catalog or upload your own.",
    passos: [
      "The Catalog has the ready-made skills, maintained by the platform. Click Install and the skill starts working for the organization's agents.",
      "To use a skill of your own, click Upload skill (.zip). If the .zip has the same name as an installed skill, your version takes effect in place of the catalog's.",
      "Under Installed skills, Edit adjusts the skill's text. Each save creates a new version, and the previous one stays in the Version history.",
      "When the catalog gets a new version of a skill, a notice appears with what changes and the Adopt new version button. If you had edited the skill, your changes stay only in the history.",
      "Uninstall removes the skill from the installed list. The buttons on this screen only appear for managers and administrators.",
    ],
    termos: [
      { termo: "Skill", significa: "A specialized procedure the agent follows, which it only loads when the topic calls for it." },
      { termo: "from the catalog / manual", significa: "From the catalog is a skill installed from the platform's ready-made list. Manual is one that did not come from the catalog, such as one you uploaded." },
      { termo: "Activation keywords", significa: "The words that, when the customer writes them, make the skill load. You see them when editing the skill." },
    ],
  },
};

export default ajuda;

import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de seção aqui são os que a tela mostra em cada idioma (`Publicar versão` / `Publicar versión` /
 * `Publish version`, `Novo aprendizado` / `Nuevo aprendizaje` / `New learning`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "É a memória comum de todos os agentes de IA da organização: regras e aprendizados que eles seguem em qualquer conversa. Não é a configuração de um agente só.",
    passos: [
      "No Documento da organização, escreva o texto-base que todo agente lê antes de responder, como a política da casa. Exemplo: não prometer desconto sem confirmar com uma pessoa.",
      "Clique em Publicar versão para o texto passar a valer para todos os agentes. Só administradores podem publicar.",
      "No Histórico de versões, clique numa versão para ler. Restaurar como nova versão traz o texto para o editor, e você ainda precisa clicar em Publicar versão.",
      "Em Aprendizados, Novo aprendizado guarda um fato ou uma correção pontual: preencha o Título e O que o agente deve saber, e clique em Salvar aprendizado.",
      "Cada aprendizado mostra de onde veio: manual, aprendido automaticamente ou anotado pelo agente. Arquivar tira da lista, e Ver aprendizados arquivados mostra os arquivados para Reativar.",
    ],
    termos: [
      { termo: "Documento da organização", significa: "O texto-base único que todos os agentes leem antes de responder, como as regras da casa para um atendente novo." },
      { termo: "Aprendizados", significa: "Fatos e correções pontuais, além do documento. Podem ser escritos por você ou aprendidos pelo sistema a partir de conversas reais." },
      { termo: "ativa", significa: "A versão do documento que está valendo agora. Aparece como v1 ativa, v2 ativa e assim por diante." },
    ],
  },
  es: {
    oQueMostra:
      "Es la memoria común de todos los agentes de IA de la organización: reglas y aprendizajes que siguen en cualquier conversación. No es la configuración de un solo agente.",
    passos: [
      "En el Documento de la organización, escribe el texto base que todo agente lee antes de responder, como la política de la casa. Ejemplo: no prometer descuento sin confirmar con una persona.",
      "Haz clic en Publicar versión para que el texto valga para todos los agentes. Solo los administradores pueden publicar.",
      "En el Historial de versiones, haz clic en una versión para leerla. Restaurar como nueva versión trae el texto al editor, y todavía tienes que hacer clic en Publicar versión.",
      "En Aprendizajes, Nuevo aprendizaje guarda un dato o una corrección puntual: completa el Título y Lo que el agente debe saber, y haz clic en Guardar aprendizaje.",
      "Cada aprendizaje muestra de dónde vino: manual, aprendido automáticamente o anotado por el agente. Archivar lo saca de la lista, y Ver aprendizajes archivados muestra los archivados para Reactivar.",
    ],
    termos: [
      { termo: "Documento de la organización", significa: "El texto base único que todos los agentes leen antes de responder, como las reglas de la casa para un asesor nuevo." },
      { termo: "Aprendizajes", significa: "Datos y correcciones puntuales, además del documento. Pueden ser escritos por ti o aprendidos por el sistema a partir de conversaciones reales." },
      { termo: "activa", significa: "La versión del documento que está vigente ahora. Aparece como v1 activa, v2 activa y así sucesivamente." },
    ],
  },
  en: {
    oQueMostra:
      "This is the shared memory of all the organization's AI agents: rules and learnings they follow in any conversation. It is not the setup of a single agent.",
    passos: [
      "In the Organization document, write the base text every agent reads before answering, like the house policy. Example: never promise a discount without confirming with a person.",
      "Click Publish version so the text takes effect for all agents. Only administrators can publish.",
      "In the Version history, click a version to read it. Restore as new version brings the text into the editor, and you still need to click Publish version.",
      "Under Learnings, New learning saves a single fact or correction: fill in the Title and What the agent should know, and click Save learning.",
      "Each learning shows where it came from: manual, learned automatically or noted by the agent. Archive takes it off the list, and View archived learnings shows the archived ones so you can Reactivate them.",
    ],
    termos: [
      { termo: "Organization document", significa: "The single base text all agents read before answering, like the house rules for a new employee." },
      { termo: "Learnings", significa: "Single facts and corrections, beyond the document. They can be written by you or learned by the system from real conversations." },
      { termo: "active", significa: "The version of the document that is in effect right now. It shows as v1 active, v2 active and so on." },
    ],
  },
};

export default ajuda;

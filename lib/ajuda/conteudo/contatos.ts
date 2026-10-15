import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão aqui são os que a tela mostra em cada idioma (`Duplicados` / `Importar CSV` /
 * `Novo contato`, `Duplicados` / `Importar CSV` / `Nuevo contacto`, `Duplicates` / `Import CSV` /
 * `New contact`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui estão todas as pessoas que já falaram com a sua empresa ou que você cadastrou. Cada contato guarda o histórico de conversas, os negócios e as anotações dele.",
    passos: [
      "Use a busca para achar alguém pelo nome, e-mail ou telefone.",
      "Filtre por tag (as etiquetas que você põe nos contatos) e por origem, que é por onde a pessoa chegou: WhatsApp, site, planilha ou anúncio.",
      "Clique no nome para abrir a ficha completa. O balão ao lado abre a conversa direto na Inbox.",
      "Novo contato cadastra uma pessoa à mão. Importar CSV traz uma planilha inteira de uma vez.",
      "Duplicados mostra quem foi cadastrado duas vezes, para você juntar os dois numa ficha só.",
    ],
    termos: [
      { termo: "Origem", significa: "Por onde o contato chegou até você: cadastro manual, WhatsApp, site, planilha ou anúncio." },
      { termo: "Última atividade", significa: "Quando houve a última movimentação com esse contato, como uma mensagem." },
      { termo: "Qualquer uma (OU) / Todas (E)", significa: "Com duas tags escolhidas, OU mostra quem tem pelo menos uma delas; E mostra só quem tem as duas." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí están todas las personas que ya hablaron con tu empresa o que tú registraste. Cada contacto guarda su historial de conversaciones, sus negocios y sus notas.",
    passos: [
      "Usa la búsqueda para encontrar a alguien por nombre, correo o teléfono.",
      "Filtra por tag (las etiquetas que pones a los contactos) y por origen, que es por dónde llegó la persona: WhatsApp, sitio, planilla o anuncio.",
      "Haz clic en el nombre para abrir la ficha completa. El globo de al lado abre la conversación directo en la Inbox.",
      "Nuevo contacto registra a una persona a mano. Importar CSV trae una planilla entera de una vez.",
      "Duplicados muestra a quienes se registraron dos veces, para que los unas en una sola ficha.",
    ],
    termos: [
      { termo: "Origen", significa: "Por dónde llegó el contacto hasta ti: registro manual, WhatsApp, sitio, planilla o anuncio." },
      { termo: "Última actividad", significa: "Cuándo hubo el último movimiento con ese contacto, como un mensaje." },
      { termo: "Cualquiera (O) / Todas (Y)", significa: "Con dos tags elegidos, O muestra a quien tiene al menos uno; Y muestra solo a quien tiene los dos." },
    ],
  },
  en: {
    oQueMostra:
      "This is everyone who has talked to your company or whom you added yourself. Each contact keeps their conversation history, deals and notes.",
    passos: [
      "Use search to find someone by name, email or phone.",
      "Filter by tag (the labels you put on contacts) and by source, which is how the person reached you: WhatsApp, website, spreadsheet or ad.",
      "Click the name to open the full record. The bubble next to it opens the conversation straight in the Inbox.",
      "New contact adds a person by hand. Import CSV brings in a whole spreadsheet at once.",
      "Duplicates shows who was added twice, so you can merge the two into a single record.",
    ],
    termos: [
      { termo: "Source", significa: "How the contact reached you: manual entry, WhatsApp, website, spreadsheet or ad." },
      { termo: "Last activity", significa: "When that contact last had any activity, such as a message." },
      { termo: "Any (OR) / All (AND)", significa: "With two tags chosen, OR shows anyone who has at least one of them; AND shows only those who have both." },
    ],
  },
};

export default ajuda;

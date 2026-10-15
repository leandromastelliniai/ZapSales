import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão, aba e campo aqui são os que a tela mostra em cada idioma (`Nova campanha` /
 * `Nueva campaña` / `New campaign`, `Preparar lista` / `Preparar lista` / `Prepare list`, e assim por
 * diante). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui ficam as campanhas: mensagens que o sistema envia a uma lista de contatos que você escolhe, no ritmo do número e nunca em rajada. Cada linha mostra o nome, quantos contatos entram na lista, a situação e a data. Esta tela é para gestores e administradores.",
    passos: [
      "Para criar, use Nova campanha. Dê um nome, escolha o número que vai enviar, defina o público e escreva a mensagem. Isso só cria um rascunho: nada é enviado ainda.",
      "No público, escolha pelo menos um critério (etiquetas, dias sem conversa ou funil) e use Ver quantas pessoas para conferir quantos recebem e por que alguns ficam de fora. Depois, Salvar rascunho.",
      "Tem uma planilha de contatos? Em Subir uma lista de contatos (CSV), use Baixar planilha modelo, preencha nome e telefone (o telefone com DDD, de preferência com + e o código do país, como +5511999998888) e use Enviar lista. Quem estiver na planilha entra em Contatos e passa a ser o público desta campanha; linhas com problema aparecem com o número e o motivo, e ficam de fora.",
      "Abra a campanha e use Preparar lista para ver quem entra. Com a lista pronta, aparecem Enviar teste e Iniciar envio.",
      "Com a campanha enviando, use Pausar, Retomar ou Cancelar campanha. Cancelar é definitivo. Acompanhe os números Na lista, Enviadas, Entregues e Responderam.",
      "No alto da lista, o campo Situação filtra as campanhas. O botão Configuração guarda os padrões de ritmo, os textos salvos e a lista de números que nenhuma campanha deve alcançar.",
    ],
    termos: [
      { termo: "Rascunho", significa: "Campanha criada, mas ainda não enviada. Dá para editar à vontade; nada sai até você preparar a lista e iniciar." },
      { termo: "Base legal", significa: "A razão que permite escrever para aquelas pessoas: Consentimento (elas pediram para receber) ou Interesse legítimo (com uma avaliação registrada). Quem recebe pode perguntar por que recebeu." },
      { termo: "Ritmo", significa: "Quantas mensagens saem por hora e por dia, e em que horários. Em branco vale o ritmo do número; o que você puser na campanha só pode deixar mais devagar." },
      { termo: "Modelo aprovado", significa: "Em número da API Oficial, a mensagem não é texto livre: você escolhe um modelo que a Meta já aprovou e preenche os campos variáveis." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí están las campañas: mensajes que el sistema envía a una lista de contactos que tú eliges, al ritmo del número y nunca en ráfaga. Cada fila muestra el nombre, cuántos contactos entran en la lista, el estado y la fecha. Esta pantalla es para gestores y administradores.",
    passos: [
      "Para crear una, usa Nueva campaña. Ponle un nombre, elige el número que va a enviar, define el público y escribe el mensaje. Esto solo crea un borrador: todavía no se envía nada.",
      "En el público, elige al menos un criterio (etiquetas, días sin conversación o embudo) y usa Ver cuántas personas para comprobar cuántas reciben y por qué algunas quedan fuera. Después, Guardar borrador.",
      "¿Tienes una hoja de contactos? En Subir una lista de contactos (CSV), usa Descargar plantilla, completa nombre y teléfono (el teléfono con código de área, de preferencia con + y el código del país, como +5511999998888) y usa Enviar lista. Quien esté en la hoja entra en Contactos y pasa a ser el público de esta campaña; las filas con problema aparecen con el número y el motivo, y quedan fuera.",
      "Abre la campaña y usa Preparar lista para ver quién entra. Con la lista preparada, aparecen Enviar prueba e Iniciar envío.",
      "Con la campaña enviando, usa Pausar, Reanudar o Cancelar campaña. Cancelar es definitivo. Sigue los números En la lista, Enviadas, Entregadas y Respondieron.",
      "En la parte de arriba de la lista, el campo Estado filtra las campañas. El botón Configuración guarda los valores predeterminados de ritmo, los textos guardados y la lista de números que ninguna campaña debe alcanzar.",
    ],
    termos: [
      { termo: "Borrador", significa: "Campaña creada, pero todavía no enviada. Puedes editarla a gusto; no sale nada hasta que prepares la lista y inicies." },
      { termo: "Base legal", significa: "La razón que te permite escribir a esas personas: Consentimiento (pidieron recibir) o Interés legítimo (con una evaluación registrada). Quien recibe puede preguntar por qué recibió." },
      { termo: "Ritmo", significa: "Cuántos mensajes salen por hora y por día, y en qué horarios. En blanco rige el ritmo del número; lo que pongas en la campaña solo puede hacerlo más lento." },
      { termo: "Plantilla aprobada", significa: "En un número de la API Oficial, el mensaje no es texto libre: eliges una plantilla que Meta ya aprobó y completas los campos variables." },
    ],
  },
  en: {
    oQueMostra:
      "This is where your campaigns live: messages the system sends to a list of contacts you choose, at the number's pace and never in a burst. Each row shows the name, how many contacts are on the list, the status and the date. This screen is for managers and administrators.",
    passos: [
      "To create one, use New campaign. Give it a name, pick the number that will send, define the audience and write the message. This only creates a draft: nothing is sent yet.",
      "In the audience, choose at least one criterion (tags, days without a conversation or pipeline) and use See how many people to check how many will receive it and why some are left out. Then Save draft.",
      "Have a spreadsheet of contacts? Under Upload a contact list (CSV), use Download template spreadsheet, fill in name and phone (the phone with area code, preferably with + and the country code, like +5511999998888) and use Send list. Everyone in the spreadsheet is added to Contacts and becomes this campaign's audience; rows with problems show up with the row number and the reason, and are left out.",
      "Open the campaign and use Prepare list to see who is in. Once the list is ready, Send test and Start sending appear.",
      "While the campaign is sending, use Pause, Resume or Cancel campaign. Canceling is final. Follow the numbers On the list, Sent, Delivered and Replied.",
      "At the top of the list, the Status field filters the campaigns. The Configuration button holds the default pace, the saved texts and the list of numbers no campaign should reach.",
    ],
    termos: [
      { termo: "Draft", significa: "A campaign that was created but not sent yet. You can edit it freely; nothing goes out until you prepare the list and start." },
      { termo: "Legal basis", significa: "The reason that allows you to write to those people: Consent (they asked to receive) or Legitimate interest (with a recorded assessment). Recipients can ask why they received it." },
      { termo: "Pace", significa: "How many messages go out per hour and per day, and at what times. Left blank, the number's own pace applies; whatever you set on the campaign can only make it slower." },
      { termo: "Approved template", significa: "On an Official API number, the message is not free text: you pick a template Meta has already approved and fill in the variable fields." },
    ],
  },
};

export default ajuda;

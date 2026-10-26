import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de seção, opção e botão aqui são os que a tela mostra em cada idioma
 * (`Quem recebe o cliente novo` / `Quién recibe al cliente nuevo` / `Who receives the new client`, `Salvar responsáveis` / `Guardar responsables` / `Save owners`).
 * Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui você decide quem recebe cada cliente novo e o que cada atendente enxerga. As duas decisões andam juntas. Gestores e administradores abrem esta tela. No topo, Quem recebe agora mostra quantas pessoas podem receber um cliente novo neste momento e quem é o próximo da vez. O selo Recomendado e o motivo escrito mudam com o tamanho da equipe e são só uma sugestão. As decisões e os ajustes usam um botão Salvar só; cada número tem o seu Salvar responsáveis.",
    passos: [
      "Em Quem recebe o cliente novo, escolha entre Cada um pega o que quiser, Rodízio automático entre os atendentes e Vai para quem tem menos conversas na mão. Nos dois modos automáticos aparecem Tentativas antes de desistir e Espera entre tentativas (segundos).",
      "Em O que cada atendente enxerga, escolha Todos veem tudo, Os seus, mais os que ainda não têm dono ou Só os seus. Isso restringe só quem tem o papel Atendente; gerente e administrador continuam vendo tudo.",
      "Em Mais ajustes (fechado por padrão), decida se a IA volta sozinha à conversa depois de um tempo sem resposta da equipe, quanto a IA fica em silêncio depois de uma resposta pelo celular e se A conversa fica com quem atendeu. Depois clique em Salvar.",
      "Em Responsáveis por número, escolha quais pessoas recebem cada número conectado e use Salvar responsáveis. Voltar ao padrão da organização desfaz a escolha daquele número.",
      "Também em Mais ajustes, em Quem fala aparece na mensagem?, escolha se as mensagens dos atendentes e da IA levam o nome de quem fala, defina o Nome da IA e clique em Salvar.",
    ],
    termos: [
      { termo: "Rodízio", significa: "Cada cliente novo vai para a próxima pessoa da lista, entre as que estão disponíveis e dentro do horário, e depois a lista recomeça." },
      { termo: "Carteira", significa: "As conversas e os negócios que pertencem a um atendente." },
      { termo: "Devolver ao agente", significa: "Quando uma pessoa assume a conversa, a IA para de responder nela. Devolver faz a IA voltar a atender." },
      { termo: "Assinatura", significa: "O nome de quem fala, em negrito na linha de cima da mensagem que vai ao cliente. Campanhas, lembretes e integrações por token não assinam." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí decides quién recibe a cada cliente nuevo y qué ve cada asesor. Las dos decisiones van juntas. Gestores y administradores abren esta pantalla. Arriba, Quién recibe ahora muestra cuántas personas pueden recibir un cliente nuevo en este momento y quién es el próximo en turno. El sello Recomendado y el motivo escrito cambian con el tamaño del equipo y son solo una sugerencia. Las decisiones y los ajustes usan un solo botón Guardar; cada número tiene su Guardar responsables.",
    passos: [
      "En Quién recibe al cliente nuevo, elige entre Cada uno toma el que quiera, Rotación automática entre los asesores y Va a quien tiene menos conversaciones. En los dos modos automáticos aparecen Intentos antes de desistir y Espera entre intentos (segundos).",
      "En Qué ve cada asesor, elige Todos ven todo, Los tuyos, más los que todavía no tienen dueño o Solo los tuyos. Esto restringe solo a quien tiene el rol Asesor; el gerente y el administrador siguen viendo todo.",
      "En Más ajustes (cerrado por defecto), decide si la IA retoma sola la conversación tras un tiempo sin respuesta del equipo, cuánto tiempo guarda silencio la IA después de una respuesta desde el celular y si La conversación se queda con quien la atendió. Luego haz clic en Guardar.",
      "En Responsables por número, elige qué personas reciben cada número conectado y usa Guardar responsables. Volver al valor predeterminado de la organización deshace la elección de ese número.",
      "También en Más ajustes, en ¿Quién habla aparece en el mensaje?, elige si los mensajes de los asesores y de la IA llevan el nombre de quien habla, define el Nombre de la IA y haz clic en Guardar.",
    ],
    termos: [
      { termo: "Rotación", significa: "Cada cliente nuevo va a la siguiente persona de la lista, entre las disponibles y dentro del horario, y luego la lista vuelve a empezar." },
      { termo: "Cartera", significa: "Las conversaciones y los negocios que pertenecen a un asesor." },
      { termo: "Devolver al agente", significa: "Cuando una persona toma la conversación, la IA deja de responder en ella. Devolver hace que la IA vuelva a atender." },
      { termo: "Firma", significa: "El nombre de quien habla, en negrita en la línea de arriba del mensaje que va al cliente. Las campañas, los recordatorios y las integraciones por token no firman." },
    ],
  },
  en: {
    oQueMostra:
      "This is where you decide who receives each new client and what each agent sees. The two decisions go together. Managers and administrators can open this screen. At the top, Who receives now shows how many people can receive a new client right now and who is next in line. The Recommended badge and the written reason change with the team size and are only a suggestion. The decisions and the settings use a single Save button; each number has its own Save owners.",
    passos: [
      "Under Who receives the new client, choose between Everyone picks what they want, Automatic rotation among agents and Goes to whoever has the fewest conversations on hand. In the two automatic modes, Attempts before giving up and Wait between attempts (seconds) appear.",
      "Under What each agent sees, choose Everyone sees everything, Their own, plus the ones that don't have an owner yet or Only their own. This restricts only people with the Agent role; managers and administrators still see everything.",
      "Under More settings (closed by default), decide whether the AI takes the conversation back by itself after a period without a reply from the team, how long the AI stays silent after a reply from the phone, and whether The conversation stays with whoever handled it. Then click Save.",
      "Under Owners by number, choose which people receive each connected number and use Save owners. Revert to the organization's default undoes the choice for that number.",
      "Also under More settings, in Show who is speaking in the message?, choose whether agents' and the AI's messages carry the speaker's name, set the AI name and click Save.",
    ],
    termos: [
      { termo: "Rotation", significa: "Each new client goes to the next person on the list, among those available and within working hours, and then the list starts over." },
      { termo: "Portfolio", significa: "The conversations and deals that belong to an agent." },
      { termo: "Hand back to the agent", significa: "When a person takes over a conversation, the AI stops replying in it. Handing back makes the AI serve again." },
      { termo: "Signature", significa: "The speaker's name, in bold on the line above the message that goes to the client. Campaigns, reminders and token integrations do not sign." },
    ],
  },
};

export default ajuda;

import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de campo aqui são os que a tela mostra em cada idioma. No espanhol a tela chama
 * "abordagem" de `contacto` (`Iniciar contactos con IA`) e no inglês de `outreach` (`Start AI outreach`).
 * Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui você busca empresas por segmento e cidade e deixa a IA fazer a primeira mensagem, aos poucos, acompanhando quem avança na conversa. Esta tela é só para administradores.",
    passos: [
      "Na primeira vez, informe a Chave da Apify, o serviço de fora que faz a busca, e use Salvar chave. Para trocá-la depois, use Configurar busca.",
      "Em 1. Encontrar empresas, preencha Público ou segmento e Cidade ou região, defina Até quantas empresas e o Teto da busca (US$) e use Buscar empresas. A busca gasta o seu saldo da Apify e ainda não manda mensagem para ninguém.",
      "Em Suas campanhas, clique numa busca para abri-la. Quando ela terminar e achar empresas, aparece 2. Preparar a abordagem: escolha o agente de IA (ou crie um com Configurar por conversa), a conexão de saída, o funil, o Máximo em 24 horas e o Intervalo mínimo (minutos). Depois, use Iniciar abordagens com IA.",
      "Em 3. Acompanhar resultados, a tabela mostra cada Empresa, as Informações achadas, o Progresso e a Conversa. Use Marcar todas e Desmarcar todas para escolher quem entra na fila, e Abrir no Inbox para ver a conversa de quem respondeu.",
      "Com a campanha em andamento, Pausar abordagens interrompe as mensagens novas. Pausada, dá para usar Editar ritmo e Retomar fila.",
    ],
    termos: [
      { termo: "Abordagem", significa: "A primeira mensagem que a IA manda para uma empresa encontrada, para abrir a conversa." },
      { termo: "Teto da busca (US$)", significa: "O máximo em dólares que uma busca pode gastar do seu saldo na Apify. Cada busca tem o seu limite." },
      { termo: "Qualificado", significa: "A empresa que confirmou o que você definiu como interesse real na conversa. Encontrado não é qualificado: isso depende do que for dito." },
      { termo: "Avaliação de legítimo interesse", significa: "O registro de por que você pode escrever para essas empresas sem que elas tenham pedido. Você informa a referência dele antes de iniciar; ela não conta como consentimento." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí buscas empresas por segmento y ciudad y dejas que la IA haga el primer mensaje, poco a poco, siguiendo quién avanza en la conversación. Esta pantalla es solo para administradores.",
    passos: [
      "La primera vez, informa la Clave de Apify, el servicio externo que hace la búsqueda, y usa Guardar clave. Para cambiarla después, usa Configurar búsqueda.",
      "En 1. Encontrar empresas, completa Público o segmento y Ciudad o región, define Máximo de empresas y el Límite de la búsqueda (US$) y usa Buscar empresas. La búsqueda gasta tu saldo de Apify y todavía no le manda mensaje a nadie.",
      "En Tus campañas, haz clic en una búsqueda para abrirla. Cuando termine y encuentre empresas, aparece 2. Preparar el contacto: elige el agente de IA (o crea uno con Configurar conversando), la conexión de salida, el embudo, el Máximo en 24 horas y el Intervalo mínimo (minutos). Después, usa Iniciar contactos con IA.",
      "En 3. Seguimiento de resultados, la tabla muestra cada Empresa, la Información encontrada, el Progreso y la Conversación. Usa Marcar todas y Desmarcar todas para elegir quién entra en la cola, y Abrir en Inbox para ver la conversación de quien respondió.",
      "Con la campaña en curso, Pausar contactos detiene los mensajes nuevos. Ya pausada, puedes usar Editar ritmo y Reanudar cola.",
    ],
    termos: [
      { termo: "Contacto inicial", significa: "El primer mensaje que la IA le manda a una empresa encontrada, para abrir la conversación. La pantalla lo llama simplemente contacto." },
      { termo: "Límite de la búsqueda (US$)", significa: "El máximo en dólares que una búsqueda puede gastar de tu saldo en Apify. Cada búsqueda tiene su propio límite." },
      { termo: "Calificado", significa: "La empresa que confirmó, en la conversación, lo que definiste como interés real. Encontrado no es calificado: eso depende de lo que se diga." },
      { termo: "Evaluación de interés legítimo", significa: "El registro de por qué puedes escribirle a esas empresas sin que lo hayan pedido. Informas su referencia antes de iniciar; no cuenta como consentimiento." },
    ],
  },
  en: {
    oQueMostra:
      "Here you search for companies by segment and city and let the AI send the first message, little by little, while you follow who moves forward in the conversation. This screen is for administrators only.",
    passos: [
      "The first time, enter the Apify key, the outside service that runs the search, and use Save key. To change it later, use Configure search.",
      "Under 1. Find businesses, fill in Audience or segment and City or region, set Up to how many businesses and the Search cap (US$) and use Search businesses. The search spends your Apify balance and does not message anyone yet.",
      "Under Your campaigns, click a search to open it. When it finishes and finds companies, 2. Prepare the outreach appears: choose the AI agent (or create one with Configure via conversation), the outbound connection, the pipeline, the Maximum in 24 hours and the Minimum interval (minutes). Then use Start AI outreach.",
      "Under 3. Track results, the table shows each Business, the Information found, the Progress and the Conversation. Use Check all and Uncheck all to choose who goes into the queue, and Open in Inbox to see the conversation of anyone who replied.",
      "While the campaign is running, Pause outreach stops new messages. Once paused, you can use Edit pace and Resume queue.",
    ],
    termos: [
      { termo: "Outreach", significa: "The first message the AI sends to a company it found, to open the conversation." },
      { termo: "Search cap (US$)", significa: "The most, in dollars, that one search can spend from your Apify balance. Each search has its own limit." },
      { termo: "Qualified", significa: "A company that confirmed, in the conversation, what you defined as real interest. Found is not qualified: that depends on what is said." },
      { termo: "Legitimate interest assessment", significa: "The record of why you may write to these companies without them having asked. You enter its reference before starting; it does not count as consent." },
    ],
  },
};

export default ajuda;

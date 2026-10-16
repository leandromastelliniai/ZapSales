import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão, campo e seção aqui são os que a tela mostra em cada idioma
 * (`Etapas deste funil` / `Etapas de este embudo` / `Stages of this pipeline`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui você ajusta as colunas do quadro de cada funil e diz ao agente de IA para qual coluna levar o cliente a cada passo do atendimento. Só gestores e administradores abrem esta tela.",
    passos: [
      "Em Etapas deste funil, clique no nome de uma coluna para renomear, use as setas para mudar a ordem e escolha em O que acontece nesta coluna qual é a de fechamento e qual é a de perda.",
      "Para criar uma coluna nova, escreva o nome em Acrescentar etapa ao fim e use Criar.",
      "Arquivar tira a coluna do quadro sem apagar o histórico. Se houver negócios nela, a tela pede para onde eles vão. Não dá para trazer a coluna de volta por aqui.",
      "Em Para onde o card vai em cada passo, escolha a etapa de cada momento do atendimento (como Primeiro contato ou Em negociação). Não mover o card é uma escolha válida. Depois use Salvar estas escolhas.",
      "Só administradores veem a seção Vocabulário e campos, para trocar os nomes das palavras do funil, os motivos de ganho e perda e os campos extras do cliente.",
    ],
    termos: [
      { termo: "Etapa", significa: "Cada coluna do quadro do funil, na ordem em que o cliente avança." },
      { termo: "Chance de fechamento (0 a 100)", significa: "Quanto você acha que um cliente nessa coluna tem de fechar, de 0 a 100. A tela usa isso na previsão de vendas; deixar vazio é permitido." },
      { termo: "Janela de esfriando", significa: "O tempo que um negócio pode ficar parado nesta etapa antes de ser tratado como esfriando. Vazio vale 24 horas." },
      { termo: "Vocabulário", significa: "Os nomes que o funil usa para lead, negócio, ganho e perdido. Um comércio, por exemplo, pode chamar de Cliente, Pedido, Pago e Cancelado." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí ajustas las columnas del tablero de cada embudo y le dices al agente de IA a qué columna llevar al cliente en cada paso de la atención. Solo gestores y administradores abren esta pantalla.",
    passos: [
      "En Etapas de este embudo, haz clic en el nombre de una columna para renombrar, usa las flechas para cambiar el orden y elige en Qué pasa en esta columna cuál es la de cierre y cuál es la de pérdida.",
      "Para crear una columna nueva, escribe el nombre en Agregar etapa al final y usa Crear.",
      "Archivar saca la columna del tablero sin borrar el historial. Si hay negocios en ella, la pantalla pregunta a dónde van. No se puede traer la columna de vuelta desde aquí.",
      "En Adónde va la tarjeta en cada paso, elige la etapa de cada momento de la atención (como Primer contacto o En negociación). No mover la tarjeta es una opción válida. Luego usa Guardar selección.",
      "Solo los administradores ven la sección Vocabulario y campos, para cambiar los nombres de las palabras del embudo, los motivos de ganancia y pérdida y los campos extra del cliente.",
    ],
    termos: [
      { termo: "Etapa", significa: "Cada columna del tablero del embudo, en el orden en que avanza el cliente." },
      { termo: "Probabilidad de cierre (0 a 100)", significa: "Cuánta probabilidad crees que tiene de cerrar un cliente en esa columna, de 0 a 100. La pantalla lo usa en la previsión de ventas; dejarlo vacío es válido." },
      { termo: "Ventana de enfriamiento", significa: "El tiempo que un negocio puede quedarse quieto en esta etapa antes de tratarse como enfriándose. Vacío equivale a 24 horas." },
      { termo: "Vocabulario", significa: "Los nombres que el embudo usa para lead, negocio, ganado y perdido. Un comercio, por ejemplo, puede llamarlos Cliente, Pedido, Pagado y Cancelado." },
    ],
  },
  en: {
    oQueMostra:
      "This is where you adjust the board columns of each pipeline and tell the AI agent which column to move the customer to at each step of the service. Only managers and administrators can open this screen.",
    passos: [
      "Under Stages of this pipeline, click a column's name to rename it, use the arrows to change the order, and pick under What happens in this column which one is for closing and which is for losing.",
      "To create a new column, type the name under Add stage to the end and use Create.",
      "Archive takes the column off the board without deleting the history. If it holds deals, the screen asks where they should go. You cannot bring the column back from here.",
      "Under Where the card goes at each step, choose the stage for each moment of the service (such as First contact or In negotiation). Don't move the card is a valid choice. Then use Save these choices.",
      "Only administrators see the Vocabulary and fields section, to change the pipeline's wording, the win and loss reasons and the extra customer fields.",
    ],
    termos: [
      { termo: "Stage", significa: "Each column on the pipeline board, in the order the customer moves through." },
      { termo: "Chance of closing (0 to 100)", significa: "How likely you think a customer in that column is to close, from 0 to 100. The screen uses it in the sales forecast; leaving it empty is allowed." },
      { termo: "Going-cold window", significa: "How long a deal can sit still in this stage before it is treated as going cold. Empty means 24 hours." },
      { termo: "Vocabulary", significa: "The words the pipeline uses for lead, deal, won and lost. A shop, for example, can call them Customer, Order, Paid and Cancelled." },
    ],
  },
};

export default ajuda;

import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de selo aqui são os que a tela mostra em cada idioma (`Novo funil` / `Nuevo embudo` /
 * `New pipeline`): quem lê a ajuda procura o mesmo nome na tela. Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui ficam os funis da sua empresa. Um funil é o caminho que um cliente percorre, da primeira conversa até fechar negócio, e cada funil tem o seu quadro de clientes.",
    passos: [
      "Clique no nome de um funil para abrir o quadro, com um cartão para cada cliente em cada etapa.",
      "Para ter outro caminho (um para vendas e outro para pós-venda, por exemplo), use Novo funil.",
      "Para trazer uma lista de clientes que você já tem, use Importar planilha.",
      "Renomear e Arquivar ficam em cada linha. Arquivar tira o funil da lista de trabalho sem apagar nada.",
    ],
    termos: [
      { termo: "Etapa", significa: "Cada degrau do funil, como Conversa ou Proposta enviada." },
      { termo: "Padrão", significa: "O funil por onde entra todo contato novo, enquanto nenhuma outra regra mandar para outro." },
      { termo: "Clientes", significa: "O funil que guarda quem já é cliente, separado de quem ainda está sendo atendido para comprar." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí están los embudos de tu empresa. Un embudo es el camino que recorre un cliente, desde la primera conversación hasta cerrar el negocio, y cada embudo tiene su propio tablero de clientes.",
    passos: [
      "Haz clic en el nombre de un embudo para abrir el tablero, con una tarjeta por cada cliente en cada etapa.",
      "Para tener otro camino (uno para ventas y otro para posventa, por ejemplo), usa Nuevo embudo.",
      "Para traer una lista de clientes que ya tienes, usa Importar hoja de cálculo.",
      "Renombrar y Archivar están en cada fila. Archivar saca el embudo de la lista de trabajo sin borrar nada.",
    ],
    termos: [
      { termo: "Etapa", significa: "Cada peldaño del embudo, como Conversación o Propuesta enviada." },
      { termo: "Predeterminado", significa: "El embudo por el que entra todo contacto nuevo, mientras ninguna otra regla lo envíe a otro." },
      { termo: "Clientes", significa: "El embudo que guarda a quienes ya son clientes, separado de quienes todavía están siendo atendidos para comprar." },
    ],
  },
  en: {
    oQueMostra:
      "This is where your company's pipelines live. A pipeline is the path a customer follows, from the first conversation to closing the deal, and each pipeline has its own customer board.",
    passos: [
      "Click a pipeline's name to open its board, with one card per customer in each stage.",
      "To have another path (one for sales and one for after-sales, for example), use New pipeline.",
      "To bring in a list of customers you already have, use Import spreadsheet.",
      "Rename and Archive are on each row. Archiving takes the pipeline out of the working list without deleting anything.",
    ],
    termos: [
      { termo: "Stage", significa: "Each step of the pipeline, such as Conversation or Proposal sent." },
      { termo: "Default", significa: "The pipeline every new contact enters through, as long as no other rule sends them elsewhere." },
      { termo: "Clients", significa: "The pipeline that holds people who are already customers, kept apart from those still being served to buy." },
    ],
  },
};

export default ajuda;

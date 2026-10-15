import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão são os da tela em cada idioma (`Novo produto` / `Nuevo producto` / `New product`;
 * `Importar planilha` / `Importar hoja de cálculo` / `Import spreadsheet`). Mudou o rótulo, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "O catálogo da sua loja. É daqui que o atendente de IA tira o preço e os detalhes quando um cliente pergunta. Enquanto o catálogo estiver vazio, o atendente responde que não encontrou o produto, mesmo que a loja o tenha.",
    passos: [
      "Use Novo produto para cadastrar um item: nome, preço, código e até cinco fotos.",
      "Se você já tem uma lista, use Importar planilha. Baixar planilha modelo mostra as colunas que o sistema entende.",
      "A busca acha pelo nome, pelo código ou pela marca.",
      "Um produto desativado deixa de ser oferecido pelo atendente, mas continua guardado e pode ser reativado.",
    ],
    termos: [
      { termo: "Planilha modelo", significa: "Um arquivo CSV de exemplo com as colunas certas. Preencha e importe de volta." },
      { termo: "Desativado", significa: "O produto continua cadastrado, mas o atendente de IA não o oferece mais." },
    ],
  },
  es: {
    oQueMostra:
      "El catálogo de tu tienda. De aquí el agente de IA saca el precio y los detalles cuando un cliente pregunta. Mientras el catálogo esté vacío, el agente responde que no encontró el producto, aunque la tienda lo tenga.",
    passos: [
      "Usa Nuevo producto para registrar un artículo: nombre, precio, código y hasta cinco fotos.",
      "Si ya tienes una lista, usa Importar hoja de cálculo. Descargar plantilla muestra las columnas que el sistema entiende.",
      "La búsqueda encuentra por nombre, por código o por marca.",
      "Un producto desactivado deja de ser ofrecido por el agente, pero sigue guardado y se puede reactivar.",
    ],
    termos: [
      { termo: "Plantilla", significa: "Un archivo CSV de ejemplo con las columnas correctas. Llénalo e impórtalo de vuelta." },
      { termo: "Desactivado", significa: "El producto sigue registrado, pero el agente de IA ya no lo ofrece." },
    ],
  },
  en: {
    oQueMostra:
      "Your store's catalog. This is where the AI agent gets the price and details when a customer asks. While the catalog is empty, the agent answers that it couldn't find the product, even if the store has it.",
    passos: [
      "Use New product to add an item: name, price, code and up to five photos.",
      "If you already have a list, use Import spreadsheet. Download template spreadsheet shows the columns the system understands.",
      "Search finds by name, code or brand.",
      "A disabled product is no longer offered by the agent, but stays saved and can be turned back on.",
    ],
    termos: [
      { termo: "Template spreadsheet", significa: "An example CSV file with the right columns. Fill it in and import it back." },
      { termo: "Disabled", significa: "The product stays registered, but the AI agent no longer offers it." },
    ],
  },
};

export default ajuda;

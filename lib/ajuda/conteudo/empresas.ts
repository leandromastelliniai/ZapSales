import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de coluna aqui são os que a tela mostra em cada idioma (`Nova empresa` /
 * `Nueva empresa` / `New company`, `Enriquecer CNPJ` / `Completar por CNPJ` / `Enrich by CNPJ`).
 * Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui ficam as empresas que você atende, com razão social, CNPJ e cidade. Quando você informa o CNPJ, o sistema tenta completar os dados cadastrais da empresa sozinho.",
    passos: [
      "Use a busca para achar uma empresa pelo nome ou pelo CNPJ.",
      "Para cadastrar uma, use Nova empresa e preencha Razão social, Nome fantasia ou CNPJ (pelo menos um deles). Depois, Criar.",
      "A coluna Situação mostra a situação cadastral da empresa ou o andamento do preenchimento automático.",
      "Clique no nome para abrir a ficha: dados cadastrais, as pessoas (decisores) ligadas à empresa e os telefones dessas pessoas.",
      "Na ficha, Enriquecer CNPJ busca os dados da empresa de novo, se algo ficou faltando.",
    ],
    termos: [
      { termo: "Razão social", significa: "O nome oficial da empresa, o que consta no registro dela." },
      { termo: "Nome fantasia", significa: "O nome pelo qual a empresa é conhecida no dia a dia. É o que aparece primeiro na lista." },
      { termo: "CNPJ", significa: "O número de registro da empresa na Receita Federal. Não pode haver duas empresas com o mesmo CNPJ." },
      { termo: "Enriquecer CNPJ", significa: "Preencher os dados da empresa automaticamente a partir do CNPJ, sem você digitar." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí están las empresas que atiendes, con razón social, CNPJ y ciudad. Cuando informas el CNPJ, el sistema intenta completar solo los datos de registro de la empresa.",
    passos: [
      "Usa la búsqueda para encontrar una empresa por nombre o por CNPJ.",
      "Para registrar una, usa Nueva empresa y completa Razón social, Nombre fantasía o CNPJ (al menos uno de ellos). Después, Crear.",
      "La columna Estado muestra la situación de registro de la empresa o el avance del completado automático.",
      "Haz clic en el nombre para abrir la ficha: datos de registro, las personas (decisores) vinculadas a la empresa y los teléfonos de esas personas.",
      "En la ficha, Completar por CNPJ busca los datos de la empresa otra vez, si faltó algo.",
    ],
    termos: [
      { termo: "Razón social", significa: "El nombre oficial de la empresa, el que consta en su registro." },
      { termo: "Nombre fantasía", significa: "El nombre por el que la empresa se conoce en el día a día. Es lo que aparece primero en la lista." },
      { termo: "CNPJ", significa: "El número de registro de la empresa en la Receita Federal de Brasil. No puede haber dos empresas con el mismo CNPJ." },
      { termo: "Completar por CNPJ", significa: "Llenar los datos de la empresa automáticamente a partir del CNPJ, sin que lo escribas." },
    ],
  },
  en: {
    oQueMostra:
      "This is where the companies you work with live, with legal name, CNPJ and city. When you enter the CNPJ, the system tries to fill in the company's registration details on its own.",
    passos: [
      "Use search to find a company by name or by CNPJ.",
      "To add one, use New company and fill in Legal name, Trade name or CNPJ (at least one of them). Then Create.",
      "The Status column shows the company's registration status or the progress of the automatic fill-in.",
      "Click the name to open the record: registration details, the people (decision-makers) linked to the company and those people's phone numbers.",
      "On the record, Enrich by CNPJ looks up the company's data again, if something was missing.",
    ],
    termos: [
      { termo: "Legal name", significa: "The company's official name, as it appears in its registration." },
      { termo: "Trade name", significa: "The name the company is known by day to day. It is what shows first in the list." },
      { termo: "CNPJ", significa: "The company's registration number with Brazil's federal tax authority. Two companies cannot share the same CNPJ." },
      { termo: "Enrich by CNPJ", significa: "Fill in the company's data automatically from the CNPJ, without you typing it." },
    ],
  },
};

export default ajuda;

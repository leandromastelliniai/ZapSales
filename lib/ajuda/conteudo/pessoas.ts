import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de campo aqui são os que a tela mostra em cada idioma (`Nova pessoa` /
 * `Nueva persona` / `New person`, `Nome completo` / `Nombre completo` / `Full name`).
 * Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui ficam as pessoas que você conhece dentro das empresas, principalmente quem decide a compra. A pessoa guarda o nome, o e-mail e a empresa onde trabalha; o telefone e as conversas ficam em Contatos.",
    passos: [
      "Use a busca para achar alguém pelo nome ou pelo e-mail.",
      "Para cadastrar, use Nova pessoa e preencha o Nome completo (o e-mail é opcional). Depois, Criar.",
      "Clique no nome para abrir a ficha: as empresas onde a pessoa trabalha, com o cargo, e os telefones ligados a ela. Cada telefone leva ao contato correspondente.",
      "Pessoas também nascem quando você traz uma planilha em Importações.",
    ],
    termos: [
      { termo: "Decisor", significa: "A pessoa que decide ou influencia a compra dentro da empresa." },
      { termo: "Vínculo", significa: "A ligação entre uma pessoa e uma empresa, junto com o cargo dela. Uma pessoa sem vínculo aparece como sem empresa." },
      { termo: "Contato", significa: "O telefone com quem você conversa no WhatsApp. A pessoa diz quem é; o contato é por onde você fala com ela." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí están las personas que conoces dentro de las empresas, sobre todo quienes deciden la compra. La persona guarda el nombre, el correo y la empresa donde trabaja; el teléfono y las conversaciones están en Contactos.",
    passos: [
      "Usa la búsqueda para encontrar a alguien por nombre o por correo.",
      "Para registrar a una persona, usa Nueva persona y completa el Nombre completo (el correo es opcional). Después, Crear.",
      "Haz clic en el nombre para abrir la ficha: las empresas donde la persona trabaja, con su cargo, y los teléfonos vinculados a ella. Cada teléfono lleva al contacto correspondiente.",
      "Las personas también nacen cuando traes una planilla en Importaciones.",
    ],
    termos: [
      { termo: "Decisor", significa: "La persona que decide o influye en la compra dentro de la empresa." },
      { termo: "Vínculo", significa: "La relación entre una persona y una empresa, junto con su cargo. Una persona sin vínculo aparece sin empresa." },
      { termo: "Contacto", significa: "El teléfono con el que conversas por WhatsApp. La persona dice quién es; el contacto es por donde hablas con ella." },
    ],
  },
  en: {
    oQueMostra:
      "This is where the people you know inside companies live, mainly the ones who decide the purchase. A person holds a name, an email and the company they work for; the phone number and the conversations live in Contacts.",
    passos: [
      "Use search to find someone by name or email.",
      "To add one, use New person and fill in the Full name (the email is optional). Then Create.",
      "Click the name to open the record: the companies the person works for, with their job title, and the phone numbers linked to them. Each phone number leads to the matching contact.",
      "People are also created when you bring in a spreadsheet in Imports.",
    ],
    termos: [
      { termo: "Decision-maker", significa: "The person who decides or influences the purchase inside the company." },
      { termo: "Link", significa: "The tie between a person and a company, along with their job title. A person with no link shows up as having no company." },
      { termo: "Contact", significa: "The phone number you chat with on WhatsApp. The person says who they are; the contact is how you reach them." },
    ],
  },
};

export default ajuda;

import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de campo e de botão aqui são os que a tela mostra em cada idioma
 * (`Razão social` / `Razón social` / `Legal name`, `Zona de perigo` / `Zona de peligro` / `Danger zone`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui ficam os dados da sua empresa, as regras de idioma, moeda e guarda de arquivos, o menu lateral e a opção de apagar os dados de atendimento. Só administradores abrem esta tela.",
    passos: [
      "Confira Nome de exibição, Razão social, CNPJ e DPO email, e corrija o que estiver diferente.",
      "Escolha Fuso horário, Idioma, Moeda e País. A Moeda vale para todo preço do catálogo, mas produto já cadastrado guarda a moeda com que nasceu.",
      "Defina a Retenção de mídia (dias) e a URL política de privacidade, e clique em Salvar para gravar o formulário.",
      "Em Menu lateral, escolha as áreas que a empresa mostra e clique em Aplicar interface. As permissões de cada papel não mudam.",
      "A Zona de perigo apaga de vez mensagens, conversas, negócios, contatos, agendamentos e pedidos. Para confirmar, a tela pede que você digite o nome da organização, e não dá para desfazer.",
    ],
    termos: [
      { termo: "Razão social", significa: "O nome oficial da empresa, como está no registro dela." },
      { termo: "DPO", significa: "A pessoa responsável pelos dados pessoais dos clientes na empresa. É para o e-mail dela que vão os pedidos sobre esses dados." },
      { termo: "Retenção de mídia", significa: "Por quantos dias o sistema guarda os arquivos das mensagens. Os mais antigos que isso são retirados do armazenamento." },
      { termo: "Zona de perigo", significa: "A parte da tela com a ação que não tem volta. Mantém a equipe, as configurações, os funis, os agentes de IA e os canais de WhatsApp conectados." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí están los datos de tu empresa, las reglas de idioma, moneda y conservación de archivos, el menú lateral y la opción de borrar los datos de atención. Solo los administradores abren esta pantalla.",
    passos: [
      "Revisa Nombre para mostrar, Razón social, CNPJ y Email del DPO, y corrige lo que esté distinto.",
      "Elige Zona horaria, Idioma, Moneda y País. La Moneda vale para todo precio del catálogo, pero un producto ya registrado conserva la moneda con la que nació.",
      "Define la Retención de archivos multimedia (días) y la URL de la política de privacidad, y haz clic en Guardar para grabar el formulario.",
      "En Menú lateral, elige las áreas que la empresa muestra y haz clic en Aplicar interfaz. Los permisos de cada rol no cambian.",
      "La Zona de peligro borra definitivamente mensajes, conversaciones, negocios, contactos, citas y pedidos. Para confirmar, la pantalla te pide escribir el nombre de la organización, y no se puede deshacer.",
    ],
    termos: [
      { termo: "Razón social", significa: "El nombre oficial de la empresa, como figura en su registro." },
      { termo: "DPO", significa: "La persona responsable de los datos personales de los clientes en la empresa. A su correo llegan las solicitudes sobre esos datos." },
      { termo: "Retención de archivos multimedia", significa: "Por cuántos días el sistema guarda los archivos de los mensajes. Los más antiguos se retiran del almacenamiento." },
      { termo: "Zona de peligro", significa: "La parte de la pantalla con la acción que no tiene vuelta atrás. Se mantienen el equipo, las configuraciones, los embudos, los agentes de IA y los canales de WhatsApp conectados." },
    ],
  },
  en: {
    oQueMostra:
      "This is where your company's details, the rules for language, currency and file keeping, the sidebar menu and the option to delete service data live. Only administrators can open this screen.",
    passos: [
      "Check Display name, Legal name, CNPJ and DPO email, and fix anything that is different.",
      "Choose Time zone, Language, Currency and Country. Currency applies to every catalog price, but a product already registered keeps the currency it was created with.",
      "Set the Media retention (days) and the Privacy policy URL, and click Save to store the form.",
      "Under Sidebar menu, choose the areas the company shows and click Apply interface. Each role's permissions do not change.",
      "The Danger zone permanently deletes messages, conversations, deals, contacts, appointments and orders. To confirm, the screen asks you to type the organization's name, and it cannot be undone.",
    ],
    termos: [
      { termo: "Legal name", significa: "The company's official name, as it appears in its registration." },
      { termo: "DPO", significa: "The person responsible for customers' personal data in the company. Requests about that data go to their email." },
      { termo: "Media retention", significa: "For how many days the system keeps message files. Anything older is removed from storage." },
      { termo: "Danger zone", significa: "The part of the screen with the action that cannot be reversed. The team, settings, pipelines, AI agents and connected WhatsApp channels stay." },
    ],
  },
};

export default ajuda;

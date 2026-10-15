import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de coluna aqui são os que a tela mostra em cada idioma (`Nova proposta` /
 * `Nueva propuesta` / `New proposal`, `Enviar ao cliente` / `Enviar al cliente` / `Send to client`).
 * Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui ficam as propostas comerciais: o documento com itens, valores e condições que você manda a um cliente. Cada linha mostra o número, o título, a situação e o valor. As que a IA preparou e esperam a sua conferência vêm primeiro, como Aguardando revisão.",
    passos: [
      "Para criar, use Nova proposta (o botão aparece para quem pode criar). Escolha o Negócio (Lead), dê um título, defina a validade e as condições, e use Criar e abrir editor. A proposta fica ligada ao negócio e ao contato dele.",
      "No editor, monte os itens com + Item à mão ou Buscar produto no catálogo…. O Total se soma sozinho. Use Salvar para guardar.",
      "Use Ver como o cliente recebe para conferir o documento antes de mandar.",
      "Com tudo certo, Enviar ao cliente manda a proposta (é preciso escolher e confirmar o modelo antes, e só gestores enviam). Descartar rascunho joga o rascunho fora.",
      "Depois de enviada, use Marcar como aceita ou Marcar como recusada quando o cliente responder. Revisar esta proposta cria uma nova versão para você ajustar.",
    ],
    termos: [
      { termo: "Número", significa: "A identificação da proposta, no formato 0001/2026 v1: número, ano e versão. Rascunho ainda sem envio não tem número." },
      { termo: "Rascunho", significa: "Proposta ainda em edição. Só o rascunho pode ser alterado; depois de enviada, para mudar algo você cria uma nova versão." },
      { termo: "Aguardando revisão", significa: "Rascunho que a IA preparou e que espera a sua conferência." },
      { termo: "Substituída", significa: "Versão antiga que foi trocada por uma versão nova que você enviou. A antiga só recebe esse selo quando a nova é enviada." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí están las propuestas comerciales: el documento con ítems, valores y condiciones que le mandas a un cliente. Cada fila muestra el número, el título, el estado y el valor. Las que la IA preparó y esperan tu revisión aparecen primero, como Esperando revisión.",
    passos: [
      "Para crear una, usa Nueva propuesta (el botón aparece para quien puede crear). Elige el Negocio (Lead), ponle un título, define la validez y las condiciones, y usa Crear y abrir el editor. La propuesta queda ligada al negocio y a su contacto.",
      "En el editor, arma los ítems con + Ítem manual o Buscar producto en el catálogo…. El Total se suma solo. Usa Guardar para guardar.",
      "Usa Ver como lo recibe el cliente para revisar el documento antes de mandarlo.",
      "Con todo bien, Enviar al cliente manda la propuesta (antes hay que elegir y confirmar la plantilla, y solo los gestores envían). Descartar borrador tira el borrador.",
      "Una vez enviada, usa Marcar como aceptada o Marcar como rechazada cuando el cliente responda. Revisar esta propuesta crea una nueva versión para que la ajustes.",
    ],
    termos: [
      { termo: "Número", significa: "La identificación de la propuesta, con el formato 0001/2026 v1: número, año y versión. Un borrador aún sin enviar no tiene número." },
      { termo: "Borrador", significa: "Propuesta todavía en edición. Solo el borrador se puede cambiar; una vez enviada, para cambiar algo creas una nueva versión." },
      { termo: "Esperando revisión", significa: "Borrador que la IA preparó y que espera tu revisión." },
      { termo: "Reemplazada", significa: "Versión anterior que fue sustituida por una versión nueva que enviaste. La anterior solo recibe este sello cuando se envía la nueva." },
    ],
  },
  en: {
    oQueMostra:
      "This is where your commercial proposals live: the document with items, prices and terms that you send to a customer. Each row shows the number, the title, the status and the value. The ones the AI prepared and that wait for your check come first, as Awaiting review.",
    passos: [
      "To create one, use New proposal (the button shows for people who can create). Pick the Deal (Lead), give it a title, set the validity and the terms, and use Create and open editor. The proposal is tied to the deal and its contact.",
      "In the editor, build the items with + Manual item or Search product in the catalog…. The Total adds up on its own. Use Save to keep your changes.",
      "Use See how the client receives it to check the document before sending.",
      "When everything is right, Send to client sends the proposal (you must pick and confirm the template first, and only managers can send). Discard draft throws the draft away.",
      "Once it is sent, use Mark as accepted or Mark as declined when the customer answers. Review this proposal creates a new version for you to adjust.",
    ],
    termos: [
      { termo: "Number", significa: "The proposal's identification, in the format 0001/2026 v1: number, year and version. A draft that was not sent yet has no number." },
      { termo: "Draft", significa: "A proposal still being edited. Only a draft can be changed; once sent, to change anything you create a new version." },
      { termo: "Awaiting review", significa: "A draft the AI prepared that is waiting for your check." },
      { termo: "Superseded", significa: "An old version that was replaced by a new version you sent. The old one only gets this tag when the new one is sent." },
    ],
  },
};

export default ajuda;

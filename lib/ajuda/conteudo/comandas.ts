import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de campo aqui são os que a tela mostra em cada idioma. Atenção: no espanhol a
 * tela chama "comanda" de `orden de servicio`, e no inglês de `service order`; `Faturar` é
 * `Cerrar y cobrar` / `Bill` e `Estornar` é `Anular` / `Reverse`. Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui você registra o que foi feito para o cliente, por quem e quanto ele paga. Cada comanda é a conta de um atendimento: reúne os itens e o valor até ser finalizada ou cancelada.",
    passos: [
      "À esquerda ficam as comandas, com número, situação e total. Use Nova comanda para abrir uma e clique numa delas para ver os itens à direita.",
      "Com a comanda Aberta, escolha o Serviço (ou Avulso), confira a Descrição e o Valor e use Incluir. O × ao lado de um item o tira.",
      "Para fechar, escolha a Forma de pagamento e use Finalizar. Se o cliente está ligado à comanda, dá para informar os Pontos de fidelidade. Cancelar comanda desiste dela. Se aparecer o aviso de que a forma de pagamento não tem conta de destino, defina em Configurações › Financeiro.",
      "Em Atendimentos sem comanda aparecem os atendimentos que já aconteceram e ninguém cobrou. Marque os que quer cobrar, escolha a Forma de pagamento e use Faturar. Nada vem marcado, e um atendimento sem preço no serviço não pode ser marcado.",
      "Uma comanda Finalizada pode ser desfeita com Estornar, informando o Motivo do estorno. Só gestores estornam.",
    ],
    termos: [
      { termo: "Comanda", significa: "A conta de um atendimento: o que foi feito, por quem e o valor total." },
      { termo: "Faturar", significa: "Cobrar de uma vez vários atendimentos que já aconteceram, todos com a mesma forma de pagamento." },
      { termo: "Estornar", significa: "Desfazer uma comanda que já foi finalizada. É preciso dizer o motivo, e fica registrado." },
      { termo: "Pontos de fidelidade", significa: "Pontos que você dá ao cliente ao finalizar uma comanda. O saldo dele aparece ao lado do número da comanda." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí registras lo que se hizo para el cliente, quién lo hizo y cuánto paga. Cada orden de servicio es la cuenta de una atención: reúne los ítems y el valor hasta que se finaliza o se cancela.",
    passos: [
      "A la izquierda están las órdenes de servicio, con número, estado y total. Usa Nueva orden de servicio para abrir una y haz clic en una de ellas para ver los ítems a la derecha.",
      "Con la orden Abierta, elige el Servicio (o Suelto), revisa la Descripción y el Valor y usa Agregar. La × al lado de un ítem lo quita.",
      "Para cerrar, elige la Forma de pago y usa Finalizar. Si el cliente está vinculado a la orden, puedes indicar los Puntos de fidelidad. Cancelar orden de servicio desiste de ella. Si aparece el aviso de que la forma de pago no tiene cuenta de destino, defínela en Configuración › Finanzas.",
      "En Atenciones sin orden de servicio aparecen las atenciones que ya se realizaron y nadie cobró. Marca las que quieras cobrar, elige la Forma de pago y usa Cerrar y cobrar. Nada viene marcado, y una atención sin precio en el servicio no se puede marcar.",
      "Una orden Finalizada se puede deshacer con Anular, indicando el Motivo de la anulación. Solo los gestores anulan.",
    ],
    termos: [
      { termo: "Orden de servicio", significa: "La cuenta de una atención: lo que se hizo, quién lo hizo y el valor total." },
      { termo: "Cerrar y cobrar", significa: "Cobrar de una vez varias atenciones que ya ocurrieron, todas con la misma forma de pago." },
      { termo: "Anular", significa: "Deshacer una orden que ya fue finalizada. Hay que indicar el motivo, y queda registrado." },
      { termo: "Puntos de fidelidad", significa: "Puntos que le das al cliente al finalizar una orden de servicio. Su saldo aparece al lado del número de la orden." },
    ],
  },
  en: {
    oQueMostra:
      "Here you record what was done for the customer, by whom and how much they pay. Each service order is the bill for one appointment: it gathers the items and the amount until it is finalized or canceled.",
    passos: [
      "On the left are the service orders, with number, status and total. Use New service order to open one and click one to see its items on the right.",
      "With the order Open, pick the Service (or One-off), check the Description and the Value and use Add. The × next to an item removes it.",
      "To close it, choose the Payment method and use Finalize. If the customer is linked to the order, you can enter the Loyalty points. Cancel service order gives up on it. If a warning says the payment method has no destination account, set it in Settings › Finance.",
      "Under Appointments without a service order are the appointments that already happened and nobody charged for. Check the ones you want to charge, choose the Payment method and use Bill. Nothing comes checked, and an appointment with no price set on the service cannot be checked.",
      "A Finalized order can be undone with Reverse, entering the Reason for the reversal. Only managers can reverse.",
    ],
    termos: [
      { termo: "Service order", significa: "The bill for one appointment: what was done, by whom and the total amount." },
      { termo: "Bill", significa: "Charge several appointments that already happened in one go, all with the same payment method." },
      { termo: "Reverse", significa: "Undo an order that was already finalized. You must give the reason, and it stays on record." },
      { termo: "Loyalty points", significa: "Points you give the customer when finalizing a service order. Their balance shows next to the order number." },
    ],
  },
};

export default ajuda;

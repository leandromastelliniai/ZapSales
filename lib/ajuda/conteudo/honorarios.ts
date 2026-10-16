import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de campo aqui são os que a tela mostra em cada idioma (`Criar contrato` /
 * `Crear contrato` / `Create contract`, `Adicionar parcela` / `Agregar cuota` / `Add installment`).
 * No inglês a tela chama `Honorários` de `Fees`, `Êxito` de `Contingency` e `Parcelas` de `Installments`.
 * Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui fica o modelo de cobrança de cada caso e o calendário de parcelas que decorre dele. Cada contrato diz como você cobra (valor fixo, por êxito ou os dois); as parcelas dizem quanto vence em cada data.",
    passos: [
      "Para criar um contrato (gestores e administradores), escolha o Modelo, informe o Valor fixo e/ou o % de êxito que o modelo pede, e use Criar contrato. O Repasse ao advogado (%) e o ID do lead são opcionais.",
      "Em Contratos, clique numa linha para abrir as parcelas dele.",
      "Em Parcelas, preencha Número, Vencimento e Valor e use Adicionar parcela. O número já vem sugerido.",
      "Para registrar um pagamento, escolha a Conta para receber o pagamento e use Pagar na parcela. Ela passa de pendente para pago e o valor é lançado no financeiro.",
      "Quem não é gestor só consulta contratos e parcelas, sem os botões de criar e pagar. Se aparecer o aviso de que o módulo não está instalado, quem resolve é o administrador da instalação.",
    ],
    termos: [
      { termo: "Modelo (Fixo, Êxito, Misto)", significa: "Fixo cobra um valor combinado. Êxito cobra um percentual (% de êxito), ligado ao resultado do caso. Misto soma os dois." },
      { termo: "Repasse ao advogado (%)", significa: "O percentual que é repassado ao advogado. É opcional." },
      { termo: "Parcelas", significa: "O calendário de pagamento do contrato: cada parcela tem número, vencimento e valor, e fica pendente até ser paga." },
      { termo: "Conta para receber o pagamento", significa: "A conta do financeiro onde o dinheiro da parcela entra. Sem escolher uma, o botão Pagar não funciona." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí está el modelo de cobro de cada caso y el calendario de cuotas que se desprende de él. Cada contrato dice cómo cobras (valor fijo, por éxito o ambos); las cuotas dicen cuánto vence en cada fecha.",
    passos: [
      "Para crear un contrato (gestores y administradores), elige el Modelo, informa el Valor fijo y/o el % de éxito que pide el modelo, y usa Crear contrato. El Traspaso al abogado (%) y el ID del lead son opcionales.",
      "En Contratos, haz clic en una fila para abrir sus cuotas.",
      "En Cuotas, completa Número, Vencimiento y Valor y usa Agregar cuota. El número ya viene sugerido.",
      "Para registrar un pago, elige la Cuenta para recibir el pago y usa Pagar en la cuota. Pasa de pendiente a pagado y el valor se registra en finanzas.",
      "Quien no es gestor solo consulta contratos y cuotas, sin los botones de crear y pagar. Si aparece el aviso de que el módulo no está instalado, lo resuelve el administrador de la instalación.",
    ],
    termos: [
      { termo: "Modelo (Fijo, Éxito, Mixto)", significa: "Fijo cobra un valor acordado. Éxito cobra un porcentaje (% de éxito), ligado al resultado del caso. Mixto suma los dos." },
      { termo: "Traspaso al abogado (%)", significa: "El porcentaje que se traspasa al abogado. Es opcional." },
      { termo: "Cuotas", significa: "El calendario de pago del contrato: cada cuota tiene número, vencimiento y valor, y queda pendiente hasta que se paga." },
      { termo: "Cuenta para recibir el pago", significa: "La cuenta de finanzas donde entra el dinero de la cuota. Sin elegir una, el botón Pagar no funciona." },
    ],
  },
  en: {
    oQueMostra:
      "This is where each case's billing model and the installment schedule that comes from it live. Each contract says how you charge (flat amount, contingency or both); the installments say how much is due on each date.",
    passos: [
      "To create a contract (managers and administrators), choose the Model, enter the Flat amount and/or the % contingency the model asks for, and use Create contract. The Payout to the lawyer (%) and the lead ID are optional.",
      "Under Contracts, click a row to open its installments.",
      "Under Installments, fill in Number, Due date and Value and use Add installment. The number comes suggested.",
      "To record a payment, choose the Account to receive the payment and use Pay on the installment. It goes from pending to paid and the amount is posted to finance.",
      "Anyone who is not a manager can only view contracts and installments, without the create and pay buttons. If a notice says the module is not installed, the installation's administrator resolves it.",
    ],
    termos: [
      { termo: "Model (Flat, Contingency, Mixed)", significa: "Flat charges an agreed amount. Contingency charges a percentage (% contingency), tied to the case's result. Mixed adds both." },
      { termo: "Payout to the lawyer (%)", significa: "The percentage that is passed on to the lawyer. It is optional." },
      { termo: "Installments", significa: "The contract's payment schedule: each installment has a number, due date and value, and stays pending until it is paid." },
      { termo: "Account to receive the payment", significa: "The finance account where the installment's money comes in. Without choosing one, the Pay button does not work." },
    ],
  },
};

export default ajuda;

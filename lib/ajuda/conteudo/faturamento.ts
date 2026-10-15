import type { AjudaDaPagina } from "../tipos";

const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Faturamento mostra o dinheiro do período: quanto entrou, de que forma, quais serviços e clientes mais renderam e quanto cada pessoa tem a receber de comissão.",
    passos: [
      "Escolha o período nas duas datas do topo. Por padrão aparece o mês corrente.",
      "Logo abaixo estão os totais: o que Entrou, o que Saiu, o Saldo e o Ticket médio (o valor médio por comanda finalizada).",
      "Abaixo, veja por forma de pagamento, os serviços que mais faturaram, os clientes que mais gastaram e a comissão por pessoa.",
      "Em Lançamentos do período ficam as entradas individuais. Quem atende pode registrar um novo lançamento.",
    ],
    termos: [
      { termo: "Comanda", significa: "A conta de um atendimento: os serviços e produtos que o cliente consumiu, e quanto ele pagou." },
      { termo: "Faturado", significa: "O total das comandas finalizadas no período." },
      { termo: "Entrou", significa: "O total dos lançamentos pagos. Pode diferir do faturado, e os dois não precisam bater." },
    ],
  },
  es: {
    oQueMostra:
      "Facturación muestra el dinero del período: cuánto entró, de qué forma, qué servicios y clientes rindieron más y cuánto le corresponde cobrar a cada persona de comisión.",
    passos: [
      "Elige el período en las dos fechas de arriba. Por defecto aparece el mes en curso.",
      "Debajo están los totales: lo que Entró, lo que Salió, el Saldo y el Ticket promedio (el valor medio por cuenta finalizada).",
      "Abajo, mira por forma de pago, los servicios que más facturaron, los clientes que más gastaron y la comisión por persona.",
      "En Registros del período están las entradas individuales. Quien atiende puede registrar un nuevo movimiento.",
    ],
    termos: [
      { termo: "Cuenta", significa: "La cuenta de una atención: los servicios y productos que consumió el cliente, y cuánto pagó." },
      { termo: "Facturado", significa: "El total de las cuentas finalizadas en el período." },
      { termo: "Entró", significa: "El total de los movimientos pagados. Puede diferir de lo facturado, y no tienen por qué coincidir." },
    ],
  },
  en: {
    oQueMostra:
      "Revenue shows the money for the period: how much came in, in what form, which services and customers earned the most, and how much commission each person is owed.",
    passos: [
      "Pick the period using the two dates at the top. By default it shows the current month.",
      "Right below are the totals: what came In, what went Out, the Balance and the Average ticket (the average value per finished tab).",
      "Below, see it by payment method, the services that earned the most, the customers who spent the most and commission per person.",
      "Entries for the period lists the individual items. Whoever handles customers can record a new entry.",
    ],
    termos: [
      { termo: "Tab", significa: "The bill for one visit: the services and products the customer used, and how much they paid." },
      { termo: "Billed", significa: "The total of the tabs finished in the period." },
      { termo: "In", significa: "The total of paid entries. It can differ from billed, and the two do not have to match." },
    ],
  },
};

export default ajuda;

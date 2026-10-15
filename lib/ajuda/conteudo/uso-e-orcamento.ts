import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão, filtro e quadro aqui são os que a tela mostra em cada idioma (`Editar limite` /
 * `Editar límite` / `Edit limit`, `Tempo de resposta` / `Tiempo de respuesta` / `Response time`). Mudou o
 * rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui você vê quanto a inteligência artificial custou, quantos atendimentos ela fez, quanto demorou para responder e quantas vezes precisou chamar uma pessoa. A tela é para Gerente ou acima.",
    passos: [
      "No alto, o cartão Orçamento mensal de IA mostra quanto já foi gasto no mês. Os valores são em dólar, a moeda em que o provedor de IA cobra.",
      "O Administrador usa Editar limite para definir o Limite mensal (US$) e escolher o que acontece ao chegar nele: Só acompanhar, Me avisar ao passar de… ou Parar a IA ao chegar em….",
      "Mais abaixo, filtre por Agente, por Tipo de uso e pelas datas De e Até. As opções de Tipo de uso aparecem com nome técnico; Todas mostra tudo.",
      "Os quatro quadros resumem o período: Custo no período, Atendimentos com IA, Passaram para uma pessoa e Tempo de resposta.",
      "Os gráficos mostram a mesma história dia a dia: gasto, volume de texto processado, tempo de resposta e quanto foi para uma pessoa.",
    ],
    termos: [
      { termo: "Parar a IA ao chegar em", significa: "Ao chegar no limite, as conversas em andamento vão para a fila de atendimento humano e cada uma volta ao automático pelo botão Devolver ao automático. A parada só começa a valer 72 horas depois de salvar, a não ser que você marque para começar agora." },
      { termo: "Passaram para uma pessoa", significa: "A parte dos atendimentos em que a IA precisou chamar uma pessoa. Quanto mais alto, mais a IA precisou de ajuda." },
      { termo: "Tempo de resposta", significa: "O pior caso comum: em 95 de cada 100 respostas, o tempo foi até esse valor. Embaixo, a tela mostra em quanto tempo a maioria responde." },
      { termo: "Só acompanhar", significa: "A IA nunca para por gasto. Você só vê o número aqui e decide o que fazer." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí ves cuánto costó la inteligencia artificial, cuántas atenciones hizo, cuánto demoró en responder y cuántas veces necesitó llamar a una persona. La pantalla es para Gerente o superior.",
    passos: [
      "Arriba, la tarjeta Presupuesto mensual de IA muestra cuánto se gastó en el mes. Los valores son en dólares, la moneda en que cobra el proveedor de IA.",
      "El Administrador usa Editar límite para definir el Límite mensual (US$) y elegir qué pasa al llegar a él: Solo monitorear, Avisarme al pasar de… o Detener la IA al llegar a….",
      "Más abajo, filtra por Agente, por Tipo de uso y por las fechas De y Hasta. Las opciones de Tipo de uso aparecen con nombre técnico; Todas muestra todo.",
      "Los cuatro cuadros resumen el período: Costo en el período, Atenciones con IA, Pasaron a una persona y Tiempo de respuesta.",
      "Los gráficos cuentan la misma historia día a día: gasto, volumen de texto procesado, tiempo de respuesta y cuánto pasó a una persona.",
    ],
    termos: [
      { termo: "Detener la IA al llegar a", significa: "Al llegar al límite, las conversaciones en curso pasan a la cola de atención humana y cada una vuelve al automático con el botón Devolver al automático. La detención solo entra en vigor 72 horas después de guardar, a menos que marques que empiece ahora." },
      { termo: "Pasaron a una persona", significa: "La parte de las atenciones en que la IA necesitó llamar a una persona. Cuanto más alto, más ayuda necesitó la IA." },
      { termo: "Tiempo de respuesta", significa: "El peor caso común: en 95 de cada 100 respuestas, el tiempo fue hasta ese valor. Abajo, la pantalla muestra en cuánto tiempo responde la mayoría." },
      { termo: "Solo monitorear", significa: "La IA nunca se detiene por gasto. Solo ves el número aquí y decides qué hacer." },
    ],
  },
  en: {
    oQueMostra:
      "Here you see how much the artificial intelligence cost, how many conversations it handled, how long it took to answer and how many times it had to call a person. The screen is for Manager or higher.",
    passos: [
      "At the top, the Monthly AI budget card shows how much has been spent this month. Values are in dollars, the currency the AI provider charges in.",
      "The Administrator uses Edit limit to set the Monthly limit (US$) and choose what happens when it is reached: Just monitor, Notify me when it passes… or Stop the AI when it reaches….",
      "Further down, filter by Agent, by Usage type and by the dates Of and Until. The Usage type options show technical names; All shows everything.",
      "The four boxes sum up the period: Cost in the period, AI conversations, Passed to a person and Response time.",
      "The charts tell the same story day by day: spend, text volume processed, response time and how much went to a person.",
    ],
    termos: [
      { termo: "Stop the AI when it reaches", significa: "When the limit is reached, conversations in progress go to the human support queue and each one returns to automatic with the Return to automatic button. The stop only takes effect 72 hours after saving, unless you tick to start now." },
      { termo: "Passed to a person", significa: "The share of conversations where the AI had to call a person. The higher it is, the more help the AI needed." },
      { termo: "Response time", significa: "The common worst case: in 95 out of 100 answers, the time was up to this value. Below it, the screen shows how long most answers take." },
      { termo: "Just monitor", significa: "The AI never stops because of spend. You only see the number here and decide what to do." },
    ],
  },
};

export default ajuda;

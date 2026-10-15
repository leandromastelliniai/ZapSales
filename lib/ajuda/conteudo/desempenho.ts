import type { AjudaDaPagina } from "../tipos";

const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Desempenho mostra como a operação foi nos últimos 30 dias: quantos negócios fecharam, onde as conversas esfriaram e o que cada atendente (e cada agente de IA) entregou.",
    passos: [
      "Comece pelo Atrito: ele mostra o que o resultado custou para os dois lados, o cliente e a equipe. Se não houve nenhuma demanda encerrada no período, os números ainda não têm base.",
      "Veja a Conversão para saber quantos negócios foram ganhos e quanto tempo levaram até o desfecho.",
      "Previsão e Perdas mostram o funil: a chance de fechar cada etapa e por que os negócios se perderam, por motivo e por etapa.",
      "Gestores podem filtrar por atendente, no topo, e comparar a performance de cada pessoa.",
      "O prazo de silêncio (padrão de 72 horas) define quando uma conversa sem resposta passa a contar como perdida. Dá para ajustar na própria tela.",
    ],
    termos: [
      { termo: "Atrito", significa: "O esforço e o desgaste que uma conversa custou, para o cliente e para a equipe, até chegar a um resultado." },
      { termo: "Desfecho", significa: "Como uma demanda terminou: resolvida, convertida, perdida, entre outros." },
      { termo: "Perdida no silêncio", significa: "A conversa em que a equipe falou e a pessoa não respondeu mais, depois do prazo de silêncio." },
    ],
  },
  es: {
    oQueMostra:
      "Desempeño muestra cómo fue la operación en los últimos 30 días: cuántos negocios se cerraron, dónde se enfriaron las conversaciones y qué entregó cada agente (y cada agente de IA).",
    passos: [
      "Empieza por la Fricción: muestra lo que costó el resultado para ambos lados, el cliente y el equipo. Si no hubo ninguna demanda cerrada en el período, los números aún no tienen base.",
      "Mira la Conversión para saber cuántos negocios se ganaron y cuánto tardaron hasta el desenlace.",
      "Previsión y Pérdidas muestran el embudo: la probabilidad de cerrar cada etapa y por qué se perdieron los negocios, por motivo y por etapa.",
      "Los gestores pueden filtrar por agente, arriba, y comparar el desempeño de cada persona.",
      "El plazo de silencio (por defecto 72 horas) define cuándo una conversación sin respuesta pasa a contar como perdida. Se puede ajustar en la propia pantalla.",
    ],
    termos: [
      { termo: "Fricción", significa: "El esfuerzo y el desgaste que costó una conversación, para el cliente y para el equipo, hasta llegar a un resultado." },
      { termo: "Desenlace", significa: "Cómo terminó una demanda: resuelta, convertida, perdida, entre otros." },
      { termo: "Perdida en el silencio", significa: "La conversación en que el equipo habló y la persona ya no respondió, pasado el plazo de silencio." },
    ],
  },
  en: {
    oQueMostra:
      "Performance shows how the operation did over the last 30 days: how many deals closed, where conversations went cold, and what each agent (and each AI agent) delivered.",
    passos: [
      "Start with Friction: it shows what the result cost both sides, the customer and the team. If no request was closed in the period, the numbers have no base yet.",
      "Look at Conversion to see how many deals were won and how long they took to reach an outcome.",
      "Forecast and Losses show the pipeline: the chance of closing each stage and why deals were lost, by reason and by stage.",
      "Managers can filter by agent at the top and compare each person's performance.",
      "The silence window (72 hours by default) sets when an unanswered conversation counts as lost. You can adjust it on the screen itself.",
    ],
    termos: [
      { termo: "Friction", significa: "The effort and wear a conversation cost, for the customer and the team, before reaching a result." },
      { termo: "Outcome", significa: "How a request ended: resolved, converted, lost, among others." },
      { termo: "Lost in silence", significa: "A conversation where the team spoke and the person never answered again, once the silence window passed." },
    ],
  },
};

export default ajuda;

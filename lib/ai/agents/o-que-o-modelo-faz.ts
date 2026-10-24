/**
 * O que cada MODELO de agente faz, em palavras — a parte do módulo de capacidades por
 * modelo que roda no NAVEGADOR (o assistente de criação e o editor completo mostram a
 * frase). Fica separada de `capacidades-do-modelo.ts` de propósito: aquele lê os handlers
 * das ferramentas (`allTools`), que são código de servidor e não podem entrar no pacote
 * do navegador. Aqui só há texto e tipos.
 */
import type { ToolBundle } from "@/lib/mcp/tools/pacotes";

import type { IdDoModelo } from "./modelos";
import type { IdiomaDoAgente } from "./perfil";

/**
 * Um pacote por modelo, e nunca dois: nenhum par de pacotes cabe no teto por agente
 * (`TETO_TOOLS_POR_AGENTE`). A agenda mora dentro do pacote `vender`, então Agendamento e
 * Vendas ligam o mesmo; Suporte e Atendimento ligam `atender`, que consulta e organiza a
 * conversa mas não cria lead nem move card.
 */
export const PACOTE_DO_MODELO: Record<IdDoModelo, Extract<ToolBundle, "vender" | "atender">> = {
  vendas: "vender",
  agendamento: "vender",
  suporte: "atender",
  atendimento: "atender",
};

const FRASE_DO_QUE_FAZ: Record<IdDoModelo, Record<IdiomaDoAgente, string>> = {
  vendas: {
    "pt-BR":
      "Vai responder os interessados, registrar cada oportunidade e mover o cliente no funil conforme a conversa avança.",
    es: "Responderá a los interesados, registrará cada oportunidad y moverá al cliente en el embudo a medida que avanza la conversación.",
    en: "It will answer prospects, record each opportunity and move the customer through the funnel as the conversation moves on.",
  },
  agendamento: {
    "pt-BR":
      "Vai responder, mostrar os horários livres, marcar, remarcar e confirmar, e mover o cliente no funil.",
    es: "Responderá, mostrará los horarios libres, agendará, reagendará y confirmará, y moverá al cliente en el embudo.",
    en: "It will answer, show free time slots, book, reschedule and confirm, and move the customer through the funnel.",
  },
  suporte: {
    "pt-BR":
      "Vai responder dúvidas e problemas com base nos seus materiais e chamar uma pessoa quando não souber resolver.",
    es: "Responderá dudas y problemas con base en tus materiales y llamará a una persona cuando no sepa resolverlo.",
    en: "It will answer questions and problems based on your materials and bring in a person when it can't solve them.",
  },
  atendimento: {
    "pt-BR":
      "Vai receber a pessoa, entender o assunto, reunir os dados e passar para a equipe, sem vender nem agendar sozinho.",
    es: "Recibirá a la persona, entenderá el asunto, reunirá los datos y pasará al equipo, sin vender ni agendar por su cuenta.",
    en: "It will welcome the person, understand the topic, gather the details and hand over to the team, without selling or booking on its own.",
  },
};

/** Em uma frase, o que o agente do modelo vai fazer — sem a palavra "capacidade". */
export function fraseDoQueFaz(id: IdDoModelo, idioma: IdiomaDoAgente): string {
  return FRASE_DO_QUE_FAZ[id][idioma];
}

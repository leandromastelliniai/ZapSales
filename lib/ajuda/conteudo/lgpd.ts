import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de filtro, coluna e botão aqui são os que a tela mostra em cada idioma
 * (`Sujeito` / `Titular` / `Subject`, `Aprovar export` / `Aprobar exportación` / `Approve export`). Mudou o rótulo na tela, muda aqui.
 * Prazos em dias não são afirmados aqui: a tela mostra o tempo que falta em cada pedido.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui chegam os pedidos de pessoas que querem ver os próprios dados ou pedir que eles sejam anonimizados, como manda a lei de proteção de dados (LGPD). Só administradores abrem esta tela.",
    passos: [
      "Olhe a faixa no topo: ela conta os pedidos críticos (prazo vencido ou perto de vencer) ou em alerta (mais de metade do prazo gasto).",
      "Use os filtros Status, Tipo e SLA para achar um pedido, e Limpar filtros para voltar à lista inteira.",
      "Leia cada linha: Tipo, Sujeito (de quem é o pedido), quando foi Recebido, quando Vence, o SLA e o Status.",
      "Clique em Ver para abrir o pedido. Lá estão a linha do tempo do prazo, os detalhes, a Trilha de auditoria e o botão Pré-visualizar dados, que mostra uma prévia com os dados pessoais mascarados.",
      "Quando o pedido está como Recebido, o botão de aprovar (por exemplo, Aprovar export) pede uma Justificativa de pelo menos 10 caracteres antes de Confirmar aprovação. Aprovar uma anonimização não tem volta.",
    ],
    termos: [
      { termo: "LGPD", significa: "A lei brasileira que dá à pessoa o direito de ver, receber e pedir a anonimização dos dados que a empresa guarda sobre ela." },
      { termo: "Sujeito", significa: "A pessoa dona dos dados a que o pedido se refere. A tela mostra só um código dela, não o nome." },
      { termo: "SLA", significa: "O prazo que a empresa tem para atender o pedido. A coluna Vence mostra quanto falta ou quanto está atrasado." },
      { termo: "Anonimização", significa: "Retirar do cadastro o que identifica a pessoa, mantendo o histórico de atendimento sem nome. Há a de um cliente e a da empresa inteira (Anonimização tenant)." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí llegan las solicitudes de personas que quieren ver sus propios datos o pedir que se anonimicen, como manda la ley de protección de datos (LGPD). Solo los administradores abren esta pantalla.",
    passos: [
      "Mira la franja de arriba: cuenta las solicitudes críticas (plazo vencido o por vencer) o en alerta (más de la mitad del plazo consumido).",
      "Usa los filtros Estado, Tipo y SLA para encontrar una solicitud, y Limpiar filtros para volver a la lista completa.",
      "Lee cada fila: Tipo, Titular (de quién es la solicitud), cuándo se Recibió, cuándo Vence, el SLA y el Estado.",
      "Haz clic en Ver para abrir la solicitud. Allí están la línea de tiempo del plazo, los detalles, la Pista de auditoría y el botón Previsualizar datos, que muestra una vista previa con los datos personales enmascarados.",
      "Cuando la solicitud está como Recibido, el botón de aprobar (por ejemplo, Aprobar exportación) pide una Justificación de al menos 10 caracteres antes de Confirmar aprobación. Aprobar una anonimización no tiene vuelta atrás.",
    ],
    termos: [
      { termo: "LGPD", significa: "La ley brasileña que da a la persona el derecho de ver, recibir y pedir la anonimización de los datos que la empresa guarda sobre ella." },
      { termo: "Titular", significa: "La persona dueña de los datos a los que se refiere la solicitud. La pantalla muestra solo un código suyo, no el nombre." },
      { termo: "SLA", significa: "El plazo que tiene la empresa para atender la solicitud. La columna Vence muestra cuánto falta o cuánto está atrasada." },
      { termo: "Anonimización", significa: "Quitar del registro lo que identifica a la persona, manteniendo el historial de atención sin nombre. Hay la de un cliente y la de toda la empresa (Anonimización de tenant)." },
    ],
  },
  en: {
    oQueMostra:
      "This is where requests arrive from people who want to see their own data or ask for it to be anonymized, as the data protection law (LGPD) requires. Only administrators can open this screen.",
    passos: [
      "Look at the strip at the top: it counts the critical requests (deadline passed or close) or those on alert (more than half the deadline used).",
      "Use the Status, Type and SLA filters to find a request, and Clear filters to get back to the full list.",
      "Read each row: Type, Subject (whose request it is), when it was Received, when it is Due, the SLA and the Status.",
      "Click View to open the request. There you find the deadline timeline, the details, the Audit trail and the Preview data button, which shows a preview with personal data masked.",
      "When the request is Received, the approve button (for example, Approve export) asks for a Justification of at least 10 characters before Confirm approval. Approving an anonymization cannot be undone.",
    ],
    termos: [
      { termo: "LGPD", significa: "The Brazilian law that gives people the right to see, receive and ask for anonymization of the data a company keeps about them." },
      { termo: "Subject", significa: "The person who owns the data the request is about. The screen shows only a code for them, not their name." },
      { termo: "SLA", significa: "The deadline the company has to handle the request. The Due column shows how much time is left or how late it is." },
      { termo: "Anonymization", significa: "Removing from the record what identifies the person, keeping the service history without a name. There is one for a single client and one for the whole company (Tenant anonymization)." },
    ],
  },
};

export default ajuda;

/**
 * O que a campanha OFICIAL faz com cada recusa da Meta (issue #8) — puro, com o
 * relógio injetado.
 *
 * A classificação (categoria, temporário ou definitivo, motivo legível) é do
 * mapa de erros do canal (`lib/channels/meta/erros.ts`); aqui mora só a decisão
 * da CAMPANHA sobre ela. Uma regra, usada pelos dois caminhos por onde a recusa
 * chega: na hora do envio (a Graph responde 4xx) e depois, pelo webhook de
 * status (`failed` com `errors[]`).
 *
 * ═══ 131049 ═══
 *
 * Limite de marketing por usuário: a Meta segurou a mensagem para não saturar a
 * pessoa. Reenviar antes de 24 h só renova o bloqueio — por isso a espera é o
 * dia inteiro, não a escada de espera dos outros temporários.
 *
 * ═══ 131050 ═══
 *
 * A pessoa parou o marketing desta empresa no próprio WhatsApp. Não é falha da
 * mensagem, é vontade do contato: quem chama grava a recusa no contato
 * (`consent.marketing.declined_at`), e a régua de elegibilidade que já existe
 * (`recusou_marketing`) a respeita dali em diante, em toda campanha.
 */
export const MAX_TENTATIVAS_OFICIAIS = 5;

const UM_MINUTO_MS = 60_000;
const UMA_HORA_MS = 60 * UM_MINUTO_MS;

/**
 * A regra das 24 h do 131049, para os dois lados: a espera do próprio
 * destinatário (aqui) e a do CONTATO em outra campanha, que o worker procura
 * pelo código gravado em `campaign_recipients.last_error_code`.
 */
export const ESPERA_DO_LIMITE_DE_MARKETING_MS = 24 * UMA_HORA_MS;
export const CODIGO_DO_LIMITE_DE_MARKETING = "131049";

/** A falha como o canal a classifica (`FalhaDoCanal`). */
export interface FalhaOficial {
  codigo: string | null;
  categoria: string;
  temporario: boolean;
  motivo: string;
}

export type DesfechoDaFalha =
  | { acao: "tentar_de_novo"; em: Date; motivo: string }
  | { acao: "recusou_marketing"; motivo: string }
  | { acao: "falhar"; motivo: string };

/**
 * @param tentativas quantas vezes este destinatário já foi tentado, CONTANDO a
 * que acabou de falhar.
 */
export function desfechoDaFalhaOficial(falha: FalhaOficial, tentativas: number, agora: Date): DesfechoDaFalha {
  if (falha.categoria === "opt_out_de_marketing") {
    return { acao: "recusou_marketing", motivo: falha.motivo };
  }
  if (!falha.temporario) return { acao: "falhar", motivo: falha.motivo };
  if (tentativas >= MAX_TENTATIVAS_OFICIAIS) {
    return { acao: "falhar", motivo: `${falha.motivo} Tentado ${tentativas} vezes sem sucesso.` };
  }
  const espera =
    falha.categoria === "limite_de_marketing_por_usuario"
      ? ESPERA_DO_LIMITE_DE_MARKETING_MS
      : Math.min(UMA_HORA_MS, UM_MINUTO_MS * 2 ** Math.max(0, tentativas - 1));
  return { acao: "tentar_de_novo", em: new Date(agora.getTime() + espera), motivo: falha.motivo };
}

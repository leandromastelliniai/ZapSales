import type { OrigemDoNascimento } from "@/lib/leads/nascimento-do-lead";

/**
 * DE ONDE O NEGÓCIO VEIO, dito pelo canal da conversa que o fez nascer.
 *
 * `garantirLeadDaConversa` aceita a origem como parâmetro e, sem ela, assume
 * WhatsApp. A ingestão compartilhada (`pos-entrada.ts`) passa a origem por
 * aqui, com o valor de `conversations.channel` — hoje sempre WhatsApp
 * (`CANAIS_DE_CONVERSA`). Um canal de conversa novo ganha a sua origem NESTA
 * função, e nenhum relatório por canal o conta no lugar errado.
 *
 * ## Por que o padrão é WhatsApp
 *
 * É o MESMO objeto que `garantirLeadDaConversa` usa quando ninguém passa
 * origem (`ORIGEM_PADRAO` aponta para `ORIGEM_DO_WHATSAPP`): um texto só.
 * Um canal que esta função não reconhece cai no padrão em vez de gravar um
 * `source` inventado.
 */
export const ORIGEM_DO_WHATSAPP: OrigemDoNascimento = {
  rotulo: "WhatsApp",
  source: "whatsapp",
  motivo: "primeira mensagem recebida no WhatsApp",
};

export function origemDoNegocioPeloCanal(_canal: string | null | undefined): OrigemDoNascimento {
  return ORIGEM_DO_WHATSAPP;
}

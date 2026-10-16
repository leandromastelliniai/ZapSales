/**
 * A conversa simulada da aba Teste (issue #90, parte da #86).
 *
 * O teste deixou de ser uma mensagem avulsa: a tela guarda a conversa e manda,
 * a cada troca, o que já foi dito. O servidor NÃO guarda a conversa — não há
 * lead, contato nem mensagem real por trás dela, então o histórico só existe
 * enquanto a pessoa a vê na tela, e "reiniciar" é esvaziar a lista.
 *
 * O histórico é entrada externa (vem do corpo da requisição): passa por Zod
 * aqui, com teto, porque cada troca reenvia a conversa inteira ao modelo e o
 * custo de UMA chamada não pode crescer sem limite.
 */
import { z } from "zod";

import type { LeadContextMessage } from "@/lib/agent-engine/edge/crm/get-lead-context";

/** Trocas (cliente + agente) que uma conversa de teste carrega. */
export const TROCAS_MAXIMAS_DO_TESTE = 20;

export const MENSAGEM_DO_TESTE_MAX = 4000;

/** Quem disse: `customer` é o cliente simulado, `agent` é o que o agente respondeu. */
export const turnoDoTesteSchema = z
  .object({
    role: z.enum(["customer", "agent"]),
    text: z.string().trim().min(1).max(MENSAGEM_DO_TESTE_MAX),
  })
  .strict();

export const historicoDoTesteSchema = z.array(turnoDoTesteSchema).max(TROCAS_MAXIMAS_DO_TESTE * 2);

export type TurnoDoTeste = z.infer<typeof turnoDoTesteSchema>;

/** Intervalo entre mensagens do cenário: só precisa manter a ordem estrita. */
const ESPACO_ENTRE_MENSAGENS_MS = 20_000;

/**
 * O histórico mais a mensagem nova, no formato que o contexto do turno lê.
 *
 * A mensagem nova é sempre a última e carrega o `agora` — a janela de 24h e a
 * pausa humana leem a hora da ÚLTIMA entrada do cliente. As anteriores recuam
 * em passos fixos: o instante exato delas não é dado de teste, a ordem é.
 */
export function cenarioDaConversa(
  historico: readonly TurnoDoTeste[],
  mensagemNova: string,
  agora: Date,
): LeadContextMessage[] {
  const todas: Array<{ direction: "inbound" | "outbound"; body: string }> = [
    ...historico.map((t) => ({
      direction: t.role === "customer" ? ("inbound" as const) : ("outbound" as const),
      body: t.text,
    })),
    { direction: "inbound", body: mensagemNova },
  ];
  return todas.map((m, i) => ({
    ...m,
    sent_at: new Date(agora.getTime() - (todas.length - 1 - i) * ESPACO_ENTRE_MENSAGENS_MS).toISOString(),
  }));
}

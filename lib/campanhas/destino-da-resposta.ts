/**
 * PARA ONDE VAI QUEM RESPONDE A UMA CAMPANHA — a decisão, sem banco (issue #11).
 *
 * ═══ Por que existe ═══
 *
 * A campanha só vale pelo que acontece depois da resposta. Antes desta entrega,
 * quem respondia caía no funil da campanha só se ainda não fosse lead, era
 * atendido pelo agente da campanha só se o número tivesse agente publicado, e o
 * toque num botão do modelo nem chegava a ser gravado. Cada caso pedia trabalho
 * manual de alguém olhando a Inbox.
 *
 * ═══ O que a campanha decide ═══
 *
 * - **Quem assume** (`campaigns.quem_assume`): `ia` — o agente atende; `humano` —
 *   a IA fica calada nesta conversa e ela vai para a fila de atendentes;
 *   `ia_e_humano` — o agente atende e, quando a regra de passagem existente
 *   dispara, a conversa vai para a fila (`lib/campanhas/fila-da-passagem.ts`).
 * - **O mapa dos botões** (`campaigns.botoes_de_resposta`): cada rótulo de
 *   resposta rápida do modelo aciona uma ação fechada, sem perguntar a modelo de
 *   linguagem nenhum o que a pessoa quis dizer — o toque é inequívoco.
 *
 * ═══ A primeira resposta, e só ela ═══
 *
 * Mover o card e escolher quem atende valem na PRIMEIRA resposta à campanha.
 * Repetir a decisão a cada mensagem desfaria o trabalho da equipe: a conversa que
 * um atendente devolveu ao robô voltaria para a fila no "ok" seguinte. O botão é
 * exceção porque é um pedido explícito, venha quando vier.
 *
 * Este arquivo é puro de propósito: é aqui que mora a regra, e é aqui que o teste
 * a mede sem Postgres (`destino-da-resposta.test.ts`). Quem executa é
 * `resposta-no-funil.ts`.
 */
import { z } from "zod";

import type { RespostaRapida } from "@/lib/channels/meta/webhook";

/** Mesmo vocabulário do CHECK `campaigns_quem_assume_check` (migration 0541). */
export const QUEM_ASSUME = ["ia", "humano", "ia_e_humano"] as const;
export type QuemAssume = (typeof QUEM_ASSUME)[number];

/**
 * As ações de um botão. Vocabulário fechado, validado pelo Zod abaixo — o banco
 * guarda o mapa em `jsonb` e quem o lê é sempre este schema, nunca a tela direto.
 */
export const ACOES_DO_BOTAO = [
  "mover_etapa",
  "atribuir_ia",
  "atribuir_humano",
  "marcar_perdido",
  "opt_out",
] as const;
export type AcaoDoBotao = (typeof ACOES_DO_BOTAO)[number];

/** A Meta limita o rótulo de um botão de resposta rápida a 25 caracteres. */
const ROTULO_MAX = 25;
/** Um modelo tem no máximo 10 botões. */
const BOTOES_MAX = 10;

export const botaoDaRespostaSchema = z
  .object({
    botao: z.string().trim().min(1).max(ROTULO_MAX),
    acao: z.enum(ACOES_DO_BOTAO),
    stage_id: z.string().uuid().nullish(),
  })
  .strict()
  .superRefine((b, ctx) => {
    if (b.acao === "mover_etapa" && !b.stage_id) {
      ctx.addIssue({
        code: "custom",
        path: ["stage_id"],
        message: "Escolha a etapa para onde o botão move o card.",
      });
    }
  });

export type BotaoDaResposta = z.infer<typeof botaoDaRespostaSchema>;

/** Rótulo comparável: a Meta e a tela não precisam bater em caixa nem em espaço. */
function normalizar(rotulo: string): string {
  return rotulo.trim().toLocaleLowerCase("pt-BR");
}

export const botoesDaRespostaSchema = z
  .array(botaoDaRespostaSchema)
  .max(BOTOES_MAX)
  .superRefine((botoes, ctx) => {
    const vistos = new Set<string>();
    botoes.forEach((b, i) => {
      const chave = normalizar(b.botao);
      if (vistos.has(chave)) {
        ctx.addIssue({
          code: "custom",
          path: [i, "botao"],
          message: `O botão "${b.botao}" aparece duas vezes.`,
        });
      }
      vistos.add(chave);
    });
  });

/**
 * Lê o mapa gravado. Nunca lança: mapa ilegível (um clone com dado à mão, uma
 * versão futura) vira mapa vazio — o toque cai na régua da resposta digitada, que
 * é o lado seguro.
 */
export function lerBotoesDaResposta(bruto: unknown): BotaoDaResposta[] {
  const r = botoesDaRespostaSchema.safeParse(bruto ?? []);
  return r.success ? r.data : [];
}

/** Qual linha do mapa este toque aciona — pelo rótulo, ou pelo payload. */
export function botaoClicado(
  botoes: readonly BotaoDaResposta[],
  clique: RespostaRapida | null | undefined,
): BotaoDaResposta | null {
  if (!clique) return null;
  const candidatos = [clique.texto, clique.payload].filter((v): v is string => !!v).map(normalizar);
  for (const chave of candidatos) {
    const achado = botoes.find((b) => normalizar(b.botao) === chave);
    if (achado) return achado;
  }
  return null;
}

export interface PlanoDaResposta {
  /** Gravar o pedido de saída (o mesmo bloqueio da palavra "parar"). */
  optOut: boolean;
  /** Fechar o negócio como perdido. */
  marcarPerdido: boolean;
  /** Etapa para onde o card vai (criado nela ou movido). `null` = não mexe. */
  moverPara: string | null;
  /** Calar a IA nesta conversa e mandá-la para a fila de atendentes. */
  paraHumano: boolean;
  /** Acordar o agente para responder esta mensagem. */
  despacharAgente: boolean;
}

export function planejarResposta(entrada: {
  quemAssume: QuemAssume;
  etapaDaCampanha: string | null;
  primeiraResposta: boolean;
  botao: BotaoDaResposta | null;
}): PlanoDaResposta {
  const { quemAssume, etapaDaCampanha, primeiraResposta, botao } = entrada;
  const nada: PlanoDaResposta = {
    optOut: false,
    marcarPerdido: false,
    moverPara: null,
    paraHumano: false,
    despacharAgente: true,
  };
  // O card cai no funil da campanha na primeira resposta, qualquer que seja ela.
  const etapaDaPrimeira = primeiraResposta ? etapaDaCampanha : null;
  // Quem atende, pela campanha — só na primeira resposta.
  const humanoPelaCampanha = primeiraResposta && quemAssume === "humano";

  switch (botao?.acao) {
    case "opt_out":
      return { ...nada, optOut: true, despacharAgente: false };
    case "marcar_perdido":
      return { ...nada, marcarPerdido: true, despacharAgente: false };
    case "atribuir_humano":
      return { ...nada, moverPara: etapaDaPrimeira, paraHumano: true, despacharAgente: false };
    case "atribuir_ia":
      return { ...nada, moverPara: etapaDaPrimeira };
    case "mover_etapa":
      return {
        ...nada,
        moverPara: botao.stage_id ?? etapaDaPrimeira,
        paraHumano: humanoPelaCampanha,
        despacharAgente: !humanoPelaCampanha,
      };
    default:
      return {
        ...nada,
        moverPara: etapaDaPrimeira,
        paraHumano: humanoPelaCampanha,
        despacharAgente: !humanoPelaCampanha,
      };
  }
}

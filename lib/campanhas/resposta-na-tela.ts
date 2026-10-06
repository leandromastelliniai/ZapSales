/**
 * As duas contas que a tela de campanha faz sobre a resposta (issue #11) —
 * puras, e compartilhadas pela criação e pela edição para as duas não
 * divergirem do que o servidor exige (`exigeAgente` em `schemas.ts`).
 */
import type { BotaoDaResposta, QuemAssume } from "./destino-da-resposta";

const chave = (rotulo: string) => rotulo.trim().toLocaleLowerCase("pt-BR");

/** "IA e depois humano" e o botão "Atribuir à IA" entregam a conversa ao agente da campanha. */
export function precisaDeAgente(
  quemAssume: QuemAssume,
  botoes: readonly BotaoDaResposta[],
): boolean {
  return quemAssume === "ia_e_humano" || botoes.some((b) => b.acao === "atribuir_ia");
}

/** Só as linhas do mapa cujo rótulo existe no modelo escolhido. */
export function botoesDoModeloEscolhido(
  botoes: readonly BotaoDaResposta[],
  botoesDoModelo: readonly string[],
): BotaoDaResposta[] {
  const doModelo = new Set(botoesDoModelo.map(chave));
  return botoes.filter((b) => doModelo.has(chave(b.botao)));
}

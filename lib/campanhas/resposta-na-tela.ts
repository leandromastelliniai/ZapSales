/**
 * As duas contas que a tela de campanha faz sobre a resposta (issue #11) —
 * puras, e compartilhadas pela criação e pela edição para as duas não
 * divergirem do que o servidor exige (`exigeAgente` em `schemas.ts`).
 */
import { normalizar as chave, type BotaoDaResposta, type QuemAssume } from "./destino-da-resposta";
import { exigeAgente } from "./schemas";

/** "IA e depois humano" e o botão "Atribuir à IA" entregam a conversa ao agente da campanha. */
export function precisaDeAgente(
  quemAssume: QuemAssume,
  botoes: readonly BotaoDaResposta[],
): boolean {
  return exigeAgente({ quem_assume: quemAssume, botoes_de_resposta: botoes });
}

/** Só as linhas do mapa cujo rótulo existe no modelo escolhido. */
export function botoesDoModeloEscolhido(
  botoes: readonly BotaoDaResposta[],
  botoesDoModelo: readonly string[],
): BotaoDaResposta[] {
  const doModelo = new Set(botoesDoModelo.map(chave));
  return botoes.filter((b) => doModelo.has(chave(b.botao)));
}

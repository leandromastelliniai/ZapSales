/**
 * A DECISÃO de responder em áudio — pura, sem rede e sem banco.
 *
 * Responde uma pergunta só: "ESTA resposta, a este cliente, por este canal, sai
 * em nota de voz?". Resposta `não` sempre diz o motivo, e o motivo sempre
 * termina no mesmo lugar: a resposta sai em TEXTO. Não existe caminho em que a
 * decisão deixe o cliente sem resposta.
 *
 * Esta decisão NÃO é uma conferência antes do envio e não toma o lugar de
 * nenhuma delas. Ela só é perguntada DENTRO do envio — depois que a cadeia
 * inteira (opt-out, LGPD, ritmo, janela de 24h, promessa, vocabulário) já disse
 * sim ao texto. Áudio é um jeito de ENTREGAR um texto aprovado, nunca um
 * caminho que o contorne.
 */
import type { ConfigDeAudio } from "./config";

/** Por que a resposta sai em texto. Vocabulário do registro e dos testes. */
export const MOTIVOS_DE_TEXTO = [
  "desligado_na_organizacao",
  "desligado_no_agente",
  "sem_chave",
  "cliente_nao_mandou_audio",
  "canal_sem_nota_de_voz",
  "texto_vazio",
  "texto_longo_demais",
  "sem_voz_escolhida",
] as const;
export type MotivoDeTexto = (typeof MOTIVOS_DE_TEXTO)[number];

export interface EntradaDaDecisao {
  /** A config da organização (`lerConfigDeAudio`, que falha desligada). */
  config: ConfigDeAudio;
  /** Há chave gravada para o provedor escolhido? */
  chavePresente: boolean;
  /** O que a versão publicada do agente pediu. */
  agente: { ativado: boolean; voz: string | null };
  /** A mensagem que este turno responde foi um áudio? */
  clienteMandouAudio: boolean;
  /** O canal declara suporte a nota de voz? (`suportaNotaDeVoz`) */
  canalAceitaNotaDeVoz: boolean;
  /** O texto FINAL, já aprovado pela cadeia — o que o cliente leria. */
  texto: string;
}

export type DecisaoDeAudio =
  | { vai: true; caracteres: number }
  | { vai: false; motivo: MotivoDeTexto };

export function decidirRespostaEmAudio(e: EntradaDaDecisao): DecisaoDeAudio {
  // Ligado SEM o aceite do administrador vale como desligado (o schema já faz
  // `lerConfigDeAudio` cair no desligado; a conferência repetida é a fita do
  // cinto, porque quem monta a entrada à mão num teste ou num caller novo não
  // passa pelo schema).
  if (!e.config.ligado || e.config.aceite === null) {
    return { vai: false, motivo: "desligado_na_organizacao" };
  }
  if (!e.agente.ativado) return { vai: false, motivo: "desligado_no_agente" };
  // A ORDEM é a do custo de saber: o que o turno já tem em mãos (o formato da
  // mensagem do cliente) antes do que pede uma consulta (o canal, a chave). Assim
  // o motivo que o dono lê é o verdadeiro — "o cliente escreveu" no caso comum, e
  // nunca "sem chave" para uma resposta que jamais usaria a chave.
  if (!e.clienteMandouAudio) return { vai: false, motivo: "cliente_nao_mandou_audio" };
  if (!e.canalAceitaNotaDeVoz) return { vai: false, motivo: "canal_sem_nota_de_voz" };
  if (!e.chavePresente) return { vai: false, motivo: "sem_chave" };
  const caracteres = e.texto.trim().length;
  if (caracteres === 0) return { vai: false, motivo: "texto_vazio" };
  if (caracteres > e.config.limite_de_caracteres) return { vai: false, motivo: "texto_longo_demais" };
  // A ElevenLabs não tem voz "padrão": o catálogo é da conta do cliente. Sem voz
  // escolhida (no agente ou na organização) não há o que sintetizar.
  if (e.config.provedor === "elevenlabs" && !(e.agente.voz ?? e.config.voz)) {
    return { vai: false, motivo: "sem_voz_escolhida" };
  }
  return { vai: true, caracteres };
}

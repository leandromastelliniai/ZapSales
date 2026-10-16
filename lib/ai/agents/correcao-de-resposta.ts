/**
 * "Corrigir esta resposta" (issue #90, parte da #86): a pessoa escreve o que o
 * agente deveria ter dito, e isso vira uma PROPOSTA — nunca uma mudança.
 *
 * Esta peça é pura: recebe a conversa e o texto corrigido e devolve o que a
 * proposta vai guardar. Quem grava, audita e aplica são a rota e
 * `lib/ai/apply-proposal.ts`; o gate humano é o clique de aplicar na aba
 * Propostas, e nada daqui altera o comportamento do agente.
 *
 * ## O que entra no prompt, e por que é tão cuidadoso
 *
 * O `content` da proposta é exatamente a linha que `applyProposal` acrescenta ao
 * prompt quando a pessoa aprova (o que se aprova é o que se aplica). Ele cita
 * uma fala do CLIENTE — texto que nenhum de nós escreveu — e por isso é
 * tratado como dado: uma linha só, sem aspas retas (não dá para fechar a citação
 * e continuar como instrução), tamanho limitado. Quem decide é a pessoa que lê a
 * proposta inteira antes de aprovar; esta peça só garante que o que ela lê é o
 * que entra, sem estrutura escondida.
 *
 * ## Mascaramento
 *
 * A conversa de origem passa pelo MESMO anonimizador das transcrições que
 * alimentam o RAG (`lib/ai/anonymize`) antes de ir para o `content` ou para a
 * evidência. O texto corrigido NÃO é mascarado: é a pessoa escrevendo a
 * instrução (um telefone da própria empresa ali é legítimo), não conteúdo de
 * cliente.
 */
import { z } from "zod";

import { anonymize } from "@/lib/ai/anonymize";
import {
  CORRECAO_MAX,
  type EvidenciaDeCorrecao,
} from "@/lib/ai/agents/evidencia-de-correcao";
import { historicoDoTesteSchema, type TurnoDoTeste } from "@/lib/ai/agents/teste-em-varias-trocas";

// A tela importa estes de `evidencia-de-correcao` (sem o anonimizador); reexportados
// aqui para quem monta a correção no servidor ter um ponto de entrada só.
export {
  CORRECAO_MAX,
  evidenciaDeCorrecaoSchema,
  lerEvidenciaDeCorrecao,
  type EvidenciaDeCorrecao,
} from "@/lib/ai/agents/evidencia-de-correcao";

const CITACAO_MAX = 240;
/** Quantas falas da conversa de origem a proposta carrega: o suficiente para dar contexto. */
const FALAS_NA_EVIDENCIA = 12;

export const correcaoSchema = z.discriminatedUnion("origem", [
  z
    .object({
      origem: z.literal("teste"),
      /** A conversa até a resposta a corrigir, que é a última fala (do agente). */
      conversa: historicoDoTesteSchema.min(2),
      texto_corrigido: z.string().trim().min(1).max(CORRECAO_MAX),
    })
    .strict(),
  z
    .object({
      origem: z.literal("execucao"),
      /** `llm_calls.id` do turno que a aba Execuções mostra. */
      chamada_id: z.string().uuid(),
      texto_corrigido: z.string().trim().min(1).max(CORRECAO_MAX),
    })
    .strict(),
]);

export type CorrecaoMontada =
  | { ok: true; content: string; evidence: EvidenciaDeCorrecao }
  | { ok: false; motivo: "sem_resposta_do_agente" };

function mascarar(texto: string): string {
  return anonymize(texto).anonymized;
}

/** Uma linha só, sem aspas duplas (retas ou curvas — viram simples), com teto: o formato do que vira linha de prompt. */
function emUmaLinha(texto: string, max: number): string {
  const limpo = texto
    .replace(/["“”]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1).trimEnd()}…` : limpo;
}

export function montarCorrecao(entrada: {
  origem: "teste" | "execucao";
  conversa: readonly TurnoDoTeste[];
  textoCorrigido: string;
  /** `llm_calls.id` do turno, quando a origem é uma execução real. */
  chamadaId?: string;
}): CorrecaoMontada {
  const ultima = entrada.conversa.at(-1);
  if (!ultima || ultima.role !== "agent") return { ok: false, motivo: "sem_resposta_do_agente" };

  const mascarada = entrada.conversa.map((t) => ({ role: t.role, text: mascarar(t.text) }));
  const resposta = mascarada.at(-1)!.text;
  const situacao =
    [...mascarada.slice(0, -1)].reverse().find((t) => t.role === "customer")?.text ?? "";

  const content =
    `Se o cliente disser algo como “${emUmaLinha(situacao, CITACAO_MAX)}”, ` +
    `não responda “${emUmaLinha(resposta, CITACAO_MAX)}”; ` +
    `responda no sentido de: “${emUmaLinha(entrada.textoCorrigido, CORRECAO_MAX)}”.`;

  return {
    ok: true,
    content,
    evidence: {
      origem: entrada.origem,
      conversa: mascarada.slice(-FALAS_NA_EVIDENCIA),
      texto_original: resposta,
      texto_corrigido: entrada.textoCorrigido,
      ...(entrada.chamadaId ? { llm_call_ids: [entrada.chamadaId] } : {}),
    },
  };
}

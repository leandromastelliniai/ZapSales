/**
 * O CUSTO de uma síntese de voz, em centavos de DÓLAR (a unidade de
 * `llm_calls.cost_cents`, ver `lib/agent-engine/edge/llm/pricing.ts`).
 *
 * Voz cobra por CARACTERE, não por token, e o produto não tem como saber o
 * preço de um serviço de fora. Então:
 *
 *   1. o administrador pode DECLARAR o preço (`custo_por_mil_caracteres_cents`)
 *      — vale para qualquer provedor e vence a tabela;
 *   2. senão, o preço PÚBLICO da OpenAI, só quando a base é a da própria OpenAI
 *      (um servidor compatível com o mesmo nome de modelo NÃO cobra o mesmo);
 *   3. senão, `null`: "preço desconhecido", que a coluna aceita e é mais honesto
 *      que 0 — a tela mostra os caracteres e avisa que falta o preço.
 */
import { ENDERECO_PADRAO_OPENAI } from "./config";
import type { ProvedorDeVozId } from "./tipos";

/** Centavos de dólar por MIL caracteres (preço público da OpenAI). */
const PRECO_PUBLICO_OPENAI: Readonly<Record<string, number>> = {
  "tts-1": 1.5,
  "tts-1-hd": 3,
};

export interface EntradaDoCusto {
  provedor: ProvedorDeVozId;
  modelo: string;
  /** O endereço da base (provedor compatível). Nulo/igual ao padrão = a própria OpenAI. */
  endereco: string | null;
  caracteres: number;
  /** `ConfigDeAudio.custo_por_mil_caracteres_cents`. */
  declaradoPorMil: number | null;
}

export function custoDaSintese(e: EntradaDoCusto): number | null {
  if (e.caracteres <= 0) return 0;
  if (e.declaradoPorMil !== null) return (e.caracteres / 1000) * e.declaradoPorMil;
  if (e.provedor === "openai_compativel") {
    const base = (e.endereco?.trim() || ENDERECO_PADRAO_OPENAI).replace(/\/+$/, "");
    const ehAOpenai = base === ENDERECO_PADRAO_OPENAI;
    const preco = ehAOpenai ? PRECO_PUBLICO_OPENAI[e.modelo] : undefined;
    if (preco !== undefined) return (e.caracteres / 1000) * preco;
  }
  return null;
}

/**
 * Os tipos da RESPOSTA EM ÁUDIO (issue #91, parte da #86).
 *
 * O agente já entende o áudio do cliente (transcrição). Aqui nasce a outra
 * metade: responder em nota de voz — OPCIONAL, desligado por padrão e com a
 * chave de voz do próprio cliente. O módulo inteiro obedece três regras:
 *
 *  1. **O texto manda.** O áudio é gerado a partir do texto que JÁ passou por
 *     todas as conferências antes do envio, e o texto é sempre o que fica
 *     gravado na conversa. Áudio nunca é um atalho em torno de uma proteção.
 *  2. **Falhou, vira texto.** Nenhuma falha de voz deixa o cliente sem resposta.
 *  3. **Dois provedores, uma abstração.** Outros entram depois pelo mesmo
 *     contrato (`ProvedorDeVoz`), sem tocar o motor do agente.
 */

/**
 * Os provedores de voz desta entrega. O mesmo vocabulário do CHECK de
 * `voice_provider_credentials.provider` (migration 0548) — cobrado por
 * `tests/invariants/vocabulario-banco-x-typescript.test.ts`.
 */
export const PROVEDORES_DE_VOZ = ["openai_compativel", "elevenlabs"] as const;
export type ProvedorDeVozId = (typeof PROVEDORES_DE_VOZ)[number];

export function ehProvedorDeVoz(valor: unknown): valor is ProvedorDeVozId {
  return typeof valor === "string" && (PROVEDORES_DE_VOZ as readonly string[]).includes(valor);
}

/**
 * Por que a voz não saiu — dito pelo provedor, traduzido para o que o dono do
 * negócio precisa fazer. É o vocabulário da tela de configuração e do registro
 * de uso; o cliente final nunca o vê (para ele, a resposta chega em texto).
 */
export const MOTIVOS_DE_FALHA_DE_VOZ = [
  /** O provedor recusou a chave (401/403). */
  "chave_invalida",
  /** A conta do provedor está sem créditos ou sem saldo (402, `quota_exceeded`). */
  "sem_creditos",
  /** Limite de uso/concorrência do provedor (429). Tentar de novo depois resolve. */
  "limite_de_uso",
  /** A voz ou o modelo escolhidos não existem na conta do cliente (404). */
  "voz_inexistente",
  /** O provedor está fora do ar, lento demais ou a rede falhou. */
  "indisponivel",
  /** O provedor respondeu, mas não com um áudio utilizável. */
  "resposta_invalida",
  /** O endereço do provedor foi recusado pela proteção de rede. */
  "endereco_recusado",
  /** A conversão para nota de voz (ffmpeg) falhou. */
  "conversao_falhou",
  /** O provedor recusou o pedido (4xx sem categoria própria). */
  "recusado",
] as const;
export type MotivoDeFalhaDeVoz = (typeof MOTIVOS_DE_FALHA_DE_VOZ)[number];

export class ErroDeVoz extends Error {
  readonly motivo: MotivoDeFalhaDeVoz;
  readonly status: number | null;

  constructor(motivo: MotivoDeFalhaDeVoz, opts: { status?: number | null; detalhe?: string } = {}) {
    super(opts.detalhe ? `${motivo}: ${opts.detalhe}` : motivo);
    this.name = "ErroDeVoz";
    this.motivo = motivo;
    this.status = opts.status ?? null;
  }
}

export function ehErroDeVoz(err: unknown): err is ErroDeVoz {
  return err instanceof ErroDeVoz;
}

export interface PedidoDeSintese {
  /** O texto exatamente como seria enviado ao cliente. */
  texto: string;
  /** A voz. `null` = a padrão do provedor/da organização. */
  voz: string | null;
  /** O modelo de voz. `null` = o padrão do provedor/da organização. */
  modelo: string | null;
  signal?: AbortSignal;
}

/** O áudio como o provedor devolveu (formato nativo, em geral mp3) — ainda NÃO é nota de voz. */
export interface AudioSintetizado {
  bytes: Buffer;
  mime: string;
}

export interface VozDoProvedor {
  id: string;
  nome: string;
  /** Rótulo livre do provedor (ex.: "premade", "cloned"), só para a tela. */
  categoria: string | null;
  /** Descrição curta que o provedor devolve (sotaque, idade, estilo). */
  descricao: string | null;
}

/**
 * O contrato dos provedores. `listarVozes` é opcional: só quem tem catálogo de
 * vozes por conta (ElevenLabs) o implementa; quem não tem recebe a voz como
 * texto livre na configuração da organização.
 */
export interface ProvedorDeVoz {
  readonly id: ProvedorDeVozId;
  sintetizar(pedido: PedidoDeSintese): Promise<AudioSintetizado>;
  listarVozes?(signal?: AbortSignal): Promise<VozDoProvedor[]>;
}

/**
 * Gera a NOTA DE VOZ de uma resposta que a cadeia de conferências já aprovou.
 *
 *   texto aprovado → provedor de voz → mp3 → ogg/opus → Storage da conversa
 *
 * Devolve o caminho pronto para o envio — e é só isso. QUEM envia é o motor do
 * agente, pelo mesmo `ChannelAdapter` de sempre, com a mesma idempotência por
 * `(job, seq)`; esta função não fala com canal nenhum.
 *
 * NUNCA lança. Cada falha possível (chave recusada, sem créditos, provedor fora
 * do ar, conversão, Storage) volta como `{ ok: false, motivo }` e o motor manda
 * o TEXTO — o cliente nunca fica sem resposta por causa da voz. A tentativa e o
 * seu custo vão para `llm_calls` (`./uso.ts`), com sucesso ou sem.
 *
 * Tudo que toca o mundo (provedor, ffmpeg, Storage, relógio) entra por
 * `deps`, então o teste exercita a ordem e as falhas sem rede.
 */
import type { PedidoDeSintese, ProvedorDeVoz, ProvedorDeVozId, MotivoDeFalhaDeVoz, AudioSintetizado } from "./tipos";
import { ehErroDeVoz } from "./tipos";
import type { NotaDeVoz } from "./nota-de-voz";
import { custoDaSintese } from "./custo";
import type { UsoDaVoz } from "./uso";

export interface DependenciasDaEntrega {
  provedor: ProvedorDeVoz;
  converter: (audio: AudioSintetizado) => Promise<NotaDeVoz>;
  /** Grava no Storage da conversa. Lança em falha. */
  guardar: (caminho: string, nota: NotaDeVoz) => Promise<void>;
  /** Grava o uso. Não lança. */
  registrarUso: (uso: UsoDaVoz) => Promise<void>;
  /** Milissegundos monotônicos. */
  agora: () => number;
}

export interface PedidoDaEntrega {
  organizationId: string;
  conversationId: string;
  contactId: string | null;
  jobId: string | null;
  agentId: string | null;
  /** Distingue o arquivo de cada resposta do turno (reenvio do mesmo `seq` reusa o caminho). */
  seq: number;
  /** O texto FINAL, aprovado pela cadeia. */
  texto: string;
  voz: string | null;
  modelo: string | null;
  /** O que `custoDaSintese` precisa saber da configuração. */
  provedor: ProvedorDeVozId;
  modeloEmVigor: string;
  endereco: string | null;
  custoDeclaradoPorMil: number | null;
  signal?: AbortSignal;
}

export type ResultadoDaEntrega =
  | {
      ok: true;
      storagePath: string;
      mime: string;
      caracteres: number;
      custoCents: number | null;
      latenciaMs: number;
    }
  | { ok: false; motivo: MotivoDeFalhaDeVoz | "armazenamento_falhou"; latenciaMs: number };

/**
 * O caminho do arquivo: DENTRO da pasta da conversa (`<org>/<conversa>/…`), que
 * é a única que o envio aceita (`isMediaPathOwnedBy`) e a que a exclusão da
 * conversa (LGPD) varre. Determinístico por `(job, seq)`: o replay de um job
 * que caiu depois da geração reaproveita o arquivo em vez de encher a cota de
 * Storage do cliente com duplicatas.
 */
export function caminhoDaNotaDeVoz(p: Pick<PedidoDaEntrega, "organizationId" | "conversationId" | "jobId" | "seq">): string {
  const job = (p.jobId ?? "sem-job").replace(/[^A-Za-z0-9-]/g, "");
  return `${p.organizationId}/${p.conversationId}/resposta-em-audio-${job}-${p.seq}.ogg`;
}

export async function gerarNotaDeVozDaResposta(
  deps: DependenciasDaEntrega,
  p: PedidoDaEntrega,
): Promise<ResultadoDaEntrega> {
  const inicio = deps.agora();
  const caracteres = p.texto.trim().length;
  const usoBase = {
    organizationId: p.organizationId,
    contactId: p.contactId,
    jobId: p.jobId,
    agentId: p.agentId,
    provedor: p.provedor,
    modelo: p.modeloEmVigor,
    caracteres,
  };
  const falhou = async (
    motivo: MotivoDeFalhaDeVoz | "armazenamento_falhou",
  ): Promise<ResultadoDaEntrega> => {
    const latenciaMs = Math.max(0, Math.round(deps.agora() - inicio));
    await deps.registrarUso({ ...usoBase, custoCents: null, latenciaMs, falha: motivo });
    return { ok: false, motivo, latenciaMs };
  };

  const pedido: PedidoDeSintese = {
    texto: p.texto,
    voz: p.voz,
    modelo: p.modelo,
    ...(p.signal ? { signal: p.signal } : {}),
  };

  let nota: NotaDeVoz;
  try {
    const audio = await deps.provedor.sintetizar(pedido);
    nota = await deps.converter(audio);
  } catch (err) {
    return falhou(ehErroDeVoz(err) ? err.motivo : "indisponivel");
  }

  const caminho = caminhoDaNotaDeVoz(p);
  try {
    await deps.guardar(caminho, nota);
  } catch {
    return falhou("armazenamento_falhou");
  }

  const latenciaMs = Math.max(0, Math.round(deps.agora() - inicio));
  const custoCents = custoDaSintese({
    provedor: p.provedor,
    modelo: p.modeloEmVigor,
    endereco: p.endereco,
    caracteres,
    declaradoPorMil: p.custoDeclaradoPorMil,
  });
  await deps.registrarUso({ ...usoBase, custoCents, latenciaMs });
  return { ok: true, storagePath: caminho, mime: nota.mime, caracteres, custoCents, latenciaMs };
}

/**
 * Baixa a `media_url` NESTE processo, pela rede segura (issue #110).
 *
 * Antes o gateway de mensageria baixava o endereço, de fora daqui: o servidor só
 * conseguia julgar a URL (texto + DNS) antes de entregá-la, e o gateway resolvia o
 * nome de novo — a janela de DNS rebinding da #88 continuava aberta nesse ponto.
 * Agora quem busca é `buscarSeguro` (DNS resolvido uma vez e preso ao socket,
 * redirecionamento revalidado salto a salto, prazo total, teto de bytes), e o
 * chamador sobe os bytes ao Storage e entrega ao gateway a URL assinada NOSSA.
 */
import { MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";
import { kindFromMime, type MessageKind } from "@/lib/messaging/media/upload-validation";
import { buscarSeguro, ErroDeRedeSegura, type PoliticaDeDestino } from "@/lib/net/rede-segura";

export interface MidiaBaixada {
  buffer: Buffer;
  mime: string;
  kind: MessageKind;
}

/** Os `type` de mensagem que carregam um arquivo e, por isso, podem ter `media_url`. */
export type TipoDeMidia = MessageKind | "sticker";

/**
 * Teto de bytes por tipo de mídia: os da Meta (imagem 5 MB, figurinha 500 KB —
 * a animada; a estática é 100 KB —, vídeo e áudio 16 MB, documento 100 MB), com o
 * documento limitado ao do bucket `whatsapp-media`. Valem para qualquer canal — um
 * arquivo que o canal oficial recusaria depois de aceitar não deve sair só porque
 * o canal da vez é o QR.
 */
export const TETO_DE_MIDIA_EXTERNA: Record<TipoDeMidia, number> = {
  image: 5_000_000,
  sticker: 500_000,
  video: 16_000_000,
  audio: 16_000_000,
  document: MAX_MEDIA_BYTES,
};

export interface OpcoesDoDownload {
  /** O `type` da mensagem que será enviada. */
  type: string;
  /** O `media_mime` informado por quem chamou, usado se o servidor não declarar um mime aceito. */
  mimeInformado?: string;
  /** Sobrepõe a política de destino — para teste. */
  politica?: PoliticaDeDestino;
  /** Sobrepõe a tabela de tetos — para teste. */
  tetos?: Record<TipoDeMidia, number>;
  /** Prazo TOTAL do download (DNS, conexão, cabeçalhos, corpo e saltos). */
  timeoutMs?: number;
}

/** Prazo total do download. Um arquivo de 16 MB em enlace lento ainda cabe; um gotejador não. */
const PRAZO_DO_DOWNLOAD_MS = 30_000;
/** Saltos seguidos (link encurtado, CDN, URL pré-assinada). Cada um passa pela política inteira. */
const MAX_SALTOS = 3;

export class MidiaExternaRecusada extends Error {
  readonly codigo: string;
  constructor(codigo: string, options?: { cause?: unknown }) {
    super(codigo, options);
    this.name = "MidiaExternaRecusada";
    this.codigo = codigo;
  }
}

/** O `type` da mensagem → o tipo de mídia que fixa o teto; `null` = não carrega arquivo. */
function tipoDeMidia(type: string): TipoDeMidia | null {
  return type === "image" || type === "sticker" || type === "video" || type === "audio" || type === "document"
    ? type
    : null;
}

/** Mime que não diz o que o arquivo é: só nestes o `media_mime` de quem chamou desempata. */
const MIMES_SEM_INFORMACAO = new Set(["", "application/octet-stream", "binary/octet-stream"]);

export async function baixarMidiaExterna(url: string, opcoes: OpcoesDoDownload): Promise<MidiaBaixada> {
  // `text`, `location`, `contact` e `template` não carregam arquivo: uma `media_url`
  // ali não é mídia, e baixá-la "como imagem" só faria o servidor buscar um endereço
  // sem propósito. Recusa antes de abrir conexão.
  const tipo = tipoDeMidia(opcoes.type);
  if (!tipo) throw new MidiaExternaRecusada("unsupported_media_type");
  const tetos = opcoes.tetos ?? TETO_DE_MIDIA_EXTERNA;
  let res;
  try {
    res = await buscarSeguro(url, {
      permitirHttp: process.env.NODE_ENV !== "production",
      ...opcoes.politica,
      maxBytes: tetos[tipo],
      timeoutMs: opcoes.timeoutMs ?? PRAZO_DO_DOWNLOAD_MS,
      maxRedirecionamentos: MAX_SALTOS,
    });
  } catch (erro) {
    if (erro instanceof ErroDeRedeSegura && erro.codigo === "net:response_too_large") {
      throw new MidiaExternaRecusada("payload_too_large", { cause: erro });
    }
    throw erro;
  }
  if (res.status < 200 || res.status >= 300) throw new MidiaExternaRecusada("media_http_status");

  // O que o servidor DECLARA manda. O `media_mime` de quem chamou só desempata quando
  // o servidor não diz nada útil: senão uma página de login declarada `text/html`
  // seria guardada e enviada como PNG só porque o chamador escreveu `image/png`.
  const doServidor = mimeBase(res.headers["content-type"]);
  const mime = MIMES_SEM_INFORMACAO.has(doServidor) ? mimeBase(opcoes.mimeInformado) : doServidor;
  const kind = kindFromMime(mime);
  // SVG carrega script e a Meta só aceita JPEG/PNG; figurinha é webp.
  const formaInvalida = mime === "image/svg+xml" || (tipo === "sticker" && mime !== "image/webp");
  if (!kind || formaInvalida || kind !== (tipo === "sticker" ? "image" : tipo) || res.corpo.length === 0) {
    throw new MidiaExternaRecusada("unsupported_media_type");
  }
  return { buffer: res.corpo, mime, kind };
}

function mimeBase(valor: string | string[] | undefined): string {
  return String(Array.isArray(valor) ? valor[0] : (valor ?? ""))
    .split(";")[0]!
    .trim()
    .toLowerCase();
}

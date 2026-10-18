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

/**
 * Teto de bytes por classe de mídia: os da Meta (imagem 5 MB, vídeo e áudio 16 MB,
 * documento 100 MB), com o documento limitado ao do bucket `whatsapp-media`. Valem
 * para qualquer canal — um arquivo que o canal oficial recusaria depois de aceitar
 * não deve sair só porque o canal da vez é o QR.
 */
export const TETO_DE_MIDIA_EXTERNA: Record<MessageKind, number> = {
  image: 5_000_000,
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
  tetos?: Record<MessageKind, number>;
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

/** O `type` da mensagem → a classe de mídia que fixa o teto. `sticker` é imagem. */
function classeDoTipo(type: string): MessageKind {
  if (type === "video" || type === "audio" || type === "document") return type;
  return "image";
}

export async function baixarMidiaExterna(url: string, opcoes: OpcoesDoDownload): Promise<MidiaBaixada> {
  const tetos = opcoes.tetos ?? TETO_DE_MIDIA_EXTERNA;
  const classePedida = classeDoTipo(opcoes.type);
  let res;
  try {
    res = await buscarSeguro(url, {
      permitirHttp: process.env.NODE_ENV !== "production",
      ...opcoes.politica,
      maxBytes: tetos[classePedida],
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

  const doServidor = mimeBase(res.headers["content-type"]);
  const informado = mimeBase(opcoes.mimeInformado);
  const mime = kindFromMime(doServidor) ? doServidor : kindFromMime(informado) ? informado : "";
  const kind = mime ? kindFromMime(mime) : null;
  if (!kind || kind !== classePedida || res.corpo.length === 0) {
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

// lib/propostas/imagem-para-pdf.ts
//
// AS IMAGENS DO PDF DA PROPOSTA — BUSCADAS POR NÓS, NÃO PELO `@react-pdf`.
//
// `imagem_url` do produto é gravável por qualquer manager+ da organização, e o
// `@react-pdf` busca a URL que recebe no SERVIDOR, com o `fetch` do Node: resolve
// o nome ele mesmo (rebinding), segue redirecionamento para onde for e lê sem
// teto. O guarda textual que ficava na frente (`assertSafeOutboundUrl`) não vê
// nada disso. Aqui os bytes vêm de `buscarSeguro` (issue #109, seguimento da
// #88) — a política única de saída — e o renderizador recebe um data URI, que
// não tem rede nenhuma para atravessar.
//
// NUNCA LANÇA: imagem que não vem vira `null` ("sem imagem") e o layout fecha
// sem buraco. Uma imagem ruim jamais barra o envio da proposta.
import { logger } from "@/lib/logger";
import { buscarSeguro, type PoliticaDeDestino } from "@/lib/net/rede-segura";

/** Prazo total, de propósito curto: a imagem espera o envio, e o gestor também. */
const TIMEOUT_PADRAO_MS = 5_000;
/** Um logo tem no máximo 512 KB (`TAMANHO_MAXIMO_DO_LOGO`); foto de produto cabe em 2 MiB. */
const MAX_BYTES_PADRAO = 2 * 1024 * 1024;
/** CDN costuma redirecionar; cada salto passa pela política inteira. */
const MAX_SALTOS = 3;

export interface OpcoesDaImagemParaPdf {
  /**
   * A política de destino. Ausente = a da organização: HTTPS (HTTP só fora de
   * produção) e nenhuma lista de destinos internos. Quem busca um endereço que
   * a INSTALAÇÃO escolheu (o logo, que mora no Storage do operador) pode trazer
   * a válvula `ipPermitido` dela.
   */
  politica?: PoliticaDeDestino;
  timeoutMs?: number;
  maxBytes?: number;
}

/**
 * O `@react-pdf` só desenha PNG e JPEG. O tipo vem dos BYTES, nunca do
 * `Content-Type`: o servidor que responde é de quem escolheu a URL.
 */
function tipoPelosBytes(bytes: Buffer): "image/png" | "image/jpeg" | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "url_invalida";
  }
}

/** Os bytes da imagem como data URI, ou `null` quando não deu — por qualquer motivo. */
export async function buscarImagemParaPdf(
  url: string,
  opcoes: OpcoesDaImagemParaPdf = {},
): Promise<string | null> {
  try {
    const politica: PoliticaDeDestino = opcoes.politica ?? { permitirHttp: process.env.NODE_ENV !== "production" };
    const resposta = await buscarSeguro(url, {
      ...politica,
      headers: { accept: "image/png,image/jpeg" },
      maxRedirecionamentos: MAX_SALTOS,
      timeoutMs: opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS,
      maxBytes: opcoes.maxBytes ?? MAX_BYTES_PADRAO,
    });
    if (resposta.status < 200 || resposta.status >= 300) throw new Error(`http_${resposta.status}`);
    if (!String(resposta.headers["content-type"] ?? "").toLowerCase().startsWith("image/")) throw new Error("nao_e_imagem");
    const tipo = tipoPelosBytes(resposta.corpo);
    if (!tipo) throw new Error("formato_nao_suportado");
    return `data:${tipo};base64,${resposta.corpo.toString("base64")}`;
  } catch (erro) {
    // Sem isto a foto some do PDF e ninguém sabe por quê. Só o código e o host:
    // a URL inteira pode carregar assinatura.
    logger.warn("[imagem-para-pdf] imagem fora do PDF", {
      motivo: erro instanceof Error ? erro.message : "erro_inesperado",
      host: hostDe(url),
    });
    return null;
  }
}

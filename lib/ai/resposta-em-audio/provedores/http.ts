/**
 * O que os dois provedores de voz têm em comum: falar HTTP com prazo e teto de
 * tamanho, e traduzir a falha do provedor para o que o dono do negócio faz a
 * seguir. Mora num arquivo só para os dois adaptadores não divergirem na régua
 * — "sem créditos" e "chave inválida" têm de ser a mesma frase nos dois.
 */
import { ErroDeVoz, type AudioSintetizado, type MotivoDeFalhaDeVoz } from "../tipos";

/** O prazo de UMA chamada de síntese. Resposta curta de WhatsApp não justifica mais. */
export const PRAZO_DA_SINTESE_MS = 25_000;
/** O prazo de listar vozes e de testar a chave (tela, com alguém esperando). */
export const PRAZO_DA_CONSULTA_MS = 15_000;
/** Nota de voz de poucos minutos cabe folgada em 10 MB; acima é resposta suspeita. */
export const TETO_DO_AUDIO_BYTES = 10 * 1024 * 1024;
/** O pedaço do corpo de erro que se lê para classificar. */
const TETO_DO_CORPO_DE_ERRO = 4_000;

export type FetchDeVoz = typeof fetch;

/** Combina o sinal de quem chama com o prazo próprio. */
export function sinalComPrazo(prazoMs: number, externo?: AbortSignal): AbortSignal {
  const prazo = AbortSignal.timeout(prazoMs);
  return externo ? AbortSignal.any([externo, prazo]) : prazo;
}

/**
 * Traduz status + corpo do provedor num motivo. O CORPO é lido antes do status
 * porque os provedores reusam o status: a ElevenLabs devolve 401 tanto para
 * chave inválida quanto para cota esgotada, e a OpenAI devolve 429 tanto para
 * "devagar" quanto para "sem saldo". Para quem configura a diferença é tudo —
 * uma pede para trocar a chave, a outra para pagar a fatura.
 */
export function classificarFalhaHttp(status: number, corpo: string): MotivoDeFalhaDeVoz {
  const t = corpo.toLowerCase();
  if (
    status === 402 ||
    /quota_exceeded|insufficient_quota|insufficient_funds|exceeded your current quota|out_of_credits|payment_required|billing/.test(
      t,
    )
  ) {
    return "sem_creditos";
  }
  if (status === 401 || status === 403 || /invalid_api_key|incorrect api key|invalid api key/.test(t)) {
    return "chave_invalida";
  }
  if (status === 429) return "limite_de_uso";
  if (status === 404 || /voice_not_found|voice.{0,30}not found|model.{0,30}not found|model_not_found/.test(t)) {
    return "voz_inexistente";
  }
  if (status >= 500) return "indisponivel";
  return "recusado";
}

/** Tira a chave de qualquer texto que vá para log ou tela. */
export function semAChave(texto: string, chave: string): string {
  return chave.length >= 8 ? texto.split(chave).join("***") : texto;
}

async function lerCorpoDeErro(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, TETO_DO_CORPO_DE_ERRO);
  } catch {
    return "";
  }
}

/** A falha de transporte (rede, prazo, proteção de endereço) como `ErroDeVoz`. */
export function erroDeTransporte(err: unknown): ErroDeVoz {
  if (err instanceof ErroDeVoz) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.startsWith("unsafe_url")) return new ErroDeVoz("endereco_recusado", { detalhe: msg });
  return new ErroDeVoz("indisponivel", { detalhe: msg.slice(0, 160) });
}

/** POST que devolve áudio. Qualquer coisa que não seja áudio utilizável lança `ErroDeVoz`. */
export async function pedirAudio(
  fetchFn: FetchDeVoz,
  url: string,
  init: RequestInit,
  chave: string,
): Promise<AudioSintetizado> {
  let res: Response;
  try {
    res = await fetchFn(url, init);
  } catch (err) {
    throw erroDeTransporte(err);
  }
  if (!res.ok) {
    const corpo = await lerCorpoDeErro(res);
    const motivo = classificarFalhaHttp(res.status, corpo);
    throw new ErroDeVoz(motivo, {
      status: res.status,
      ...(motivo === "recusado" ? { detalhe: semAChave(corpo, chave).slice(0, 160) } : {}),
    });
  }
  const tipo = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!tipo.startsWith("audio/") && tipo !== "application/octet-stream") {
    throw new ErroDeVoz("resposta_invalida", { status: res.status, detalhe: `content-type ${tipo || "ausente"}` });
  }
  const declarado = Number(res.headers.get("content-length") ?? "0");
  if (declarado > TETO_DO_AUDIO_BYTES) {
    throw new ErroDeVoz("resposta_invalida", { status: res.status, detalhe: "áudio grande demais" });
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    throw erroDeTransporte(err);
  }
  if (bytes.length === 0 || bytes.length > TETO_DO_AUDIO_BYTES) {
    throw new ErroDeVoz("resposta_invalida", { status: res.status, detalhe: `${bytes.length} bytes` });
  }
  return { bytes, mime: tipo === "application/octet-stream" ? "audio/mpeg" : tipo };
}

/** GET/POST que devolve JSON. Falha vira `ErroDeVoz` com o mesmo vocabulário. */
export async function pedirJson(
  fetchFn: FetchDeVoz,
  url: string,
  init: RequestInit,
  chave: string,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(url, init);
  } catch (err) {
    throw erroDeTransporte(err);
  }
  if (!res.ok) {
    const corpo = await lerCorpoDeErro(res);
    const motivo = classificarFalhaHttp(res.status, corpo);
    throw new ErroDeVoz(motivo, {
      status: res.status,
      ...(motivo === "recusado" ? { detalhe: semAChave(corpo, chave).slice(0, 160) } : {}),
    });
  }
  try {
    return await res.json();
  } catch {
    throw new ErroDeVoz("resposta_invalida", { status: res.status, detalhe: "JSON inválido" });
  }
}

/**
 * O provedor ELEVENLABS.
 *
 * Endereço fixo (`api.elevenlabs.io`) — não há base escolhida pela organização,
 * então a proteção de destino não se aplica; a chave vai em `xi-api-key`.
 *
 * A voz é do AGENTE: a lista vem de `GET /v1/voices` com a chave do próprio
 * cliente (as vozes da conta dele, inclusive as clonadas), e a escolha fica na
 * versão do agente (`audio_reply_voice_id`). Sem voz escolhida não há o que
 * sintetizar — falha com `voz_inexistente`, e a resposta sai em texto.
 */
import { MODELO_PADRAO_ELEVENLABS } from "../config";
import { ErroDeVoz, type ProvedorDeVoz, type VozDoProvedor } from "../tipos";

import {
  PRAZO_DA_CONSULTA_MS,
  PRAZO_DA_SINTESE_MS,
  pedirAudio,
  pedirJson,
  sinalComPrazo,
  type FetchDeVoz,
} from "./http";

export const ENDERECO_DA_ELEVENLABS = "https://api.elevenlabs.io";

export interface OpcoesElevenLabs {
  chave: string;
  modeloPadrao?: string | null;
  vozPadrao?: string | null;
  /** Só para teste: um servidor HTTP de verdade no lugar do serviço. */
  endereco?: string;
  fetch?: FetchDeVoz;
  prazoMs?: number;
}

/** O que a ElevenLabs devolve em `GET /v1/voices` (só os campos que a tela usa). */
function vozesDaResposta(corpo: unknown): VozDoProvedor[] {
  const lista = (corpo as { voices?: unknown } | null)?.voices;
  if (!Array.isArray(lista)) throw new ErroDeVoz("resposta_invalida", { detalhe: "lista de vozes ausente" });
  const vozes: VozDoProvedor[] = [];
  for (const item of lista) {
    const v = item as { voice_id?: unknown; name?: unknown; category?: unknown; description?: unknown; labels?: unknown };
    if (typeof v.voice_id !== "string" || v.voice_id === "") continue;
    const rotulos =
      v.labels && typeof v.labels === "object"
        ? Object.values(v.labels as Record<string, unknown>).filter((x): x is string => typeof x === "string")
        : [];
    vozes.push({
      id: v.voice_id,
      nome: typeof v.name === "string" && v.name !== "" ? v.name : v.voice_id,
      categoria: typeof v.category === "string" ? v.category : null,
      descricao:
        typeof v.description === "string" && v.description.trim() !== ""
          ? v.description.trim().slice(0, 160)
          : rotulos.length > 0
            ? rotulos.slice(0, 4).join(" · ")
            : null,
    });
  }
  return vozes;
}

export function criarProvedorElevenLabs(o: OpcoesElevenLabs): ProvedorDeVoz {
  const fetchFn = o.fetch ?? fetch;
  const base = (o.endereco ?? ENDERECO_DA_ELEVENLABS).replace(/\/+$/, "");
  return {
    id: "elevenlabs",
    async sintetizar(pedido) {
      const voz = pedido.voz ?? o.vozPadrao ?? null;
      if (!voz) throw new ErroDeVoz("voz_inexistente", { detalhe: "nenhuma voz escolhida" });
      if (pedido.texto.trim() === "") throw new ErroDeVoz("recusado", { detalhe: "texto vazio" });
      return pedirAudio(
        fetchFn,
        `${base}/v1/text-to-speech/${encodeURIComponent(voz)}?output_format=mp3_44100_64`,
        {
          method: "POST",
          headers: { "xi-api-key": o.chave, "content-type": "application/json", accept: "audio/mpeg" },
          body: JSON.stringify({ text: pedido.texto, model_id: pedido.modelo ?? o.modeloPadrao ?? MODELO_PADRAO_ELEVENLABS }),
          signal: sinalComPrazo(o.prazoMs ?? PRAZO_DA_SINTESE_MS, pedido.signal),
        },
        o.chave,
      );
    },
    async listarVozes(signal) {
      const corpo = await pedirJson(
        fetchFn,
        `${base}/v1/voices`,
        {
          method: "GET",
          headers: { "xi-api-key": o.chave, accept: "application/json" },
          signal: sinalComPrazo(o.prazoMs ?? PRAZO_DA_CONSULTA_MS, signal),
        },
        o.chave,
      );
      return vozesDaResposta(corpo);
    },
  };
}

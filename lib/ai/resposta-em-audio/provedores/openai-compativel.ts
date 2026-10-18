/**
 * O provedor COMPATÍVEL COM A API DE FALA DA OPENAI (`POST {base}/audio/speech`).
 *
 * Serve a OpenAI e qualquer servidor que fale o mesmo contrato (um serviço de
 * voz próprio, um gateway). A base é escolhida pela ORGANIZAÇÃO, e por isso toda
 * chamada passa pela régua de destino de organização — endereço interno,
 * privado ou local é recusado e redirecionamento não é seguido
 * (`fetchParaDestinoDaOrganizacao`). A chave vai em `Authorization: Bearer`,
 * nunca na URL.
 *
 * Pede `mp3` de propósito: é o único formato que todo servidor compatível
 * entrega. A nota de voz (ogg/opus) sai da conversão que o produto já tem
 * (`../nota-de-voz.ts`), igual para qualquer provedor.
 */
import { fetchParaDestinoDaOrganizacao } from "@/lib/automation/destinos-internos-autorizados";

import {
  ENDERECO_PADRAO_OPENAI,
  MODELO_PADRAO_OPENAI,
  VOZ_PADRAO_OPENAI,
} from "../config";
import { ErroDeVoz, type ProvedorDeVoz } from "../tipos";

import { PRAZO_DA_SINTESE_MS, pedirAudio, sinalComPrazo, type FetchDeVoz } from "./http";

export interface OpcoesOpenaiCompativel {
  chave: string;
  /** A base da API (termina em `/v1`). Nulo = a da OpenAI. */
  endereco?: string | null;
  /** Modelo e voz padrão da organização — o agente, quando escolhe, vence. */
  modeloPadrao?: string | null;
  vozPadrao?: string | null;
  /** Injetável para teste. O padrão é o `fetch` com a régua de destino de organização. */
  fetch?: FetchDeVoz;
  prazoMs?: number;
}

export function urlDaFala(endereco: string | null | undefined): string {
  const base = (endereco?.trim() || ENDERECO_PADRAO_OPENAI).replace(/\/+$/, "");
  return `${base}/audio/speech`;
}

export function criarProvedorOpenaiCompativel(o: OpcoesOpenaiCompativel): ProvedorDeVoz {
  const fetchFn = o.fetch ?? fetchParaDestinoDaOrganizacao(fetch);
  return {
    id: "openai_compativel",
    async sintetizar(pedido) {
      const modelo = pedido.modelo ?? o.modeloPadrao ?? MODELO_PADRAO_OPENAI;
      const voz = pedido.voz ?? o.vozPadrao ?? VOZ_PADRAO_OPENAI;
      if (pedido.texto.trim() === "") throw new ErroDeVoz("recusado", { detalhe: "texto vazio" });
      return pedirAudio(
        fetchFn,
        urlDaFala(o.endereco),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${o.chave}`,
            "content-type": "application/json",
            accept: "audio/mpeg",
          },
          body: JSON.stringify({ model: modelo, voice: voz, input: pedido.texto, response_format: "mp3" }),
          signal: sinalComPrazo(o.prazoMs ?? PRAZO_DA_SINTESE_MS, pedido.signal),
        },
        o.chave,
      );
    },
  };
}

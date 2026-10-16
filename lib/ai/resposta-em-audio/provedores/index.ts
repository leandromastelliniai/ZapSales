/**
 * A fábrica dos provedores de voz: a ÚNICA porta por onde o resto do produto
 * obtém um `ProvedorDeVoz`. Provedor novo entra aqui e em `PROVEDORES_DE_VOZ`
 * (e no CHECK do banco) — o motor do agente, a tela e o teste de chave não mudam.
 */
import type { ConfigDeAudio } from "../config";
import type { ProvedorDeVoz, ProvedorDeVozId } from "../tipos";

import { criarProvedorElevenLabs } from "./elevenlabs";
import type { FetchDeVoz } from "./http";
import { criarProvedorOpenaiCompativel } from "./openai-compativel";

export interface EntradaDaFabrica {
  provedor: ProvedorDeVozId;
  chave: string;
  config: Pick<ConfigDeAudio, "endereco" | "modelo" | "voz">;
  /** Só para teste. */
  fetch?: FetchDeVoz;
  /** Só para teste: o endereço do servidor de mentira da ElevenLabs. */
  enderecoDaElevenLabs?: string;
}

export function criarProvedorDeVoz(e: EntradaDaFabrica): ProvedorDeVoz {
  switch (e.provedor) {
    case "openai_compativel":
      return criarProvedorOpenaiCompativel({
        chave: e.chave,
        endereco: e.config.endereco,
        modeloPadrao: e.config.modelo,
        vozPadrao: e.config.voz,
        ...(e.fetch ? { fetch: e.fetch } : {}),
      });
    case "elevenlabs":
      return criarProvedorElevenLabs({
        chave: e.chave,
        modeloPadrao: e.config.modelo,
        vozPadrao: e.config.voz,
        ...(e.enderecoDaElevenLabs ? { endereco: e.enderecoDaElevenLabs } : {}),
        ...(e.fetch ? { fetch: e.fetch } : {}),
      });
  }
}

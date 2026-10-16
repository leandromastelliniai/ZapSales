/**
 * O ESTADO da resposta em áudio de uma organização — o que a tela de Provedores
 * mostra e o que a rota `GET /api/v1/ai/audio` devolve.
 *
 * Existe um lugar só para montá-lo porque a tela e a API precisam contar a mesma
 * história: "está ligado, mas não funciona, e é por isto". É a resposta de
 * "Instalação sem nenhuma chave de voz funciona normalmente e explica por que o
 * recurso está indisponível" — o `porQueIndisponivel` é o texto da explicação,
 * já decidido aqui, e não deduzido pela tela a partir de pedaços.
 *
 * NUNCA devolve a chave: só se ela está gravada e os 4 últimos caracteres.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ENDERECO_PADRAO_OPENAI,
  LIMITE_MAXIMO_DE_CARACTERES,
  LIMITE_MINIMO_DE_CARACTERES,
  LIMITE_PADRAO_DE_CARACTERES,
  MODELO_PADRAO_ELEVENLABS,
  MODELO_PADRAO_OPENAI,
  VOZ_PADRAO_OPENAI,
  lerConfigDeAudio,
  type ConfigDeAudio,
} from "./config";
import { estadoDaChaveDeVoz, type EstadoDaChaveDeVoz } from "./credencial";
import { fraseDoMotivo } from "./frases";
import { PROVEDORES_DE_VOZ, type ProvedorDeVozId } from "./tipos";
import { resumoDoUsoDaVoz, type ResumoDoUsoDaVoz } from "./uso";

/** Por que o recurso não está respondendo em áudio agora. `null` = está disponível. */
export type PorQueIndisponivel = "desligado" | "sem_aceite" | "sem_chave";

export interface EstadoDaRespostaEmAudio {
  config: ConfigDeAudio;
  chaves: Record<ProvedorDeVozId, EstadoDaChaveDeVoz>;
  /** Ligado, com aceite e com chave do provedor escolhido. */
  disponivel: boolean;
  porQueIndisponivel: PorQueIndisponivel | null;
  /** `null` quando a leitura do uso falhou — a tela mostra "não consegui ler", nunca zero. */
  uso: ResumoDoUsoDaVoz | null;
  padroes: {
    endereco: string;
    modeloOpenai: string;
    vozOpenai: string;
    modeloElevenlabs: string;
    limiteDeCaracteres: number;
    limiteMinimo: number;
    limiteMaximo: number;
  };
}

export const PADROES_DA_VOZ = {
  endereco: ENDERECO_PADRAO_OPENAI,
  modeloOpenai: MODELO_PADRAO_OPENAI,
  vozOpenai: VOZ_PADRAO_OPENAI,
  modeloElevenlabs: MODELO_PADRAO_ELEVENLABS,
  limiteDeCaracteres: LIMITE_PADRAO_DE_CARACTERES,
  limiteMinimo: LIMITE_MINIMO_DE_CARACTERES,
  limiteMaximo: LIMITE_MAXIMO_DE_CARACTERES,
} as const;

/** O motivo, dado o que já se sabe. Função pura: a tela e o teste a usam. */
export function porQueIndisponivelDe(
  config: Pick<ConfigDeAudio, "ligado" | "aceite" | "provedor">,
  chaves: Record<ProvedorDeVozId, Pick<EstadoDaChaveDeVoz, "configurada">>,
): PorQueIndisponivel | null {
  if (!config.ligado) return "desligado";
  if (config.aceite === null) return "sem_aceite";
  if (!chaves[config.provedor].configurada) return "sem_chave";
  return null;
}

export async function estadoDaRespostaEmAudio(
  admin: SupabaseClient,
  organizationId: string,
  agora: Date = new Date(),
): Promise<EstadoDaRespostaEmAudio> {
  const { data, error } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`leitura das settings falhou: ${error.message}`);
  const config = lerConfigDeAudio((data as { settings?: unknown } | null)?.settings ?? {});

  const estados = await Promise.all(
    PROVEDORES_DE_VOZ.map(async (p) => [p, await estadoDaChaveDeVoz(admin, organizationId, p)] as const),
  );
  const chaves = Object.fromEntries(estados) as Record<ProvedorDeVozId, EstadoDaChaveDeVoz>;

  const uso = await resumoDoUsoDaVoz(admin, organizationId, agora).catch(() => null);
  const porQue = porQueIndisponivelDe(config, chaves);
  return {
    config,
    chaves,
    disponivel: porQue === null,
    porQueIndisponivel: porQue,
    uso,
    padroes: PADROES_DA_VOZ,
  };
}

/**
 * O corpo do estado — snake_case, e sem nenhuma chave. `traduzir` põe a frase da
 * última falha no idioma de quem lê (a tela mostra a frase como veio).
 */
export function corpoDoEstado(e: EstadoDaRespostaEmAudio, traduzir: (texto: string) => string = (x) => x) {
  return {
    config: e.config,
    chaves: Object.fromEntries(
      Object.entries(e.chaves).map(([provedor, c]) => [
        provedor,
        { configurada: c.configurada, ultimos4: c.ultimos4, atualizada_em: c.atualizadaEm },
      ]),
    ),
    disponivel: e.disponivel,
    por_que_indisponivel: e.porQueIndisponivel,
    uso: e.uso
      ? {
          desde: e.uso.desde,
          respostas_em_audio: e.uso.respostasEmAudio,
          falhas: e.uso.falhas,
          caracteres: e.uso.caracteres,
          custo_cents: e.uso.custoCents,
          sem_preco: e.uso.semPreco,
          ultima_falha: e.uso.ultimaFalha
            ? { ...e.uso.ultimaFalha, mensagem: traduzir(fraseDoMotivo(e.uso.ultimaFalha.motivo)) }
            : null,
        }
      : null,
    padroes: {
      endereco: e.padroes.endereco,
      modelo_openai: e.padroes.modeloOpenai,
      voz_openai: e.padroes.vozOpenai,
      modelo_elevenlabs: e.padroes.modeloElevenlabs,
      limite_de_caracteres: e.padroes.limiteDeCaracteres,
      limite_minimo: e.padroes.limiteMinimo,
      limite_maximo: e.padroes.limiteMaximo,
    },
  };
}

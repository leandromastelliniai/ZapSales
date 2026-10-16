/**
 * O INTERRUPTOR DA RESPOSTA EM ÁUDIO — `organizations.settings.resposta_em_audio`.
 *
 * Mesmo molde do Jev (`lib/ai/decisao/config.ts`), pelo mesmo motivo: é um
 * recurso OPCIONAL que manda o texto da resposta para um fornecedor de fora, com
 * interruptor por organização, desligado por padrão e aceite do administrador.
 * Não há migration — o Zod abaixo é o schema central do caminho.
 *
 * ═══ LEITURA NUNCA LANÇA, E FALHA DESLIGADA ═══
 *
 * Quem lê é o motor do agente, a cada resposta. Qualquer coisa fora do schema
 * vira "desligado": ligar o recurso manda o texto da conversa para um serviço
 * de voz, e um JSON torto não pode fazer isso por acidente. Pelo mesmo motivo,
 * ligado SEM o aceite do administrador também vale como desligado (LGPD).
 *
 * ═══ O QUE MORA AQUI, E O QUE NÃO ═══
 *
 * Aqui: ligado, provedor, endereço/modelo/voz padrão da organização, o limite
 * de tamanho do texto e o preço declarado. A CHAVE não mora aqui — mora cifrada
 * em `voice_provider_credentials` (migration 0546) e nunca volta ao browser.
 * Por agente (ligar e escolher a voz): `ai_agent_versions.audio_reply_*`.
 */
import { z } from "zod";

import type { createAdminClient } from "@/lib/supabase/admin";

import { PROVEDORES_DE_VOZ } from "./tipos";

/**
 * O teto do texto convertido em voz. Uma nota de voz de WhatsApp é curta: acima
 * de ~1.000 caracteres (cerca de um minuto falado) o cliente não ouve até o fim,
 * e o custo por resposta deixa de ser o que o dono imaginou. Texto acima do teto
 * NÃO é cortado — vai como texto, que é a forma de dizer tudo.
 */
export const LIMITE_PADRAO_DE_CARACTERES = 1000;
export const LIMITE_MINIMO_DE_CARACTERES = 100;
/** O teto de entrada da API de fala da OpenAI; nenhum provedor aqui aceita mais. */
export const LIMITE_MAXIMO_DE_CARACTERES = 4000;

/** O endereço padrão do provedor compatível com a OpenAI. */
export const ENDERECO_PADRAO_OPENAI = "https://api.openai.com/v1";
export const MODELO_PADRAO_OPENAI = "tts-1";
export const VOZ_PADRAO_OPENAI = "alloy";
export const MODELO_PADRAO_ELEVENLABS = "eleven_multilingual_v2";

const enderecoSchema = z
  .string()
  .trim()
  .max(300)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), { message: "endereco_precisa_ser_http" });

export const configDeAudioSchema = z
  .object({
    ligado: z.boolean().default(false),
    provedor: z.enum(PROVEDORES_DE_VOZ).default("openai_compativel"),
    /** Só o provedor compatível com a OpenAI: a base da API (termina em `/v1`). Nulo = a da OpenAI. */
    endereco: enderecoSchema.nullable().default(null),
    /** O modelo padrão da organização. Nulo = o padrão do provedor. */
    modelo: z.string().trim().min(1).max(120).nullable().default(null),
    /** A voz padrão da organização (a de cada agente, quando houver, vence). */
    voz: z.string().trim().min(1).max(120).nullable().default(null),
    limite_de_caracteres: z
      .number()
      .int()
      .min(LIMITE_MINIMO_DE_CARACTERES)
      .max(LIMITE_MAXIMO_DE_CARACTERES)
      .default(LIMITE_PADRAO_DE_CARACTERES),
    /**
     * O preço que o administrador declara, em centavos de DÓLAR por mil
     * caracteres — para provedor/modelo que o produto não conhece. Nulo = usar
     * a tabela conhecida, ou deixar o custo desconhecido (nunca inventar 0).
     */
    custo_por_mil_caracteres_cents: z.number().min(0).max(10_000).nullable().default(null),
    /** Quem aceitou mandar o texto das respostas a um fornecedor de voz, e quando. */
    aceite: z
      .object({
        em: z.string().datetime(),
        por: z.string().uuid(),
      })
      .nullable()
      .default(null),
    alterado_em: z.string().datetime().optional(),
    alterado_por: z.string().uuid().optional(),
  })
  .refine((c) => !c.ligado || c.aceite !== null, {
    message: "ligar a resposta em áudio exige o aceite do administrador",
  });

export type ConfigDeAudio = z.infer<typeof configDeAudioSchema>;

const DESLIGADA: ConfigDeAudio = {
  ligado: false,
  provedor: "openai_compativel",
  endereco: null,
  modelo: null,
  voz: null,
  limite_de_caracteres: LIMITE_PADRAO_DE_CARACTERES,
  custo_por_mil_caracteres_cents: null,
  aceite: null,
};

/** Lê a config de `organizations.settings`. NUNCA lança; ilegível ⇒ desligada. */
export function lerConfigDeAudio(settings: unknown): ConfigDeAudio {
  const bruto =
    settings !== null && typeof settings === "object"
      ? (settings as Record<string, unknown>).resposta_em_audio
      : undefined;
  const lido = configDeAudioSchema.safeParse(bruto ?? {});
  return lido.success ? lido.data : { ...DESLIGADA };
}

export type MudancaDaConfigDeAudio = Partial<
  Pick<
    ConfigDeAudio,
    | "ligado"
    | "provedor"
    | "endereco"
    | "modelo"
    | "voz"
    | "limite_de_caracteres"
    | "custo_por_mil_caracteres_cents"
  >
> & {
  /** `true` = o administrador marcou o aceite agora. Carimba `aceite` com quem e quando. */
  aceitar?: boolean;
};

/** A próxima config, sem tocar o banco. */
export function mesclarConfigDeAudio(
  atual: ConfigDeAudio,
  mudanca: MudancaDaConfigDeAudio,
  carimbo: { em: string; por: string },
): unknown {
  const { aceitar, ...resto } = mudanca;
  return {
    ...atual,
    ...resto,
    ...(aceitar === true ? { aceite: { em: carimbo.em, por: carimbo.por } } : {}),
    alterado_em: carimbo.em,
    alterado_por: carimbo.por,
  };
}

export type ResultadoDeGravarConfigDeAudio =
  | { ok: true; config: ConfigDeAudio }
  | { ok: false; motivo: "leitura_falhou" | "config_invalida" | "escrita_recusada" };

export interface PedidoDeGravarConfigDeAudio {
  admin: ReturnType<typeof createAdminClient>;
  /** Resolvido da SESSÃO por quem chama — nunca do corpo da requisição. */
  orgId: string;
  actorUserId: string;
  mudanca: MudancaDaConfigDeAudio;
  agora?: Date;
}

/**
 * Lê, mescla e grava. `settings` é jsonb COMPARTILHADO (marca, MFA, IA padrão,
 * Jev, onboarding): gravar `{ resposta_em_audio }` sozinho apagaria o resto em
 * silêncio. O service role passa por cima da RLS, então o `.eq("id", orgId)` é a
 * única cerca entre esta empresa e a instalação inteira. Auditar é de quem
 * chama (a rota).
 */
export async function gravarConfigDeAudio(
  p: PedidoDeGravarConfigDeAudio,
): Promise<ResultadoDeGravarConfigDeAudio> {
  const { data: org, error: leituraErr } = await p.admin
    .from("organizations")
    .select("settings")
    .eq("id", p.orgId)
    .maybeSingle();
  if (leituraErr || !org) return { ok: false, motivo: "leitura_falhou" };

  const settingsAtuais = (org.settings ?? {}) as Record<string, unknown>;
  const proxima = configDeAudioSchema.safeParse(
    mesclarConfigDeAudio(lerConfigDeAudio(settingsAtuais), p.mudanca, {
      em: (p.agora ?? new Date()).toISOString(),
      por: p.actorUserId,
    }),
  );
  if (!proxima.success) return { ok: false, motivo: "config_invalida" };

  const { data: gravado, error: escritaErr } = await p.admin
    .from("organizations")
    .update({ settings: { ...settingsAtuais, resposta_em_audio: proxima.data } })
    .eq("id", p.orgId)
    .select("settings")
    .maybeSingle();
  // Zero linhas volta como SUCESSO no PostgREST: sem esta conferência, a tela
  // diria "ligado" para uma escrita que não aconteceu.
  if (escritaErr || !gravado) return { ok: false, motivo: "escrita_recusada" };

  return { ok: true, config: proxima.data };
}

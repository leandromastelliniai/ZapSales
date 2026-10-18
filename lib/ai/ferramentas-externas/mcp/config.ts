/**
 * O INTERRUPTOR DOS SERVIDORES MCP — `organizations.settings.mcp_externo`.
 *
 * Mesmo molde do Jev (`lib/ai/decisao/config.ts`) e da resposta em áudio
 * (`lib/ai/resposta-em-audio/config.ts`), pelo mesmo motivo: é um recurso OPCIONAL que
 * manda dado da conversa a um sistema de terceiro (os argumentos de cada ferramenta que o
 * agente chama), com interruptor por organização, DESLIGADO por padrão e aceite do
 * administrador. Não há migration — o Zod abaixo é o schema central do caminho.
 *
 * ═══ LEITURA NUNCA LANÇA, E FALHA DESLIGADA ═══
 *
 * Quem lê é o motor do agente, a cada turno que cita ferramenta externa. Qualquer coisa fora
 * do schema vira "desligado": ligar o recurso deixa o agente chamar um servidor de fora, e um
 * JSON torto não pode fazer isso por acidente. Pelo mesmo motivo, ligado SEM o aceite do
 * administrador também vale como desligado (LGPD).
 *
 * ═══ O QUE DESLIGAR FAZ ═══
 *
 * Nada é apagado: os servidores, a credencial cifrada e as ferramentas escolhidas ficam como
 * estão. As ferramentas MCP somem do turno (o motor só as monta com o interruptor ligado), a
 * tela mostra o estado e uma aprovação pendente não executa. Ligar de novo devolve tudo.
 */
import { z } from "zod";

import type { createAdminClient } from "@/lib/supabase/admin";

export const configDeMcpSchema = z
  .object({
    ligado: z.boolean().default(false),
    /** Quem aceitou que o agente envie dados a servidores de terceiros, e quando. */
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
    message: "ligar os servidores MCP exige o aceite do administrador",
  });

export type ConfigDeMcp = z.infer<typeof configDeMcpSchema>;

const DESLIGADO: ConfigDeMcp = { ligado: false, aceite: null };

/** Lê a config de `organizations.settings`. NUNCA lança; ilegível ⇒ desligada. */
export function lerConfigDeMcp(settings: unknown): ConfigDeMcp {
  const bruto =
    settings !== null && typeof settings === "object"
      ? (settings as Record<string, unknown>).mcp_externo
      : undefined;
  const lido = configDeMcpSchema.safeParse(bruto ?? {});
  return lido.success ? lido.data : { ...DESLIGADO };
}

export interface MudancaDaConfigDeMcp {
  ligado?: boolean;
  /** `true` = o administrador marcou o aceite agora. Carimba `aceite` com quem e quando. */
  aceitar?: boolean;
}

/** A próxima config, sem tocar o banco. */
export function mesclarConfigDeMcp(
  atual: ConfigDeMcp,
  mudanca: MudancaDaConfigDeMcp,
  carimbo: { em: string; por: string },
): unknown {
  return {
    ...atual,
    ...(mudanca.ligado !== undefined ? { ligado: mudanca.ligado } : {}),
    ...(mudanca.aceitar === true ? { aceite: { em: carimbo.em, por: carimbo.por } } : {}),
    alterado_em: carimbo.em,
    alterado_por: carimbo.por,
  };
}

export type ResultadoDeGravarConfigDeMcp =
  | { ok: true; config: ConfigDeMcp }
  | { ok: false; motivo: "leitura_falhou" | "config_invalida" | "escrita_recusada" };

export interface PedidoDeGravarConfigDeMcp {
  admin: ReturnType<typeof createAdminClient>;
  /** Resolvido da SESSÃO por quem chama — nunca do corpo da requisição. */
  orgId: string;
  actorUserId: string;
  mudanca: MudancaDaConfigDeMcp;
  agora?: Date;
}

/** O estado do interruptor da organização, ou `null` se a leitura falhou (quem chama decide: falha fechada). */
export async function lerConfigDeMcpDaOrganizacao(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
): Promise<ConfigDeMcp | null> {
  const { data, error } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  if (error || !data) return null;
  return lerConfigDeMcp((data as { settings?: unknown }).settings ?? {});
}

/**
 * Lê, mescla e grava. `settings` é jsonb COMPARTILHADO (marca, MFA, IA padrão, Jev, áudio,
 * onboarding): gravar `{ mcp_externo }` sozinho apagaria o resto em silêncio. O service role
 * passa por cima da RLS, então o `.eq("id", orgId)` é a única cerca entre esta empresa e a
 * instalação inteira. Auditar é de quem chama (a rota).
 */
export async function gravarConfigDeMcp(p: PedidoDeGravarConfigDeMcp): Promise<ResultadoDeGravarConfigDeMcp> {
  const { data: org, error: leituraErr } = await p.admin
    .from("organizations")
    .select("settings")
    .eq("id", p.orgId)
    .maybeSingle();
  if (leituraErr || !org) return { ok: false, motivo: "leitura_falhou" };

  const settingsAtuais = (org.settings ?? {}) as Record<string, unknown>;
  const proxima = configDeMcpSchema.safeParse(
    mesclarConfigDeMcp(lerConfigDeMcp(settingsAtuais), p.mudanca, {
      em: (p.agora ?? new Date()).toISOString(),
      por: p.actorUserId,
    }),
  );
  if (!proxima.success) return { ok: false, motivo: "config_invalida" };

  const { data: gravado, error: escritaErr } = await p.admin
    .from("organizations")
    .update({ settings: { ...settingsAtuais, mcp_externo: proxima.data } })
    .eq("id", p.orgId)
    .select("settings")
    .maybeSingle();
  // Zero linhas volta como SUCESSO no PostgREST: sem esta conferência, a tela diria "ligado" para
  // uma escrita que não aconteceu.
  if (escritaErr || !gravado) return { ok: false, motivo: "escrita_recusada" };

  return { ok: true, config: proxima.data };
}

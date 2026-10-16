/**
 * A chave de VOZ da organização (migration 0548, `voice_provider_credentials`).
 *
 * Opcional: sem chave, o agente responde em texto exatamente como antes. Mesma
 * cifra das outras integrações (`fn_encrypt_oauth`), e a tabela é server-side
 * only — RLS ligada sem policies, grants revogados. A chave nunca volta ao
 * browser: a tela vê só os 4 últimos caracteres. Não é hash porque precisa ser
 * USADA a cada resposta em áudio.
 *
 * ⚠️ Service role: toda consulta aqui filtra `organization_id` à mão, e o id
 * vem de fonte confiável (a sessão ou a linha do job), nunca do corpo do pedido.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { logger } from "@/lib/logger";
import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";

import type { ProvedorDeVozId } from "./tipos";

/**
 * Sem espaço nem caractere de controle, de 8 a 300 caracteres. O formato é
 * deliberadamente frouxo: o provedor compatível com a OpenAI inclui servidores
 * próprios cujo token tem qualquer forma. Quem decide se a chave vale é o botão
 * "Testar", com uma chamada de verdade.
 */
export const chaveDeVozSchema = z
  .string()
  .trim()
  .min(8)
  .max(300)
  .regex(/^[^\s\u0000-\u001f\u007f]+$/);

export interface EstadoDaChaveDeVoz {
  configurada: boolean;
  ultimos4: string | null;
  atualizadaEm: string | null;
}

export async function estadoDaChaveDeVoz(
  admin: SupabaseClient,
  organizationId: string,
  provedor: ProvedorDeVozId,
): Promise<EstadoDaChaveDeVoz> {
  const { data, error } = await admin
    .from("voice_provider_credentials")
    .select("api_key_last4, updated_at")
    .eq("organization_id", organizationId)
    .eq("provider", provedor)
    .maybeSingle();
  if (error) throw new Error(`leitura da chave de voz falhou: ${error.message}`);
  const linha = data as { api_key_last4: string; updated_at: string } | null;
  return {
    configurada: Boolean(linha),
    ultimos4: linha?.api_key_last4 ?? null,
    atualizadaEm: linha?.updated_at ?? null,
  };
}

/** A chave em claro, ou `null` (sem chave, leitura falhou, cifra indisponível). Nunca lança. */
export async function lerChaveDeVoz(
  admin: SupabaseClient,
  organizationId: string,
  provedor: ProvedorDeVozId,
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("voice_provider_credentials")
      .select("api_key_encrypted")
      .eq("organization_id", organizationId)
      .eq("provider", provedor)
      .maybeSingle();
    if (error) {
      logger.warn("[resposta-em-audio] leitura da chave falhou", {
        organization_id: organizationId,
        error: error.message,
      });
      return null;
    }
    const cifrada = (data as { api_key_encrypted: string | null } | null)?.api_key_encrypted;
    if (!cifrada) return null;
    return await decryptWebhookSecret(admin, cifrada);
  } catch (err) {
    logger.warn("[resposta-em-audio] leitura da chave falhou", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export type ResultadoDeGravacaoDaChave =
  | { ok: true; ultimos4: string }
  | { ok: false; erro: "cifra_indisponivel" | "erro_ao_gravar"; detalhe?: string };

export async function guardarChaveDeVoz(
  admin: SupabaseClient,
  input: { organizationId: string; provedor: ProvedorDeVozId; chave: string; atorId: string },
): Promise<ResultadoDeGravacaoDaChave> {
  const cifrada = await encryptWebhookSecret(admin, input.chave);
  // Sem cifra, não grava: texto claro no banco não é um "modo degradado".
  if (!cifrada) return { ok: false, erro: "cifra_indisponivel" };
  const ultimos4 = input.chave.slice(-4);
  // `upsert` sobre o índice único `(organization_id, provider)`: trocar a chave
  // é gravar de novo, e um `update` casaria zero linhas em quem nunca gravou.
  const { error } = await admin.from("voice_provider_credentials").upsert(
    {
      organization_id: input.organizationId,
      provider: input.provedor,
      api_key_encrypted: cifrada,
      api_key_last4: ultimos4,
      updated_by: input.atorId,
    },
    { onConflict: "organization_id,provider" },
  );
  if (error) return { ok: false, erro: "erro_ao_gravar", detalhe: error.message };
  return { ok: true, ultimos4 };
}

/** `true` se havia chave e ela saiu. */
export async function removerChaveDeVoz(
  admin: SupabaseClient,
  organizationId: string,
  provedor: ProvedorDeVozId,
): Promise<boolean> {
  const { data, error } = await admin
    .from("voice_provider_credentials")
    .delete()
    .eq("organization_id", organizationId)
    .eq("provider", provedor)
    .select("id");
  if (error) throw new Error(`remoção da chave de voz falhou: ${error.message}`);
  return (data ?? []).length > 0;
}

// ─── O caminho do MOTOR (pool `pg`) ─────────────────────────────────────────
//
// O worker do agente fala com o banco pelo pool `pg`, e não pelo PostgREST. As
// duas leituras abaixo são as do turno: a mesma tabela, a mesma cifra
// (`fn_decrypt_oauth`, que o papel do worker pode chamar). A chave em claro só
// existe na memória do turno.

/** Há chave gravada para o provedor? Nunca lança (`false` na dúvida: o turno cai em texto). */
export async function chaveDeVozConfiguradaNoBanco(
  db: Queryable,
  organizationId: string,
  provedor: ProvedorDeVozId,
): Promise<boolean> {
  try {
    const { rows } = await db.query(
      "select 1 from voice_provider_credentials where organization_id = $1 and provider = $2",
      [organizationId, provedor],
    );
    return rows.length > 0;
  } catch (err) {
    logger.warn("[resposta-em-audio] consulta da chave falhou", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** A chave em claro, ou `null` (sem chave, cifra indisponível, leitura falhou). Nunca lança. */
export async function lerChaveDeVozNoBanco(
  db: Queryable,
  organizationId: string,
  provedor: ProvedorDeVozId,
): Promise<string | null> {
  try {
    const { rows } = await db.query<{ chave: string | null }>(
      `select public.fn_decrypt_oauth(api_key_encrypted) as chave
         from voice_provider_credentials
        where organization_id = $1 and provider = $2`,
      [organizationId, provedor],
    );
    const chave = rows[0]?.chave ?? null;
    return chave && chave.length > 0 ? chave : null;
  } catch (err) {
    logger.warn("[resposta-em-audio] leitura da chave falhou", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

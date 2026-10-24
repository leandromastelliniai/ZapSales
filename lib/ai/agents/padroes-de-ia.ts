/**
 * O que o assistente de criação de agente escolhe SOZINHO da inteligência artificial:
 * qual empresa de IA, qual modelo e qual chave. A pessoa que cria o primeiro agente
 * não vê nada disso — a régua é a mesma do onboarding (`publishFirstVersion`), para
 * os dois caminhos acharem a mesma resposta:
 *
 *  - o provedor é o da ORGANIZAÇÃO (`organizations.settings.llm.provider`);
 *  - a chave é a credencial validada da organização; na falta dela, `null` = a chave
 *    da instalação (`chaveDePlataforma`), que é o caso comum de quem instalou pelo kit;
 *  - o modelo sai do catálogo por `escolherModeloNoCatalogo`, que exige ferramentas.
 *
 * NUNCA LANÇA: devolve o desfecho para a tela decidir o que mostrar. "Sem chave" e
 * "sem modelo" pedem conselhos diferentes, então o motivo viaja.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { chaveDePlataforma } from "@/lib/ai/runtime/agent";

import { escolherModeloNoCatalogo } from "./escolher-modelo";
import { PROVIDERS } from "./validation";

export type PadroesDeIa =
  | { ok: true; provider: (typeof PROVIDERS)[number]; model: string; credentialId: string | null }
  | {
      ok: false;
      motivo: "sem_chave" | "sem_modelo";
      provider: string;
      /** Há uma chave colada que o provedor ainda não confirmou. */
      chaveEmVerificacao?: boolean;
    };

type Provider = (typeof PROVIDERS)[number];

function provedorDaOrganizacao(settings: unknown): Provider {
  const llm = (settings as { llm?: unknown } | null)?.llm;
  const provider = (llm as { provider?: unknown } | null | undefined)?.provider;
  return typeof provider === "string" && (PROVIDERS as readonly string[]).includes(provider)
    ? (provider as Provider)
    : "anthropic";
}

export async function resolverPadroesDeIa(admin: SupabaseClient, orgId: string): Promise<PadroesDeIa> {
  try {
    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", orgId)
      .maybeSingle();
    if (orgErr) return { ok: false, motivo: "sem_modelo", provider: "anthropic" };
    const provider = provedorDaOrganizacao(org?.settings);

    // Modelo ANTES da chave, como no onboarding: catálogo sem modelo utilizável é defeito
    // de instalação, e se resolve antes de se falar em chave.
    const escolha = await escolherModeloNoCatalogo(admin, provider);
    if (!escolha || !escolha.escolhido) return { ok: false, motivo: "sem_modelo", provider };

    const { data: credencial } = await admin
      .from("ai_provider_credentials")
      .select("id")
      .eq("organization_id", orgId)
      .eq("provider", provider)
      .eq("is_active", true)
      // Uma credencial que o provedor ainda não confirmou não serve ao turno.
      .not("validated_at", "is", null)
      .limit(1)
      .maybeSingle();
    const credentialId = (credencial?.id as string | undefined) ?? null;

    if (!credentialId && !chaveDePlataforma(provider)) {
      const { data: pendente } = await admin
        .from("ai_provider_credentials")
        .select("provider")
        .eq("organization_id", orgId)
        .eq("provider", provider)
        .eq("is_active", true)
        .is("validated_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { ok: false, motivo: "sem_chave", provider, chaveEmVerificacao: Boolean(pendente?.provider) };
    }

    return { ok: true, provider, model: escolha.modelId, credentialId };
  } catch {
    return { ok: false, motivo: "sem_modelo", provider: "anthropic" };
  }
}

/**
 * O funil de entrada da organização, onde o agente que mexe no funil passa a poder
 * trabalhar. Falha ou ausência = `null` (escopo vazio): mexer no funil errado é pior
 * que não mexer em nenhum. Mesma consulta do onboarding.
 */
export async function funilPadraoDaOrg(admin: SupabaseClient, orgId: string): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("crm_pipelines")
      .select("id")
      .eq("organization_id", orgId)
      .eq("is_default", true)
      .eq("is_archived", false)
      .maybeSingle();
    if (error) return null;
    return (data?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

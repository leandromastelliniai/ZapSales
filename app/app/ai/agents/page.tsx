import { CabecalhoDePagina } from "@/components/shell/CabecalhoDePagina";
import { ComoFunciona } from "@/components/shell/ComoFunciona";
import { CorpoDaPagina } from "@/components/shell/CorpoDaPagina";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Plus } from "@/lib/ui/icons";
import { listSelectableChannels } from "@/lib/channels/selectable";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import type { AgentRow } from "@/hooks/ai/useAgent";
import { AgentsList } from "./_components/AgentsList";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `versao_publicada` vem por join porque `ai_agents.model` é o valor do CADASTRO:
 * para `mcp_agent`, quem responde é `ai_agent_versions.model` da versão publicada,
 * e publicar não sincroniza a coluna de cima. Sem este join a lista anunciaria
 * para sempre o modelo escolhido no dia da criação.
 */
const AGENT_COLUMNS =
  "id, organization_id, name, description, model, system_prompt, is_active, is_default, kind, priority, published_version_id, paused_at, operation_mode, operation_revision, archived_at, config, guardrails, active_kb_version_id, created_at, updated_at, " +
  "versao_publicada:ai_agent_versions!ai_agents_published_version_id_fkey(provider, model, channel_session_id)";

export default async function AgentsListPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  const supabase = await createClient();
  const [{ data, error }, canais] = await Promise.all([
    supabase
      .from("ai_agents")
      .select(AGENT_COLUMNS)
      .eq("organization_id", activeOrg.orgId)
      .order("created_at", { ascending: false }),
    // Para a linha de cada agente dizer POR QUAL NÚMERO ele atende — a pergunta
    // que o dono faz primeiro, e que a lista não respondia.
    listSelectableChannels(supabase, activeOrg.orgId),
  ]);
  const nomesDosNumeros: Record<string, string> = Object.fromEntries(
    canais.map((c) => [c.id, c.phone_number ? `${c.display_name} · ${c.phone_number}` : c.display_name]),
  );

  // Sem ler o `error`, "não consegui perguntar" e "você não tem agente nenhum"
  // pintam a MESMA tela — e a segunda é uma afirmação forte sobre o trabalho de
  // quem instalou. O join por nome de constraint (`versao_publicada`) acrescentou
  // uma causa nova de erro a esta consulta, então a distinção passou a importar.
  // Degradar para lista vazia continua sendo o comportamento (a tela não pode
  // quebrar), mas agora deixa rastro.
  if (error) {
    logger.error("[ai/agents] não consegui listar os agentes — a tela vai parecer vazia", {
      organization_id: activeOrg.orgId,
      detail: error.message.slice(0, 200),
    });
  }

  const agents = (data ?? []) as unknown as AgentRow[];
  const canWrite = ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin;
  const idioma = user.idioma;

  return (
    <CorpoDaPagina>
      <CabecalhoDePagina
        titulo={traduzir("Agentes de IA", idioma)}
        ajuda={<ComoFunciona chave="agentes" pagina={traduzir("Agentes de IA", idioma)} />}
        descricao={traduzir("Configure o jeito de atender dos agentes que respondem no WhatsApp.", idioma)}
        acoes={
          canWrite && agents.length > 0 ? (
            <Button asChild>
              <Link href="/app/ai/agents/new">
                <Plus size={16} aria-hidden /> {traduzir("Novo agente", idioma)}
              </Link>
            </Button>
          ) : null
        }
      />
      <AgentsList initialData={agents} canWrite={canWrite} nomesDosNumeros={nomesDosNumeros} />
    </CorpoDaPagina>
  );
}

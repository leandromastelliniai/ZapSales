import { notFound, redirect } from "next/navigation";

import { createSupabaseFollowupGateDb } from "@/lib/followup/agent-followup-gate";
import { rascunhoDoFluxo } from "@/lib/followup/rascunho";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FollowupFlowDetailRow } from "@/hooks/followup/useFollowupFlow";
import { FlowBuilder } from "./_components/FlowBuilder";

export const dynamic = "force-dynamic";

const DETAIL_COLUMNS =
  "id, name, status, active_version_id, draft_graph, handoff_policy, trigger_config, surface, created_at, updated_at";

export default async function FollowupFlowBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  const supabase = await createClient();
  const [{ data: pointer }, { data: versionRows }] = await Promise.all([
    supabase
      .from("followup_flow_pointers")
      .select(DETAIL_COLUMNS)
      .eq("id", id)
      .eq("organization_id", activeOrg.orgId)
      // Roteiro de atendimento não abre no editor de follow-up (prova do #1130).
      .neq("surface", "atendimento")
      .maybeSingle(),
    supabase
      .from("followup_flow_versions")
      .select("id, created_at")
      .eq("organization_id", activeOrg.orgId)
      .eq("pointer_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!pointer) notFound();

  // Mesma regra da rota: rascunho ausente COM versão publicada abre o que está
  // NO AR. Ver `lib/followup/rascunho.ts`.
  const draft_graph = await rascunhoDoFluxo(
    supabase,
    pointer as unknown as { draft_graph: unknown; active_version_id: string | null },
    activeOrg.orgId,
  );

  const flow: FollowupFlowDetailRow = {
    ...(pointer as unknown as Omit<FollowupFlowDetailRow, "versions_count" | "previous_version_id">),
    draft_graph,
    versions_count: versionRows?.length ?? 0,
    previous_version_id: versionRows?.[1]?.id ?? null,
  };

  // Quem arma este fluxo: os agentes PUBLICADOS da organização com follow-up ligado que o têm em
  // `flow_pointer_ids` (o mesmo gate que o motor usa para disparar). A faixa "Vai disparar?" os
  // cita. A organização vem da sessão, nunca de parâmetro; falhou a leitura, a lista vem vazia e
  // o resto da tela segue.
  const agentesQueArmam = await agentesQueArmamOFluxo(activeOrg.orgId, id);

  return (
    <div className="flex h-full flex-col">
      <FlowBuilder flowId={id} initialData={flow} agentesQueArmam={agentesQueArmam} />
    </div>
  );
}

async function agentesQueArmamOFluxo(orgId: string, pointerId: string): Promise<Array<{ id: string; name: string }>> {
  try {
    const admin = createAdminClient();
    const habilitados = await createSupabaseFollowupGateDb(admin).loadEnabledPublishedFollowupAgents(orgId);
    const ids = habilitados.filter((a) => a.pointerIds.includes(pointerId)).map((a) => a.agentId);
    if (ids.length === 0) return [];
    const { data } = await admin.from("ai_agents").select("id, name").eq("organization_id", orgId).in("id", ids);
    return ((data ?? []) as Array<{ id: string; name: string }>).map((a) => ({ id: a.id, name: a.name }));
  } catch {
    return [];
  }
}

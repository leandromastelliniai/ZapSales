import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { listSelectableChannels } from "@/lib/channels/selectable";
import { createClient } from "@/lib/supabase/server";
import type { CredentialRow } from "@/hooks/ai/useCredentials";

import { lerAmbiente } from "@/lib/instalacao/ambiente";
import { fusoUtilizavel } from "@/lib/tempo/fusos";

import { createAdminClient } from "@/lib/supabase/admin";
import { capacidadesPorModelo } from "@/lib/ai/agents/capacidades-do-modelo";
import { funilPadraoDaOrg, resolverPadroesDeIa } from "@/lib/ai/agents/padroes-de-ia";

import { AssistenteDeAgente } from "./_assistente/AssistenteDeAgente";
import { EditorComEstadoDoAssistente } from "./_assistente/EditorComEstadoDoAssistente";

export const dynamic = "force-dynamic";

const CREDENTIAL_COLUMNS =
  "id, organization_id, provider, label, api_key_last4, validated_at, validation_error, models_available, is_active, created_by, created_at, updated_at";

/**
 * Os provedores cuja chave veio na INSTALAÇÃO (`.env`), não da tela de
 * Credenciais.
 *
 * Sai de `lerAmbiente`, a mesma leitura que o retrato da instalação usa — uma
 * segunda lista de nomes de variável divergiria no dia em que um provedor novo
 * entrasse.
 */
function provedoresDaInstalacao(): string[] {
  const a = lerAmbiente();
  return Object.entries(a.chavesDeProvedor)
    .filter(([, tem]) => tem)
    .map(([id]) => id);
}

export default async function NewAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  // `?modo=assistente` abre o assistente guiado; qualquer outra coisa, o editor completo
  // de sempre (que continua sendo o que as specs e os links antigos esperam nesta rota).
  const { modo } = await searchParams;
  if (modo === "assistente") {
    // Service role: o `organization_id` vem da sessão (`resolveActiveOrg`), nunca da URL.
    const admin = createAdminClient();
    const [padroes, funilPadraoId] = await Promise.all([
      resolverPadroesDeIa(admin, activeOrg.orgId),
      funilPadraoDaOrg(admin, activeOrg.orgId),
    ]);
    return <AssistenteDeAgente
        padroes={padroes}
        funilPadraoId={funilPadraoId}
        capacidades={capacidadesPorModelo()}
        idiomaDaTela={user.idioma}
      />;
  }

  const supabase = await createClient();
  const [orgRes, credentialsRes, channelSessions, funilPadraoId] = await Promise.all([
    // O provedor que a organização JÁ usa: sem ele, o agente novo nascia
    // `anthropic` e o formulário pedia "Cadastrar credencial anthropic" para
    // quem só tem chave da OpenAI.
    supabase.from("organizations").select("settings").eq("id", activeOrg.orgId).maybeSingle(),
    supabase
      .from("ai_provider_credentials_safe")
      .select(CREDENTIAL_COLUMNS)
      .eq("organization_id", activeOrg.orgId),
    listSelectableChannels(supabase, activeOrg.orgId),
    // O funil de entrada, para o modelo da galeria que mexe no funil já nascer com escopo.
    funilPadraoDaOrg(createAdminClient(), activeOrg.orgId),
  ]);

  const credentials = (credentialsRes.data ?? []) as CredentialRow[];
  const llmDaOrg = (
    orgRes.data?.settings as { llm?: { provider?: string } } | null
  )?.llm;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <EditorComEstadoDoAssistente
        capacidadesPorModelo={capacidadesPorModelo()}
        funilPadraoId={funilPadraoId}
        credentials={credentials}
        provedoresDaInstalacao={provedoresDaInstalacao()}
        provedorPadrao={llmDaOrg?.provider}
        channelSessions={channelSessions}
        organizationTimezone={fusoUtilizavel(activeOrg.timezone)}
      />
    </div>
  );
}

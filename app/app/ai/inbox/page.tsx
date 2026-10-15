import { CabecalhoDePagina } from "@/components/shell/CabecalhoDePagina";
import { ComoFunciona } from "@/components/shell/ComoFunciona";
import { CorpoDaPagina } from "@/components/shell/CorpoDaPagina";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { AgentInboxList } from "./_components/AgentInboxList";

export const dynamic = "force-dynamic";

export default async function AgentInboxPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const canResolve = ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;
  const idioma = user.idioma;

  return (
    <CorpoDaPagina>
      <CabecalhoDePagina
        titulo={traduzir("Central de avisos", idioma)}
        ajuda={<ComoFunciona chave="alertas" pagina={traduzir("Central de avisos", idioma)} />}
        descricao={traduzir(
            "O que o assistente precisou escalar para o time: conexões caídas, tarefas que falharam, atendimentos passados a humanos.",
            idioma,
          )}
      />
      <AgentInboxList canResolve={canResolve} />
    </CorpoDaPagina>
  );
}

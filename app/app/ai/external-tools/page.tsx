import { CabecalhoDePagina } from "@/components/shell/CabecalhoDePagina";
import { CorpoDaPagina } from "@/components/shell/CorpoDaPagina";
import { redirect } from "next/navigation";

import { listarFerramentas } from "@/lib/ai/ferramentas-externas/repositorio";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { FerramentasExternasClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * FERRAMENTAS EXTERNAS DO AGENTE (issue #94).
 *
 * Os webhooks de consulta que o agente chama no meio da conversa para olhar outro
 * sistema (estoque, planilha, ERP, Make, n8n). Esta tela é o cadastro e o teste; quais
 * agentes podem usar cada uma é escolhido na tela do agente (grupo "Ferramentas
 * externas" do seletor de capacidades).
 *
 * A tabela é só do servidor (guarda a chave de assinatura): a lista vem do admin client
 * com a organização da SESSÃO, nunca de parâmetro da URL.
 */
export default async function FerramentasExternasPage() {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  const inicial = await listarFerramentas(createAdminClient(), activeOrg.orgId).catch(() => []);

  return (
    <CorpoDaPagina>
      <CabecalhoDePagina
        titulo={t("Ferramentas externas")}
        descricao={t(
          "Consultas a outro sistema (estoque, planilha, ERP, Make, n8n) que o agente faz durante a conversa. Você cadastra, testa de verdade e escolhe, na tela do agente, quem pode usar.",
        )}
      />
      <FerramentasExternasClient inicial={inicial} />
    </CorpoDaPagina>
  );
}

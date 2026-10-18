import { CabecalhoDePagina } from "@/components/shell/CabecalhoDePagina";
import { CorpoDaPagina } from "@/components/shell/CorpoDaPagina";
import { redirect } from "next/navigation";

import { listarFerramentas } from "@/lib/ai/ferramentas-externas/repositorio";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { AbasDeFerramentas } from "./_abas";

export const dynamic = "force-dynamic";

/**
 * FERRAMENTAS EXTERNAS DO AGENTE (issues #94, #95 e #96).
 *
 * Duas abas: os webhooks que o agente chama no meio da conversa para olhar ou mexer em outro
 * sistema (estoque, planilha, ERP, Make, n8n) e os servidores MCP de terceiros (desligados por
 * padrão, só para administrador). Esta tela é o cadastro e o teste; quais agentes podem usar cada
 * ferramenta é escolhido na tela do agente (grupo "Ferramentas externas" do seletor).
 *
 * A tabela é só do servidor (guarda a chave de assinatura): a lista vem do admin client
 * com a organização da SESSÃO, nunca de parâmetro da URL.
 */
export default async function FerramentasExternasPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const { aba } = await searchParams;
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  const inicial = await listarFerramentas(createAdminClient(), activeOrg.orgId, { tipo: "webhook" }).catch(() => []);
  // Os servidores MCP são de quem administra a organização (a integração leva credencial de terceiro).
  const souAdmin = (user.is_platform_admin && !user.support) || ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin;

  return (
    <CorpoDaPagina>
      <CabecalhoDePagina
        titulo={t("Ferramentas externas")}
        descricao={t(
          "Consultas e ações em outro sistema (estoque, planilha, ERP, Make, n8n) que o agente faz durante a conversa. Você cadastra, testa de verdade e escolhe, na tela do agente, quem pode usar.",
        )}
      />
      <AbasDeFerramentas inicial={inicial} souAdmin={souAdmin} abaInicial={aba === "mcp" ? "mcp" : "webhooks"} />
    </CorpoDaPagina>
  );
}

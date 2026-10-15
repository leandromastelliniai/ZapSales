import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { ROLE_RANK } from "@/lib/auth/types";
import { CabecalhoDePagina } from "@/components/shell/CabecalhoDePagina";
import { ComoFunciona } from "@/components/shell/ComoFunciona";
import { CorpoDaPagina } from "@/components/shell/CorpoDaPagina";
import { AuditClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Auditoria" };

export default async function AuditPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const idioma = user.idioma;
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }
  const t = (texto: string) => traduzir(texto, user.idioma);

  return (
    <CorpoDaPagina>
      <CabecalhoDePagina
        titulo={t("Auditoria")}
        descricao={t("Quem mudou o quê, e quando. O histórico não se apaga. Só gestores veem.")}
        ajuda={<ComoFunciona chave="auditoria" pagina={t("Auditoria")} />}
      />
      <AuditClient />
    </CorpoDaPagina>
  );
}

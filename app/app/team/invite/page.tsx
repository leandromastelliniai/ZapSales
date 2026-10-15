import { CabecalhoDePagina } from "@/components/shell/CabecalhoDePagina";
import { CorpoDaPagina } from "@/components/shell/CorpoDaPagina";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { InviteForm } from "./_components/InviteForm";

export const dynamic = "force-dynamic";

export default async function TeamInvitePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <CorpoDaPagina>
      <CabecalhoDePagina
        titulo={t("Convidar membros")}
        descricao={t("Cole até 20 emails (um por linha) e escolha a role compartilhada.")}
      />
      <InviteForm />
    </CorpoDaPagina>
  );
}

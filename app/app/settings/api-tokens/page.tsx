import { CabecalhoDePagina } from "@/components/shell/CabecalhoDePagina";
import { ComoFunciona } from "@/components/shell/ComoFunciona";
import { CorpoDaPagina } from "@/components/shell/CorpoDaPagina";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { ApiTokensClient } from "./_components/ApiTokensClient";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

export default async function ApiTokensPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const idioma = user.idioma;

  return (
    <CorpoDaPagina>
      <CabecalhoDePagina
        titulo={"API Tokens"}
        ajuda={<ComoFunciona chave="api-tokens" pagina={"API Tokens"} />}
        descricao={
          <>
            {traduzir("Chaves de acesso para outros sistemas falarem com este. O texto da chave aparece", idioma)}{" "}
            <strong>{traduzir("uma única vez", idioma)}</strong>{" "}
            {traduzir("na criação.", idioma)}
          </>
        }
      />
      <ApiTokensClient />
    </CorpoDaPagina>
  );
}

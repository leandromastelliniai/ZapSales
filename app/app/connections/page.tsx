import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { ConexoesShell } from "@/components/connections/ConexoesShell";
import { traduzir } from "@/lib/i18n/dicionario";
import { CabecalhoDePagina } from "@/components/shell/CabecalhoDePagina";
import { ComoFunciona } from "@/components/shell/ComoFunciona";
import { CorpoDaPagina } from "@/components/shell/CorpoDaPagina";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Conexões" };

export default async function ConnectionsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const idioma = user.idioma;

  const key = process.env.WAHA_API_KEY;
  const wahaConfigured = Boolean(
    process.env.WAHA_API_BASE_URL && key && key !== "dev_plaintext_change_me",
  );
  const wacallsConfigured = Boolean(process.env.WACALLS_API_BASE_URL);

  return (
    <CorpoDaPagina>
      <CabecalhoDePagina
        titulo={traduzir("Conexões", idioma)}
        descricao={traduzir(
          "Por onde seu negócio fala com o cliente. Conecte números por QR ou o número oficial da Meta, e acompanhe a saúde de cada um.",
          idioma,
        )}
        ajuda={<ComoFunciona chave="conexoes" pagina={traduzir("Conexões", idioma)} />}
      />
      <ConexoesShell
        wahaConfigured={wahaConfigured}
        wacallsConfigured={wacallsConfigured}
      />
    </CorpoDaPagina>
  );
}

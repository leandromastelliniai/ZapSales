import { CabecalhoDePagina } from "@/components/shell/CabecalhoDePagina";
import { ComoFunciona } from "@/components/shell/ComoFunciona";
import { CorpoDaPagina } from "@/components/shell/CorpoDaPagina";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import { TrunkSettingsClient, type TrunkSettingsRow } from "./_client";

export const dynamic = "force-dynamic";

const SAFE_COLUMNS =
  "organization_id, host, port, username, password_last4, from_domain, endpoint_name, is_active, updated_by, created_at, updated_at";

export default async function TrunkSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }
  const idioma = user.idioma;

  const supabase = await createClient();
  const { data } = await supabase
    .from("voip_trunk_settings_safe")
    .select(SAFE_COLUMNS)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();

  const canWrite = ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin;

  return (
    <CorpoDaPagina>
      <CabecalhoDePagina
        titulo={traduzir("Linha telefônica (SIP)", idioma)}
        ajuda={<ComoFunciona chave="linha-telefonica" pagina={traduzir("Linha telefônica (SIP)", idioma)} />}
        descricao={<>{traduzir(
            "Credenciais de registro do seu provedor SIP (Asterisk/AudioSocket). Depois de salvar, aplique o bloco abaixo em",
            idioma,
          )}{" "}
          <code>asterisk/pjsip.conf</code>{" "}
          {traduzir("na VPS — a aplicação ainda é manual.", idioma)}</>}
      />
      <TrunkSettingsClient initialData={(data as TrunkSettingsRow | null) ?? null} canWrite={canWrite} />
    </CorpoDaPagina>
  );
}

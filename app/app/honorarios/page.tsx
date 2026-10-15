import { CorpoDaPagina } from "@/components/shell/CorpoDaPagina";
import { ComoFunciona } from "@/components/shell/ComoFunciona";
import { CabecalhoDePagina } from "@/components/shell/CabecalhoDePagina";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";

import { Honorarios } from "./_client";

export const dynamic = "force-dynamic";

/**
 * HONORÁRIOS — módulo opcional (ADR-0002): contrato de cobrança do caso (fixo,
 * êxito ou misto) e o calendário de parcelas que dele decorre.
 *
 * `viewer` lê; criar contrato e parcela, e marcar parcela como paga, exige
 * `manager`+ — dinheiro não é coisa que `agent` configure, mesma régua do
 * catálogo financeiro e da migration 0480.
 */
export default async function Page() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");

  const t = (texto: string) => traduzir(texto, user.idioma);

  return (
    <CorpoDaPagina className="min-h-0 flex-1 gap-4">
      <CabecalhoDePagina
        titulo={t("Honorários")}
        descricao={t("O modelo de cobrança de cada caso e o calendário de parcelas.")}
        ajuda={<ComoFunciona chave="honorarios" pagina={t("Honorários")} />}
      />
      <Honorarios podeGerenciar={ROLE_RANK[org.role] >= ROLE_RANK.manager} />
    </CorpoDaPagina>
  );
}

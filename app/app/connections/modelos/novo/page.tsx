import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";

import { NovoModelo } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Criar modelo" };

/** Mesmo piso de Conexões: o modelo é configuração do canal e, aprovado, custa a cada envio. */
export default async function NovoModeloPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  return <NovoModelo />;
}

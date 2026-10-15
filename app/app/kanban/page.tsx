import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import type { EtapaDaLinha } from "@/components/inbox/visual/LinhaDoFunil";
import { FunisClient, type FunilDaLista } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Funis" };

/**
 * A lista de funis — e o lugar onde eles se gerenciam.
 *
 * ⚠️ O FILTRO DE `organization_id` NÃO É REDUNDANTE COM A RLS, e a falta dele era
 * um bug visível: a policy `crm_pipelines_select` libera TODAS as organizações do
 * usuário (`organization_id in fn_user_org_ids()`) e libera tudo para
 * `fn_is_platform_admin()`. Quem participa de duas organizações via as duas
 * listas misturadas — e como o gatilho `trg_seed_default_pipeline_for_org` semeia
 * um funil "Pedidos" em toda organização nova, a tela mostrava várias linhas
 * idênticas, indistinguíveis, cada uma levando a um quadro diferente. A RLS
 * responde "pode ver?"; a tela precisa responder "quer ver agora?".
 *
 * ⚠️ A LEITURA É ABERTA, A ESCRITA É manager+. Ver a lista e abrir o quadro é
 * trabalho de qualquer papel; criar, renomear, reordenar e arquivar é
 * configuração — e é o que `requireRole("manager")` cobra nas rotas.
 * `podeGerenciar` usa o MESMO critério delas (o papel na organização ativa, sem
 * atalho de platform admin, que as rotas não concedem por padrão): mostrar um
 * botão que o servidor recusaria seria prometer o que não se cumpre.
 */
export default async function KanbanPickerPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_pipelines")
    // `is_client_pipeline` entra: sem ela o selo "Clientes" não aparecia ao
    // carregar a página e o botão sempre oferecia "Funil de clientes", mesmo no
    // funil já marcado — só o corpo de um PATCH trazia a coluna.
    //
    // ⚠️ `is_archived` DEIXOU DE SER FILTRO E VIROU COLUNA (#979). Antes a
    // consulta cortava os arquivados no banco, e o resultado era um funil
    // invisível e indestrutível: quem arquivou não tinha como ver, tirar do
    // arquivo nem excluir o que arquivou. A separação passou para a partição
    // abaixo — a lista de trabalho continua só com os vivos.
    .select("id, name, slug, description, position, is_default, is_client_pipeline, is_archived")
    .eq("organization_id", activeOrg.orgId)
    .order("position");

  const todos = (data ?? []) as Array<FunilDaLista & { is_archived: boolean }>;
  const funis = todos.filter((f) => !f.is_archived);
  const podeGerenciar = ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  // O arquivo só vai para quem pode mexer nele: tirar do arquivo e excluir são
  // `requireRole("manager")` nas rotas, e mostrar a gaveta a quem receberia 403
  // seria prometer o que não se cumpre — mesmo critério de `podeGerenciar`.
  const arquivados = podeGerenciar ? todos.filter((f) => f.is_archived) : [];
  // Importar planilha é ESCRITA DE OPERAÇÃO, não configuração: quem atende
  // sobe a lista que recebeu. Espelha o `requireRole("agent")` da rota.
  const podeImportar = ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;
  // A Linha do Funil de cada funil na lista: as etapas vivas, na ordem. O filtro de organização NÃO é
  // redundante com a RLS pelo mesmo motivo da consulta de cima (quem participa de duas organizações).
  const idsDosFunis = funis.map((f) => f.id);
  const { data: etapas } = idsDosFunis.length
    ? await supabase
        .from("crm_stages")
        .select("id, pipeline_id, name, is_lost, position")
        .eq("organization_id", activeOrg.orgId)
        .eq("is_archived", false)
        .in("pipeline_id", idsDosFunis)
        .order("position")
    : { data: [] };
  const etapasPorFunil: Record<string, EtapaDaLinha[]> = {};
  for (const e of etapas ?? []) {
    (etapasPorFunil[e.pipeline_id] ??= []).push({ id: e.id, nome: e.name, perdida: e.is_lost });
  }

  return (
    <FunisClient
      funis={funis}
      arquivados={arquivados}
      podeGerenciar={podeGerenciar}
      podeImportar={podeImportar}
      etapasPorFunil={etapasPorFunil}
    />
  );
}
